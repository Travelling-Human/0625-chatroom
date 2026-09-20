require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const Room = require('./models/Room');
const Message = require('./models/Message');
const Consent = require('./models/Consent');
const Ban = require('./models/Ban');
const { generateHandle, deterministicHandle } = require('./utils/handles');

const PORT = process.env.PORT || 3000;
const MAX_VOICE_SECONDS = Number(process.env.MAX_VOICE_SECONDS || 60);
const MAX_VOICE_BYTES = Number(process.env.MAX_VOICE_BYTES || 2 * 1024 * 1024);
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const HANDLE_SALT = process.env.HANDLE_SALT || 'default-salt-change-me';

if (!MONGODB_URI) {
  console.error('\n[FATAL] MONGODB_URI is not set. Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

if (!ADMIN_KEY) {
  console.warn('\n[WARN] ADMIN_KEY is not set. The admin console (/admin.html) will be disabled until you set one in .env.\n');
}

// ---------- App setup ----------
const app = express();
// Render (and most PaaS hosts) sit behind a reverse proxy. Without this,
// req.ip would return the proxy's address instead of the visitor's.
app.set('trust proxy', true);

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 8 * 1024 * 1024 // allow base64 voice payloads through sockets
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function bufferToBase64(value) {
  if (!value) return '';
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value.buffer) return Buffer.from(value.buffer).toString('base64'); // BSON Binary wrapper
  return Buffer.from(value).toString('base64');
}

// Protects /api/admin/* routes. Requires an X-Admin-Key header matching ADMIN_KEY.
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'ADMIN_DISABLED' });
  const provided = (req.headers['x-admin-key'] || '').toString();
  if (!safeEqual(provided, ADMIN_KEY)) {
    return res.status(401).json({ error: 'INVALID_ADMIN_KEY' });
  }
  next();
}

async function isBanned(ipAddress) {
  if (!ipAddress) return false;
  const hit = await Ban.findOne({ ipAddress }).select('_id').lean();
  return !!hit;
}

// In-memory live user counts per room (resets on server restart, by design — no accounts/state to persist)
const roomUsers = new Map(); // roomId -> Set<socketId>

function addUser(roomId, socketId) {
  if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Set());
  roomUsers.get(roomId).add(socketId);
}
function removeUser(roomId, socketId) {
  const set = roomUsers.get(roomId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) roomUsers.delete(roomId);
}
function userCount(roomId) {
  return roomUsers.get(roomId)?.size || 0;
}

// ---------- REST API ----------
app.get('/sigmundu.html', (req, res) => res.sendFile('/etc/secrets/sigmundu.html'));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/me/handle', (req, res) => {
  const handle = deterministicHandle(req.ip, HANDLE_SALT);
  res.json({ handle });
});

// Log an age/terms acceptance — written once per accept click, for legal record-keeping.
app.post('/api/consent', async (req, res) => {
  try {
    const termsVersion = Number(req.body.version) || 1;
    await Consent.create({
      ipAddress: req.ip,
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300),
      termsVersion
    });
    res.status(201).json({ status: 'logged' });
  } catch (err) {
    console.error(err);
    // Non-fatal: the client lets people through locally even if this write fails,
    // so we don't need to be strict here — just don't crash.
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// List public rooms, most recently active first
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Room.find({ isPrivate: false })
      .sort({ lastActivity: -1 })
      .limit(100)
      .select('roomId topic createdAt lastActivity -_id')
      .lean();

    const roomIds = rooms.map(r => r.roomId);
    const counts = await Message.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));

    const result = rooms.map(r => ({
      ...r,
      messageCount: countMap[r.roomId] || 0,
      online: userCount(r.roomId)
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Create a new room. Returns the owner token ONCE — client must store it.
app.post('/api/rooms', async (req, res) => {
  try {
    if (await isBanned(req.ip)) {
      return res.status(403).json({ error: 'BANNED' });
    }

    const topic = (req.body.topic || '').toString().trim().slice(0, 120);
    const isPrivate = Boolean(req.body.isPrivate);

    if (!topic) {
      return res.status(400).json({ error: 'TOPIC_REQUIRED' });
    }

    const roomId = nanoid(8);
    const ownerToken = crypto.randomBytes(20).toString('hex');
    const ownerTokenHash = hashToken(ownerToken);

    await Room.create({ roomId, topic, isPrivate, ownerTokenHash });

    res.status(201).json({ roomId, ownerToken, topic, isPrivate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Fetch a single room's public info (works for private rooms too — link/code is the access control)
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .select('roomId topic isPrivate createdAt lastActivity -_id')
      .lean();
    if (!room) return res.status(404).json({ error: 'CHANNEL_NOT_FOUND' });
    res.json({ ...room, online: userCount(room.roomId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Toggle a room's visibility — requires the owner token issued at creation
app.patch('/api/rooms/:roomId', async (req, res) => {
  try {
    const { ownerToken, isPrivate } = req.body;
    if (!ownerToken) return res.status(400).json({ error: 'OWNER_TOKEN_REQUIRED' });

    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ error: 'CHANNEL_NOT_FOUND' });

    if (!safeEqual(hashToken(ownerToken), room.ownerTokenHash)) {
      return res.status(403).json({ error: 'INVALID_OWNER_TOKEN' });
    }

    room.isPrivate = Boolean(isPrivate);
    await room.save();

    res.json({ roomId: room.roomId, topic: room.topic, isPrivate: room.isPrivate });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Message history (text + voice). Voice audio is returned as base64.
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const room = await Room.findOne({ roomId: req.params.roomId }).select('roomId').lean();
    if (!room) return res.status(404).json({ error: 'CHANNEL_NOT_FOUND' });

    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    messages.reverse();

    const result = messages.map(m => ({
      type: m.type,
      handle: m.handle,
      content: m.type === 'text' ? m.content : undefined,
      audioBase64: m.type === 'voice' ? bufferToBase64(m.audioData) : undefined,
      mimeType: m.mimeType,
      duration: m.duration,
      createdAt: m.createdAt
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ---------- Admin (moderation) API — all require X-Admin-Key ----------
// List ALL rooms (public + private) — for admin oversight only
app.get('/api/admin/rooms', requireAdmin, async (req, res) => {
  try {
    const rooms = await Room.find()
      .sort({ lastActivity: -1 })
      .limit(500)
      .select('roomId topic isPrivate createdAt lastActivity -_id')
      .lean();

    const roomIds = rooms.map(r => r.roomId);
    const counts = await Message.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.count]));

    res.json(rooms.map(r => ({
      roomId: r.roomId,
      topic: r.topic,
      isPrivate: r.isPrivate,
      messageCount: countMap[r.roomId] || 0,
      online: userCount(r.roomId),
      createdAt: r.createdAt,
      lastActivity: r.lastActivity
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});
// List current bans, most recent first
app.get('/api/admin/bans', requireAdmin, async (req, res) => {
  try {
    const bans = await Ban.find().sort({ bannedAt: -1 }).limit(500).lean();
    res.json(bans.map(b => ({
      ipAddress: b.ipAddress,
      reason: b.reason || '',
      bannedAt: b.bannedAt
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Ban an IP (upsert — banning an already-banned IP just updates the reason)
app.post('/api/admin/bans', requireAdmin, async (req, res) => {
  try {
    const ipAddress = (req.body.ipAddress || '').toString().trim().slice(0, 64);
    const reason = (req.body.reason || '').toString().trim().slice(0, 300);
    if (!ipAddress) return res.status(400).json({ error: 'IP_REQUIRED' });

    await Ban.findOneAndUpdate(
      { ipAddress },
      { ipAddress, reason, bannedAt: new Date() },
      { upsert: true }
    );

    // Disconnect anyone currently connected from that IP, immediately.
    for (const [, s] of io.of('/').sockets) {
      if (s.handshake.address === ipAddress) {
        s.emit('error-message', 'BANNED');
        s.disconnect(true);
      }
    }

    res.status(201).json({ status: 'banned', ipAddress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Unban an IP
app.delete('/api/admin/bans/:ipAddress', requireAdmin, async (req, res) => {
  try {
    await Ban.deleteOne({ ipAddress: req.params.ipAddress });
    res.json({ status: 'unbanned' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// Moderation view of a room's messages — same as the public history endpoint,
// but includes the sender's IP address so an admin can act on it.
app.get('/api/admin/rooms/:roomId/messages', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(messages.map(m => ({
      type: m.type,
      handle: m.handle,
      content: m.type === 'text' ? m.content : '[voice message]',
      duration: m.duration,
      ipAddress: m.ipAddress || 'unknown',
      createdAt: m.createdAt
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// ---------- Sockets: live chat ----------
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentHandle = null;
  const clientIp = socket.handshake.address;

  socket.on('join-room', async ({ roomId, handle }) => {
    try {
      if (await isBanned(clientIp)) {
        socket.emit('error-message', 'BANNED');
        socket.disconnect(true);
        return;
      }

      const room = await Room.findOne({ roomId }).select('roomId').lean();
      if (!room) {
        socket.emit('error-message', 'CHANNEL_NOT_FOUND');
        return;
      }

      currentRoom = roomId;
      currentHandle = (handle || generateHandle()).toString().slice(0, 32);

      socket.join(roomId);
      addUser(roomId, socket.id);

      socket.emit('joined', { handle: currentHandle });
      io.to(roomId).emit('user-count', userCount(roomId));
      socket.to(roomId).emit('system-message', `${currentHandle} has connected to the channel.`);
    } catch (err) {
      console.error(err);
      socket.emit('error-message', 'SERVER_ERROR');
    }
  });

  socket.on('chat-message', async ({ text } = {}) => {
    if (!currentRoom || !currentHandle) return;
    const trimmed = (text || '').toString().trim().slice(0, 2000);
    if (!trimmed) return;

    try {
      if (await isBanned(clientIp)) {
        socket.emit('error-message', 'BANNED');
        socket.disconnect(true);
        return;
      }

      const msg = await Message.create({
        roomId: currentRoom,
        type: 'text',
        handle: currentHandle,
        content: trimmed,
        ipAddress: clientIp
      });
      await Room.updateOne({ roomId: currentRoom }, { lastActivity: new Date() });

      io.to(currentRoom).emit('chat-message', {
        handle: currentHandle,
        content: trimmed,
        createdAt: msg.createdAt
      });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('voice-message', async ({ audioData, mimeType, duration } = {}) => {
    if (!currentRoom || !currentHandle) return;
    if (!audioData || typeof audioData !== 'string') return;

    try {
      if (await isBanned(clientIp)) {
        socket.emit('error-message', 'BANNED');
        socket.disconnect(true);
        return;
      }

      const buffer = Buffer.from(audioData, 'base64');
      if (buffer.length === 0) return;
      if (buffer.length > MAX_VOICE_BYTES) {
        socket.emit('error-message', 'VOICE_FILE_TOO_LARGE');
        return;
      }

      const safeDuration = Math.min(Number(duration) || 0, MAX_VOICE_SECONDS);
      const safeMime = (mimeType || 'audio/webm').toString().slice(0, 64);

      const msg = await Message.create({
        roomId: currentRoom,
        type: 'voice',
        handle: currentHandle,
        audioData: buffer,
        mimeType: safeMime,
        duration: safeDuration,
        ipAddress: clientIp
      });
      await Room.updateOne({ roomId: currentRoom }, { lastActivity: new Date() });

      io.to(currentRoom).emit('voice-message', {
        handle: currentHandle,
        audioBase64: audioData,
        mimeType: safeMime,
        duration: safeDuration,
        createdAt: msg.createdAt
      });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('typing', () => {
    if (!currentRoom || !currentHandle) return;
    socket.to(currentRoom).emit('typing', currentHandle);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    removeUser(currentRoom, socket.id);
    io.to(currentRoom).emit('user-count', userCount(currentRoom));
    if (currentHandle) {
      socket.to(currentRoom).emit('system-message', `${currentHandle} has disconnected.`);
    }
  });
});

// ---------- Boot ----------
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('[OK] Connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`[OK] 0625 online at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[FATAL] MongoDB connection failed:', err.message);
    process.exit(1);
  });

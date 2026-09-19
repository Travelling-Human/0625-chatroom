(function () {
  HCConsent.ensure(async function () {
  const params = new URLSearchParams(window.location.search);
  const roomId = (params.get('id') || '').trim();

  const els = {
    title: document.getElementById('room-title'),
    pill: document.getElementById('visibility-pill'),
    online: document.getElementById('online-tag'),
    ownerBtn: document.getElementById('owner-toggle-btn'),
    copyBtn: document.getElementById('copy-link-btn'),
    log: document.getElementById('chat-log'),
    typing: document.getElementById('typing-indicator'),
    input: document.getElementById('msg-input'),
    emojiBtn: document.getElementById('emoji-btn'),
    emojiPanel: document.getElementById('emoji-panel'),
    micBtn: document.getElementById('mic-btn'),
    sendBtn: document.getElementById('send-btn'),
    recIndicator: document.getElementById('rec-indicator'),
    recTimer: document.getElementById('rec-timer'),
    cancelRecBtn: document.getElementById('cancel-rec-btn'),
    composerError: document.getElementById('composer-error'),
    errorModal: document.getElementById('error-modal'),
    errorModalText: document.getElementById('error-modal-text')
  };

  initMatrixRain('matrix-rain');

  function showFatalError(message) {
    els.errorModalText.textContent = message;
    els.errorModal.classList.add('open');
    document.querySelector('.composer').style.display = 'none';
  }

  if (!roomId) {
    runBootSequence(['> ERR: no channel specified.'], () => showFatalError('No channel code was given. Go back and pick a channel, or create one.'));
    return;
  }

  const myHandle = HC.getSessionHandle();
  let roomState = { isPrivate: false, topic: '' };
  let ownerToken = HC.getOwnerToken(roomId);

  const ERROR_MESSAGES = {
    CHANNEL_NOT_FOUND: 'This channel does not exist, or has been deleted.',
    VOICE_FILE_TOO_LARGE: 'That voice message exceeds the size limit.',
    SERVER_ERROR: 'Unexpected server error. Try again.',
    BANNED: 'This device has been banned from 0625 for violating the terms of use.'
  };

  // ---------- rendering helpers ----------

  function isNearBottom() {
    return els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 120;
  }

  function scrollToBottom() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function clearEmptyState() {
    const empty = els.log.querySelector('.empty-state');
    if (empty) empty.remove();
  }

  function appendTextMessage(msg, opts = {}) {
    clearEmptyState();
    const wasNearBottom = isNearBottom();

    const line = document.createElement('div');
    line.className = 'msg-line' + (msg.handle === myHandle ? ' own' : '');

    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = HC.formatClock(msg.createdAt || Date.now());

    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = msg.handle;

    const colon = document.createElement('span');
    colon.className = 'colon';
    colon.textContent = ':~$';

    const content = document.createElement('span');
    content.className = 'content';
    content.textContent = msg.content;

    line.append(ts, handle, colon, content);
    els.log.appendChild(line);

    if (!opts.history && wasNearBottom) scrollToBottom();
    if (opts.history) scrollToBottom();
  }

  function appendSystemMessage(text) {
    clearEmptyState();
    const wasNearBottom = isNearBottom();
    const line = document.createElement('div');
    line.className = 'msg-line system';
    line.textContent = text;
    els.log.appendChild(line);
    if (wasNearBottom) scrollToBottom();
  }

  function appendVoiceMessage(msg, opts = {}) {
    clearEmptyState();
    const wasNearBottom = isNearBottom();

    const line = document.createElement('div');
    line.className = 'msg-line' + (msg.handle === myHandle ? ' own' : '');

    const header = document.createElement('div');
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = HC.formatClock(msg.createdAt || Date.now());
    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.textContent = msg.handle;
    const colon = document.createElement('span');
    colon.className = 'colon';
    colon.textContent = ':~$';
    header.append(ts, handle, colon);

    const voiceBox = document.createElement('div');
    voiceBox.className = 'voice-msg';

    const playBtn = document.createElement('button');
    playBtn.className = 'play-btn';
    playBtn.type = 'button';
    playBtn.textContent = '▶';

    const bars = document.createElement('span');
    bars.className = 'voice-bars';
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('span');
      const h = 3 + Math.round(Math.random() * 11);
      bar.style.height = h + 'px';
      bars.appendChild(bar);
    }

    const label = document.createElement('span');
    label.className = 'voice-label';
    label.textContent = `VOICE_DATA · ${HC.formatDuration(msg.duration)}`;

    let audioEl = null;
    let objectUrl = null;

    playBtn.addEventListener('click', () => {
      if (!audioEl) {
        const byteChars = atob(msg.audioBase64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: msg.mimeType || 'audio/webm' });
        objectUrl = URL.createObjectURL(blob);
        audioEl = new Audio(objectUrl);
        audioEl.addEventListener('ended', () => { playBtn.textContent = '▶'; });
      }
      if (audioEl.paused) {
        audioEl.play();
        playBtn.textContent = '❚❚';
      } else {
        audioEl.pause();
        playBtn.textContent = '▶';
      }
    });

    voiceBox.append(playBtn, bars, label);
    line.append(header, voiceBox);
    els.log.appendChild(line);

    if (!opts.history && wasNearBottom) scrollToBottom();
    if (opts.history) scrollToBottom();
  }

  // ---------- room info + history ----------

  function applyRoomState(room) {
    roomState.isPrivate = room.isPrivate;
    roomState.topic = room.topic;
    els.title.textContent = room.topic;
    document.title = `:// ${room.topic} — 0625`;
    els.pill.style.display = 'inline-block';
    els.pill.textContent = room.isPrivate ? 'private' : 'public';
    els.pill.className = 'visibility-pill ' + (room.isPrivate ? 'private' : 'public');

    if (ownerToken) {
      els.ownerBtn.style.display = 'inline-block';
      els.ownerBtn.textContent = room.isPrivate ? '[ make public ]' : '[ make private ]';
    }
  }

  async function loadRoom() {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'CHANNEL_NOT_FOUND');
    }
    return res.json();
  }

  async function loadHistory() {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages?limit=50`);
    if (!res.ok) return [];
    return res.json();
  }

  els.ownerBtn.addEventListener('click', async () => {
    if (!ownerToken) return;
    els.ownerBtn.disabled = true;
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerToken, isPrivate: !roomState.isPrivate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SERVER_ERROR');
      applyRoomState(data);
      appendSystemMessage(`channel visibility changed to ${data.isPrivate ? 'PRIVATE' : 'PUBLIC'}.`);
    } catch (err) {
      appendSystemMessage('ERR: failed to change visibility (' + err.message + ').');
    } finally {
      els.ownerBtn.disabled = false;
    }
  });

  els.copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'copied!';
      setTimeout(() => { els.copyBtn.textContent = original; }, 1500);
    } catch (err) {
      els.composerError.textContent = 'could not copy — copy the URL manually.';
    }
  });

  // ---------- socket connection ----------

  let socket = null;
  let typingTimeout = null;
  let lastTypingEmit = 0;

  function connectSocket() {
    socket = io();

    socket.on('connect', () => {
      socket.emit('join-room', { roomId, handle: myHandle });
    });

    socket.on('joined', () => {
      appendSystemMessage(`connected as ${myHandle}.`);
    });

    socket.on('chat-message', (msg) => appendTextMessage(msg));
    socket.on('voice-message', (msg) => appendVoiceMessage(msg));
    socket.on('system-message', (text) => appendSystemMessage(text));

    socket.on('user-count', (count) => {
      els.online.textContent = `● ${count} online`;
    });

    socket.on('typing', (handle) => {
      if (handle === myHandle) return;
      els.typing.textContent = `${handle} is transmitting...`;
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => { els.typing.textContent = ''; }, 2000);
    });

    socket.on('error-message', (code) => {
      if (code === 'BANNED') {
        showFatalError(ERROR_MESSAGES.BANNED);
        return;
      }
      els.composerError.textContent = 'ERR: ' + (ERROR_MESSAGES[code] || code);
    });

    socket.on('connect_error', () => {
      appendSystemMessage('connection lost. retrying...');
    });
  }

  // ---------- sending text ----------

  function sendText() {
    const text = els.input.value.trim();
    if (!text || !socket) return;
    socket.emit('chat-message', { text });
    els.input.value = '';
  }

  els.sendBtn.addEventListener('click', sendText);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendText();
  });
  els.input.addEventListener('input', () => {
    const now = Date.now();
    if (socket && now - lastTypingEmit > 1500) {
      socket.emit('typing');
      lastTypingEmit = now;
    }
  });

  // ---------- emoji picker ----------

  const EMOJI_CATEGORIES = [
    {
      label: 'Smileys',
      items: ['😀', '😁', '😂', '🤣', '😅', '😊', '😇', '🙂', '🙃', '😉', '😍', '🥰', '😘',
        '😜', '🤔', '🤨', '😐', '🙄', '😏', '😮', '🤐', '😴', '🤤', '😷', '🥳', '😎',
        '🥺', '😭', '😱', '😡', '🤬', '🥶', '🥵', '😈', '👻', '💀', '🤖', '👽', '🎃']
    },
    {
      label: 'Gestures & people',
      items: ['👍', '👎', '👌', '✌️', '🤞', '🤙', '👋', '🤝', '🙏', '👏', '💪', '🫡',
        '👁️', '🗣️', '🕵️', '🥷', '🧑‍💻']
    },
    {
      label: 'Hearts',
      items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '✨', '🔥', '⭐', '💫']
    },
    {
      label: 'Tech / hacker',
      items: ['💻', '🖥️', '📡', '🛰️', '🔒', '🔓', '🔑', '🛡️', '⚙️', '💾', '📟',
        '⚡', '🚨', '📶', '🛠️', '👾', '🎮']
    },
    {
      label: 'Symbols',
      items: ['✅', '❌', '❓', '❗', '⚠️', '♻️', '🔁', '▶️', '⏸️', '🔇', '🔊', '📍', '🔗']
    }
  ];

  function insertEmoji(emoji) {
    const input = els.input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    const newPos = start + emoji.length;
    input.focus();
    input.setSelectionRange(newPos, newPos);
  }

  function buildEmojiPanel() {
    EMOJI_CATEGORIES.forEach((cat) => {
      const label = document.createElement('div');
      label.className = 'emoji-cat-label';
      label.textContent = cat.label;

      const grid = document.createElement('div');
      grid.className = 'emoji-grid';
      cat.items.forEach((emoji) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = emoji;
        btn.addEventListener('click', () => insertEmoji(emoji));
        grid.appendChild(btn);
      });

      els.emojiPanel.append(label, grid);
    });
  }

  function toggleEmojiPanel(forceState) {
    const open = typeof forceState === 'boolean'
      ? forceState
      : !els.emojiPanel.classList.contains('open');
    els.emojiPanel.classList.toggle('open', open);
    els.emojiBtn.classList.toggle('active', open);
  }

  buildEmojiPanel();

  els.emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEmojiPanel();
  });
  document.addEventListener('click', (e) => {
    if (!els.emojiPanel.contains(e.target) && e.target !== els.emojiBtn) {
      toggleEmojiPanel(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleEmojiPanel(false);
  });

  // ---------- voice recording ----------

  const MAX_REC_SECONDS = 60;
  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let recordStartTime = 0;
  let recordTimerInterval = null;
  let recordCancelled = false;
  let pickedMimeType = 'audio/webm';

  function pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return '';
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result || '';
        const base64 = result.toString().split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function updateRecTimer() {
    const elapsed = (Date.now() - recordStartTime) / 1000;
    els.recTimer.textContent = `REC ${HC.formatDuration(elapsed)}`;
    if (elapsed >= MAX_REC_SECONDS) {
      stopRecording(false);
    }
  }

  async function startRecording() {
    els.composerError.textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      els.composerError.textContent = 'ERR: this browser does not support microphone capture.';
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      els.composerError.textContent = 'ERR: microphone access denied.';
      return;
    }

    pickedMimeType = pickMimeType();
    recordedChunks = [];
    recordCancelled = false;

    try {
      mediaRecorder = pickedMimeType
        ? new MediaRecorder(mediaStream, { mimeType: pickedMimeType })
        : new MediaRecorder(mediaStream);
    } catch (err) {
      mediaRecorder = new MediaRecorder(mediaStream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      clearInterval(recordTimerInterval);
      mediaStream.getTracks().forEach((t) => t.stop());

      els.micBtn.classList.remove('recording');
      els.recIndicator.classList.remove('active');

      if (recordCancelled || recordedChunks.length === 0) return;

      const duration = (Date.now() - recordStartTime) / 1000;
      if (duration < 0.4) {
        els.composerError.textContent = 'recording too short — hold the mic button a little longer.';
        return;
      }

      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || pickedMimeType || 'audio/webm' });
      const base64 = await blobToBase64(blob);
      socket.emit('voice-message', {
        audioData: base64,
        mimeType: blob.type,
        duration
      });
    };

    mediaRecorder.start();
    recordStartTime = Date.now();
    els.micBtn.classList.add('recording');
    els.recIndicator.classList.add('active');
    els.recTimer.textContent = 'REC 0:00';
    recordTimerInterval = setInterval(updateRecTimer, 250);
  }

  function stopRecording(cancelled) {
    recordCancelled = !!cancelled;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  els.micBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording(false);
    } else {
      startRecording();
    }
  });

  els.cancelRecBtn.addEventListener('click', () => {
    stopRecording(true);
  });

  // ---------- boot ----------

  runBootSequence([
    `> tunneling into channel #${roomId}...`,
    '> awaiting handshake...',
    `> identity: ${myHandle}`,
    '> connection established.'
  ], async () => {
    try {
      const room = await loadRoom();
      applyRoomState(room);
      els.online.textContent = `● ${room.online || 0} online`;

      const history = await loadHistory();
      els.log.innerHTML = '';
      if (history.length === 0) {
        els.log.innerHTML = '<div class="empty-state">no transmissions yet. say something.</div>';
      } else {
        history.forEach((m) => {
          if (m.type === 'text') appendTextMessage(m, { history: true });
          else appendVoiceMessage(m, { history: true });
        });
      }

      connectSocket();
      els.input.focus();
    } catch (err) {
      showFatalError(ERROR_MESSAGES[err.message] || 'This channel does not exist, or has been deleted.');
    }
  });
  });
})();

(function () {
  HCConsent.ensure(function () {
  initMatrixRain('matrix-rain');

  runBootSequence([
    '> establishing secure tunnel...',
    '> handshake complete.',
    '> identity: ANONYMOUS (no accounts on this network)',
    '> loading public channel index...',
    '> welcome to 0625.'
  ]);

  // ---------- visibility toggle ----------
  let isPrivate = false;
  const modePublic = document.getElementById('mode-public');
  const modePrivate = document.getElementById('mode-private');

  modePublic.addEventListener('click', () => {
    isPrivate = false;
    modePublic.classList.add('active');
    modePrivate.classList.remove('active');
  });
  modePrivate.addEventListener('click', () => {
    isPrivate = true;
    modePrivate.classList.add('active');
    modePublic.classList.remove('active');
  });

  // ---------- create channel ----------
  const createForm = document.getElementById('create-form');
  const createBtn = document.getElementById('create-btn');
  const createError = document.getElementById('create-error');
  const topicInput = document.getElementById('topic-input');

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    createError.textContent = '';
    const topic = topicInput.value.trim();
    if (!topic) {
      createError.textContent = 'ERR: topic required.';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = '[ INITIALIZING... ]';

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, isPrivate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SERVER_ERROR');

      HC.saveOwnedRoom(data.roomId, data.ownerToken);
      window.location.href = `/room.html?id=${encodeURIComponent(data.roomId)}`;
    } catch (err) {
      createError.textContent = err.message === 'BANNED'
        ? 'ERR: this device has been banned from 0625.'
        : 'ERR: could not create channel. is the server / mongodb running?';
      createBtn.disabled = false;
      createBtn.textContent = '[ INITIALIZE CHANNEL ]';
    }
  });

  // ---------- join by code ----------
  const joinBtn = document.getElementById('join-btn');
  const codeInput = document.getElementById('code-input');
  const joinError = document.getElementById('join-error');

  function goJoin() {
    const code = codeInput.value.trim();
    joinError.textContent = '';
    if (!code) {
      joinError.textContent = 'ERR: enter a channel code.';
      return;
    }
    window.location.href = `/room.html?id=${encodeURIComponent(code)}`;
  }
  joinBtn.addEventListener('click', goJoin);
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goJoin(); });

  // ---------- public channel list ----------
  const roomList = document.getElementById('room-list');
  const roomCount = document.getElementById('room-count');

  function renderRooms(rooms) {
    roomCount.textContent = `${rooms.length} active`;
    if (rooms.length === 0) {
      roomList.innerHTML = '<div class="empty-state">no public channels yet. be the first to broadcast.</div>';
      return;
    }
    roomList.innerHTML = '';
    rooms.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'room-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'link');

      const perm = document.createElement('span');
      perm.className = 'perm';
      perm.textContent = '~';

      const topic = document.createElement('span');
      topic.className = 'room-topic';
      topic.textContent = r.topic;

      const meta = document.createElement('span');
      meta.className = 'room-meta';
      meta.textContent = `${r.messageCount} msgs · ${HC.timeAgo(r.lastActivity)}`;

      const online = document.createElement('span');
      online.className = 'room-online';
      online.textContent = r.online > 0 ? `● ${r.online}` : '';

      row.append(perm, topic, meta, online);
      row.addEventListener('click', () => {
        window.location.href = `/room.html?id=${encodeURIComponent(r.roomId)}`;
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') row.click();
      });

      roomList.appendChild(row);
    });
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      const rooms = await res.json();
      renderRooms(rooms);
    } catch (err) {
      roomCount.textContent = 'offline';
      roomList.innerHTML = '<div class="empty-state">ERR: could not reach server.</div>';
    }
  }

  loadRooms();
  setInterval(loadRooms, 8000);
  });
})();

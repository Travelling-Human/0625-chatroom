(function () {
  const KEY_STORAGE = '0625_admin_key';

  const els = {
    keyGate: document.getElementById('key-gate'),
    keyInput: document.getElementById('admin-key-input'),
    unlockBtn: document.getElementById('unlock-btn'),
    keyError: document.getElementById('key-error'),
    panels: document.getElementById('admin-panels'),

    lookupRoomInput: document.getElementById('lookup-room-input'),
    lookupBtn: document.getElementById('lookup-btn'),
    lookupError: document.getElementById('lookup-error'),
    lookupResults: document.getElementById('lookup-results'),

    banIpInput: document.getElementById('ban-ip-input'),
    banReasonInput: document.getElementById('ban-reason-input'),
    manualBanBtn: document.getElementById('manual-ban-btn'),
    manualBanError: document.getElementById('manual-ban-error'),

    banCount: document.getElementById('ban-count'),
    banList: document.getElementById('ban-list'),

    allRoomsCount: document.getElementById('all-rooms-count'),
    allRoomsList: document.getElementById('all-rooms-list')
  };

  let adminKey = sessionStorage.getItem(KEY_STORAGE) || '';

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch (e) {
      return iso;
    }
  }

  async function adminFetch(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'X-Admin-Key': adminKey
      }
    });
    return res;
  }

  // ---------- unlock ----------

  async function tryUnlock(key) {
    adminKey = key;
    const res = await adminFetch('/api/admin/bans');
    if (res.status === 401 || res.status === 503) {
      adminKey = '';
      sessionStorage.removeItem(KEY_STORAGE);
      return false;
    }
    sessionStorage.setItem(KEY_STORAGE, key);
    els.keyGate.style.display = 'none';
    els.panels.style.display = 'block';
    refreshBans();
    refreshAllRooms();
    return true;
  }

  els.unlockBtn.addEventListener('click', async () => {
    els.keyError.textContent = '';
    const key = els.keyInput.value.trim();
    if (!key) {
      els.keyError.textContent = 'ERR: enter the admin key.';
      return;
    }
    els.unlockBtn.disabled = true;
    const ok = await tryUnlock(key);
    els.unlockBtn.disabled = false;
    if (!ok) {
      els.keyError.textContent = "ERR: invalid key (or ADMIN_KEY isn't set on the server).";
    }
  });
  els.keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.unlockBtn.click();
  });

  // ---------- ban list ----------

  async function refreshBans() {
    try {
      const res = await adminFetch('/api/admin/bans');
      if (!res.ok) throw new Error();
      const bans = await res.json();
      renderBans(bans);
    } catch (err) {
      els.banList.innerHTML = '<div class="empty-state">ERR: could not load bans.</div>';
    }
  }

  function renderBans(bans) {
    els.banCount.textContent = String(bans.length);
    if (bans.length === 0) {
      els.banList.innerHTML = '<div class="empty-state">no banned ips.</div>';
      return;
    }
    els.banList.innerHTML = '';
    bans.forEach((b) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '10px 4px';
      row.style.borderBottom = '1px solid var(--border-line)';

      const meta = document.createElement('div');
      meta.style.flex = '1';
      meta.style.minWidth = '160px';

      const ip = document.createElement('div');
      ip.style.color = 'var(--green-soft)';
      ip.style.fontFamily = 'var(--font-mono)';
      ip.textContent = b.ipAddress;

      const reason = document.createElement('div');
      reason.className = 'small';
      reason.style.whiteSpace = 'normal';
      reason.textContent = (b.reason || 'no reason given') + ' · ' + fmtDate(b.bannedAt);

      meta.append(ip, reason);

      const unbanBtn = document.createElement('button');
      unbanBtn.className = 'btn secondary';
      unbanBtn.style.width = 'auto';
      unbanBtn.style.padding = '6px 10px';
      unbanBtn.style.fontSize = '11px';
      unbanBtn.style.flexShrink = '0';
      unbanBtn.textContent = 'unban';
      unbanBtn.addEventListener('click', async () => {
        unbanBtn.disabled = true;
        try {
          await adminFetch(`/api/admin/bans/${encodeURIComponent(b.ipAddress)}`, { method: 'DELETE' });
          refreshBans();
        } catch (err) {
          unbanBtn.disabled = false;
        }
      });

      row.append(meta, unbanBtn);
      els.banList.appendChild(row);
    });
  }

  async function banIp(ipAddress, reason) {
    const res = await adminFetch('/api/admin/bans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress, reason })
    });
    if (!res.ok) throw new Error('BAN_FAILED');
    refreshBans();
  }

  els.manualBanBtn.addEventListener('click', async () => {
    els.manualBanError.textContent = '';
    const ip = els.banIpInput.value.trim();
    const reason = els.banReasonInput.value.trim();
    if (!ip) {
      els.manualBanError.textContent = 'ERR: enter an IP address.';
      return;
    }
    els.manualBanBtn.disabled = true;
    try {
      await banIp(ip, reason);
      els.banIpInput.value = '';
      els.banReasonInput.value = '';
    } catch (err) {
      els.manualBanError.textContent = 'ERR: could not ban that IP.';
    } finally {
      els.manualBanBtn.disabled = false;
    }
  });

  // ---------- message lookup ----------

  async function lookupRoom() {
    els.lookupError.textContent = '';
    const roomId = els.lookupRoomInput.value.trim();
    if (!roomId) {
      els.lookupError.textContent = 'ERR: enter a channel code.';
      return;
    }
    els.lookupResults.innerHTML = '<div class="empty-state">loading...</div>';
    try {
      const res = await adminFetch(`/api/admin/rooms/${encodeURIComponent(roomId)}/messages?limit=100`);
      if (!res.ok) throw new Error();
      const messages = await res.json();
      renderLookupResults(messages);
    } catch (err) {
      els.lookupResults.innerHTML = '';
      els.lookupError.textContent = 'ERR: could not load that channel.';
    }
  }

  function renderLookupResults(messages) {
    if (messages.length === 0) {
      els.lookupResults.innerHTML = '<div class="empty-state">no messages in that channel.</div>';
      return;
    }
    els.lookupResults.innerHTML = '';
    messages.slice().reverse().forEach((m) => {
      const row = document.createElement('div');
      row.className = 'msg-line';
      row.style.borderBottom = '1px solid var(--border-line)';
      row.style.padding = '8px 0';
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.alignItems = 'center';
      row.style.gap = '8px';

      const meta = document.createElement('div');
      meta.style.flex = '1';
      meta.style.minWidth = '0';

      const ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = fmtDate(m.createdAt);

      const handle = document.createElement('span');
      handle.className = 'handle';
      handle.textContent = ' ' + m.handle + ' ';

      const ip = document.createElement('span');
      ip.className = 'small';
      ip.textContent = '[' + m.ipAddress + ']';

      const content = document.createElement('div');
      content.className = 'content';
      content.style.wordBreak = 'break-word';
      content.textContent = m.type === 'text' ? m.content : `[voice message, ${Math.round(m.duration || 0)}s]`;

      meta.append(ts, handle, ip, document.createElement('br'), content);

      const banBtn = document.createElement('button');
      banBtn.className = 'btn danger';
      banBtn.style.width = 'auto';
      banBtn.style.padding = '6px 10px';
      banBtn.style.fontSize = '11px';
      banBtn.style.flexShrink = '0';
      banBtn.textContent = 'ban this ip';
      banBtn.addEventListener('click', async () => {
        if (!confirm(`Ban ${m.ipAddress}? This disconnects them immediately if online.`)) return;
        banBtn.disabled = true;
        try {
          await banIp(m.ipAddress, `message in lookup: "${(m.content || '').slice(0, 80)}"`);
          banBtn.textContent = 'banned';
        } catch (err) {
          banBtn.disabled = false;
          banBtn.textContent = 'ban this ip';
        }
      });

      row.append(meta, banBtn);
      els.lookupResults.appendChild(row);
    });
  }

  els.lookupBtn.addEventListener('click', lookupRoom);
  els.lookupRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') lookupRoom();
  });

  // ---------- all rooms list (public + private) ----------

  async function refreshAllRooms() {
    try {
      const res = await adminFetch('/api/admin/rooms');
      if (!res.ok) throw new Error();
      const rooms = await res.json();
      renderAllRooms(rooms);
    } catch (err) {
      els.allRoomsList.innerHTML = '<div class="empty-state">ERR: could not load channels.</div>';
    }
  }

  function renderAllRooms(rooms) {
    els.allRoomsCount.textContent = `${rooms.length} total`;
    if (rooms.length === 0) {
      els.allRoomsList.innerHTML = '<div class="empty-state">no channels yet.</div>';
      return;
    }
    els.allRoomsList.innerHTML = '';
    rooms.forEach((r) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--border-line);';

      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;letter-spacing:0.06em;padding:2px 7px;border:1px solid;text-transform:uppercase;flex-shrink:0;';
      if (r.isPrivate) {
        badge.textContent = 'private';
        badge.style.color = 'var(--magenta-alert)';
        badge.style.borderColor = 'var(--magenta-alert)';
      } else {
        badge.textContent = 'public';
        badge.style.color = 'var(--green-core)';
        badge.style.borderColor = 'var(--green-dim)';
      }

      const meta = document.createElement('div');
      meta.style.cssText = 'flex:1;min-width:120px;';

      const topic = document.createElement('div');
      topic.style.cssText = 'color:var(--text-bright);font-size:13.5px;word-break:break-word;';
      topic.textContent = r.topic;

      const details = document.createElement('div');
      details.className = 'small';
      details.style.marginTop = '2px';
      const onlineColor = r.online > 0 ? 'var(--cyan-signal)' : 'var(--text-faint)';
      details.innerHTML =
        `<span style="color:var(--text-faint);">id: </span>` +
        `<span style="color:var(--green-soft);font-family:var(--font-mono);">${r.roomId}</span>` +
        `&nbsp;&nbsp;` +
        `<span style="color:${onlineColor};">● ${r.online} online</span>` +
        `&nbsp;&nbsp;` +
        `<span style="color:var(--text-faint);">${r.messageCount} msgs</span>`;

      meta.append(topic, details);

      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

      const lookupBtn = document.createElement('button');
      lookupBtn.className = 'btn secondary';
      lookupBtn.style.cssText = 'width:auto;padding:5px 10px;font-size:11px;';
      lookupBtn.textContent = 'inspect';
      lookupBtn.addEventListener('click', () => {
        els.lookupRoomInput.value = r.roomId;
        lookupRoom();
        document.getElementById('admin-panels').scrollIntoView({ behavior: 'smooth' });
      });

      btnWrap.append(lookupBtn);
      row.append(badge, meta, btnWrap);
      els.allRoomsList.appendChild(row);
    });
  }

  // ---------- boot ----------

  if (adminKey) {
    tryUnlock(adminKey);
  }
})();

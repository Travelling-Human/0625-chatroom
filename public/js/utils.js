(function () {
  const CODENAMES = [
    'GHOST', 'PHANTOM', 'SHADOW', 'CIPHER', 'NEON', 'VOID', 'RAZOR', 'NULLBYTE',
    'PULSE', 'ECHO', 'VIPER', 'CHROME', 'GLITCH', 'ROGUE', 'STATIC', 'VECTOR',
    'ZERO_DAY', 'CRYPT', 'NEXUS', 'BLADE', 'WRAITH', 'SPECTRE', 'TROJAN', 'PROXY'
  ];

  function generateHandle() {
    const name = CODENAMES[Math.floor(Math.random() * CODENAMES.length)];
    const id = Math.floor(1000 + Math.random() * 9000);
    return `${name}_${id}`;
  }

  // One handle per browser tab session — gives continuity without any account.
  async function fetchHandle() {
    const CACHE_KEY = '0625_handle';
    try{
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return cached;
    } catch (e) {}

    try{
      const res = await fetch('/api/me/handle');
      const data = await res.json();
      const handle = data.handle || generateHandle();
      try{ localStorage.setItem(CACHE_KEY, handle); } catch (e) {}
      return handle;
    } catch (e) {
      return generateHandle();
    }
  }
  // Owner tokens for rooms this device created, so it can toggle visibility later.
  const OWNED_KEY = '0625_owned_rooms';

  function getOwnedRooms() {
    try {
      return JSON.parse(localStorage.getItem(OWNED_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveOwnedRoom(roomId, ownerToken) {
    const rooms = getOwnedRooms();
    rooms[roomId] = ownerToken;
    localStorage.setItem(OWNED_KEY, JSON.stringify(rooms));
  }

  function getOwnerToken(roomId) {
    return getOwnedRooms()[roomId] || null;
  }

  function formatClock(dateInput) {
    const d = new Date(dateInput);
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  function timeAgo(dateInput) {
    const diffMs = Date.now() - new Date(dateInput).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  }

  window.HC = {
    generateHandle,
    fetchHandle,
    getOwnedRooms,
    saveOwnedRoom,
    getOwnerToken,
    formatClock,
    formatDuration,
    timeAgo
  };
})();

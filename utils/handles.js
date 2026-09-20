const crypto = require('crypto')

const CODENAMES = [
  'GHOST', 'PHANTOM', 'SHADOW', 'CIPHER', 'NEON', 'VOID', 'RAZOR', 'NULLBYTE',
  'PULSE', 'ECHO', 'VIPER', 'CHROME', 'GLITCH', 'ROGUE', 'STATIC', 'VECTOR',
  'ZERO_DAY', 'CRYPT', 'NEXUS', 'BLADE', 'WRAITH', 'SPECTRE', 'TROJAN', 'PROXY',
  'MALAZAN', 'ZETH', 'AZRAEL', 'SABRIEL', 'RING'
];

function generateHandle() {
  const name = CODENAMES[Math.floor(Math.random() * CODENAMES.length)];
  const id = Math.floor(1000 + Math.random() * 9000);
  return `${name}_${id}`;
}

function deterministicHandle(ip, salt) {
  const hash = crypto
    .createHmac('sha256', salt || 'default-salt')
    .update(ip || '0.0.0.0')
    .digest('hex')
  const nameIndex = parseInt(hash.slice(0, 8), 16) % CODENAMES.length;
  const numSuffix = (parseInt(hash.slice(8, 16), 16) % 9000) + 1000;
  return `${CODENAMES[nameIndex]}_${numSuffix}`;
}
module.exports = { generateHandle, deterministicHandle };

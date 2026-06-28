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

module.exports = { generateHandle };

(function () {
  function initMatrixRain(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const glyphs = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF$#@!*+-/<>'.split('');
    let columns, drops, fontSize;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      fontSize = window.innerWidth < 480 ? 13 : 15;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(0).map(() => Math.floor(Math.random() * -50));
    }

    function draw() {
      ctx.fillStyle = 'rgba(6, 10, 8, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < columns; i++) {
        const text = glyphs[Math.floor(Math.random() * glyphs.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillStyle = Math.random() > 0.96 ? '#8dffb0' : 'rgba(57, 255, 106, 0.55)';
        ctx.fillText(text, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    resize();
    window.addEventListener('resize', resize);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      setInterval(draw, 55);
    } else {
      ctx.fillStyle = 'rgba(6, 10, 8, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.initMatrixRain = initMatrixRain;
})();

(function () {
  function runBootSequence(lines, onDone) {
    const overlay = document.getElementById('boot-overlay');
    const skipBtn = document.getElementById('boot-skip');
    if (!overlay) { onDone && onDone(); return; }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let done = false;

    function finish() {
      if (done) return;
      done = true;
      overlay.classList.add('hidden');
      if (skipBtn) skipBtn.style.display = 'none';
      onDone && onDone();
    }

    if (reduceMotion) {
      finish();
      return;
    }

    if (skipBtn) skipBtn.addEventListener('click', finish);
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        finish();
        document.removeEventListener('keydown', escHandler);
      }
    });

    overlay.textContent = '';
    let lineIndex = 0;
    let charIndex = 0;

    function typeNext() {
      if (done) return;
      if (lineIndex >= lines.length) {
        setTimeout(finish, 400);
        return;
      }
      const currentLine = lines[lineIndex];
      if (charIndex === 0) {
        overlay.textContent += '\n';
      }
      if (charIndex < currentLine.length) {
        overlay.textContent += currentLine[charIndex];
        charIndex++;
        setTimeout(typeNext, currentLine.startsWith('>') ? 14 : 6);
      } else {
        lineIndex++;
        charIndex = 0;
        setTimeout(typeNext, 90);
      }
    }

    typeNext();
  }

  window.runBootSequence = runBootSequence;
})();

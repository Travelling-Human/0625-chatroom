(function () {
  const STORAGE_KEY = '0625_consent_v1';
  const TERMS_VERSION = 1; // bump this if the wording below changes materially

  function hasConsented() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return !!data && data.accepted === true && data.version === TERMS_VERSION;
    } catch (e) {
      return false;
    }
  }

  function saveConsentLocally() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        accepted: true,
        version: TERMS_VERSION,
        acceptedAt: new Date().toISOString()
      }));
    } catch (e) {
      // localStorage unavailable (private mode etc.) — the user will just see
      // the notice again next visit. Not worth blocking on.
    }
  }

  function logConsentToServer() {
    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: TERMS_VERSION })
    }).catch(() => {
      // Non-fatal — e.g. offline, or server briefly unreachable.
    });
  }

  function buildModal(onAccept) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.id = 'consent-modal';

    const box = document.createElement('div');
    box.className = 'term-window modal-box consent-box';

    const titlebar = document.createElement('div');
    titlebar.className = 'term-titlebar';
    titlebar.innerHTML =
      '<span class="term-dot magenta"></span><span class="term-path">SYSTEM :: access_terms.txt</span>';

    const body = document.createElement('div');
    body.className = 'term-body';

    const textBox = document.createElement('div');
    textBox.className = 'consent-text';

    const paragraphs = [
      'Hi, thanks for visiting 0625. This is a private chatroom built for ' +
        'people who want to share anything anonymously, or to have a good ' +
        'time with friends.',
      'Before you use it, please confirm that you are above the legal age, ' +
        'and that any activities done here — and any legal repercussions — ' +
        'are your own responsibility. Activities such as bullying, ' +
        'misinformation, hate speech, and terrorism are prohibited. If found, ' +
        'the channel involved will be permanently banned, the admin ' +
        'responsible will be permanently banned from accessing this website, ' +
        'and the matter will be reported to legal authorities.',
      'If you agree with this, you may enter.'
    ];
    paragraphs.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      textBox.appendChild(p);
    });

    const checkboxRow = document.createElement('label');
    checkboxRow.className = 'consent-checkbox-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'consent-checkbox';
    const checkboxLabel = document.createElement('span');
    checkboxLabel.textContent =
      'I confirm I am 18 years of age or older, and I agree to the terms above.';
    checkboxRow.append(checkbox, checkboxLabel);

    const btnRow = document.createElement('div');
    btnRow.className = 'consent-btn-row';

    const leaveBtn = document.createElement('a');
    leaveBtn.className = 'btn secondary';
    leaveBtn.textContent = 'leave';
    leaveBtn.href = 'https://www.google.com';

    const enterBtn = document.createElement('button');
    enterBtn.type = 'button';
    enterBtn.className = 'btn';
    enterBtn.textContent = '[ ENTER ]';
    enterBtn.disabled = true;

    btnRow.append(leaveBtn, enterBtn);

    checkbox.addEventListener('change', () => {
      enterBtn.disabled = !checkbox.checked;
    });

    enterBtn.addEventListener('click', () => {
      if (!checkbox.checked) return;
      saveConsentLocally();
      logConsentToServer();
      backdrop.remove();
      document.body.classList.remove('consent-locked');
      onAccept();
    });

    body.append(textBox, checkboxRow, btnRow);
    box.append(titlebar, body);
    backdrop.append(box);
    document.body.appendChild(backdrop);
  }

  function ensure(onReady) {
    if (hasConsented()) {
      onReady();
      return;
    }

    // The page ships with an opaque #boot-overlay (for the terminal typing
    // effect) that's visible by default and sits above everything. Hide it
    // while the consent dialog is showing, and hand it back right before the
    // real boot sequence runs.
    const bootOverlay = document.getElementById('boot-overlay');
    const bootSkip = document.getElementById('boot-skip');
    if (bootOverlay) bootOverlay.classList.add('hidden');
    if (bootSkip) bootSkip.style.display = 'none';

    document.body.classList.add('consent-locked');
    buildModal(function () {
      if (bootOverlay) bootOverlay.classList.remove('hidden');
      if (bootSkip) bootSkip.style.display = '';
      onReady();
    });
  }

  window.HCConsent = { ensure };
})();

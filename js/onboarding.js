// Onboarding: drei Erklärkarten (wischen oder „Weiter"), dann Pflichtprofil mit Name und Avatar.
// avatars = RUETHERS; onDone({ nickname, avatar }) genau einmal pro start().
export function createOnboarding({ el, avatars, onDone }) {
  const slides = [...el.querySelectorAll('.onb-slide')];
  const dots = el.querySelector('.onb-dots');
  const next = el.querySelector('.onb-next');
  const skip = el.querySelector('.onb-skip');
  const name = el.querySelector('.onb-name');
  const err = el.querySelector('.onb-error');
  err.setAttribute('role', 'alert');
  const pick = el.querySelector('.avatar-pick');
  const LAST = slides.length - 1;
  let step = 0, first = 0, avatar = avatars[0].id, done = false;

  pick.innerHTML = avatars.map(a => `<button class="avatar-opt" data-id="${a.id}" title="${a.name}"><img src="sprites/${a.id}.png" alt="${a.name}"></button>`).join('');
  pick.addEventListener('click', e => { const b = e.target.closest('.avatar-opt'); if (b) setAvatar(b.dataset.id); });
  function setAvatar(id) {
    avatar = id;
    pick.querySelectorAll('.avatar-opt').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  }

  function go(n) {
    step = Math.max(first, Math.min(LAST, n));
    slides.forEach((s, i) => s.classList.toggle('active', i === step));
    dots.innerHTML = slides.slice(first).map((_, i) => `<span class="${i + first === step ? 'on' : ''}"></span>`).join('');
    dots.classList.toggle('hidden', first === LAST);
    const profile = step === LAST;
    next.textContent = profile ? 'Los geht\'s' : 'Weiter';
    skip.classList.toggle('hidden', profile);
    err.classList.add('hidden');
  }
  function finish() {
    const nick = name.value.trim();
    if (nick.length < 2 || nick.length > 16) {
      err.textContent = 'Bitte 2 bis 16 Zeichen.';
      err.classList.remove('hidden');
      name.focus();
      return;
    }
    if (done) return;
    done = true;
    onDone({ nickname: nick, avatar });
  }
  next.addEventListener('click', () => (step === LAST ? finish() : go(step + 1)));
  skip.addEventListener('click', () => go(LAST));
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(); } });
  name.addEventListener('input', () => err.classList.add('hidden'));

  // Wischen auf den Erklärkarten (nicht auf dem Profil: dort markiert man Text im Namensfeld)
  const area = el.querySelector('.onb-slides');
  let x0 = null;
  area.addEventListener('pointerdown', e => { x0 = e.clientX; });
  area.addEventListener('pointercancel', () => { x0 = null; });
  area.addEventListener('pointerup', e => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (step === LAST || Math.abs(dx) < 50) return;
    go(step + (dx < 0 ? 1 : -1));
  });

  return {
    start({ profileOnly = false, nickname = '', avatar: av = 'christian' } = {}) {
      done = false;
      first = profileOnly ? LAST : 0;
      name.value = nickname;
      setAvatar(avatars.some(a => a.id === av) ? av : avatars[0].id);
      go(first);
    },
  };
}

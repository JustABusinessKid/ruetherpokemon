import { CONST } from './data.js';

// el = section#screen-catch. onDone({ spawn, caught }) nach Fang oder Flucht. onCancel() bei ✕.
export function createCatchScreen({ el, onDone, onCancel }) {
  const sprite = el.querySelector('.sprite');
  const name = el.querySelector('.name');
  const title = el.querySelector('.title');
  const desc = el.querySelector('.desc');
  const msg = el.querySelector('.msg');
  const throwsEl = el.querySelector('.throws');
  const coin = el.querySelector('.coin');
  let spawn = null, def = null, throwsLeft = 0, busy = false, rng = Math.random;

  function render(text) {
    msg.textContent = text;
    throwsEl.textContent = `Würfe übrig: ${throwsLeft}`;
  }

  function throwCoin() {
    if (busy || throwsLeft <= 0 || !def) return;
    busy = true;
    coin.classList.add('thrown');
    render('...');
    setTimeout(() => {
      coin.classList.remove('thrown');
      if (rng() < def.catchChance) {
        render(`${def.name} gefangen!`);
        sprite.classList.remove('wobble');
        setTimeout(() => { busy = false; onDone({ spawn, caught: true }); }, 900);
        return;
      }
      throwsLeft -= 1;
      if (throwsLeft === 0) {
        render(`${def.name} ist abgehauen.`);
        setTimeout(() => { busy = false; onDone({ spawn, caught: false }); }, 900);
      } else {
        render(`${def.name} ist ausgewichen.`);
        busy = false;
      }
    }, 600);
  }

  let touchY = null;
  el.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (touchY !== null && touchY - e.changedTouches[0].clientY > 40) throwCoin();
    touchY = null;
  });
  coin.addEventListener('click', throwCoin);
  el.querySelector('.back').addEventListener('click', () => { if (!busy) onCancel(); });

  return {
    start(s, d, r = Math.random) {
      spawn = s; def = d; rng = r; throwsLeft = CONST.THROWS; busy = false;
      sprite.src = `sprites/${d.id}.png`;
      sprite.classList.add('wobble');
      name.textContent = d.name;
      title.textContent = d.title;
      desc.textContent = d.desc;
      render('Wirf einen Bitcoin!');
    },
  };
}

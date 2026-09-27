/* SWC2026 APAC — CHOOSE YOUR SCROLL (OAP v8).
   Background: AE-rendered intro (2 s, once) then loop (4 s). Only the 12 cards and the
   two buttons are app elements; their entrance timing comes from docs/oap-spec/choose-v8.
   Card entrance CSS starts on the intro's first presented frame so both stay in sync. */
class ChooseScreen {
  constructor(stage) {
    this.stage = stage;
    this.intro = stage.querySelector('#choose-bg-intro');
    this.loop = stage.querySelector('#choose-bg-loop');
    this.epoch = 0;
    this.inputTimer = null;
    this.fallbackTimer = null;
    this.diagnostics = { entries: 0, synced: 0, fallback: 0, loopSwaps: 0 };
    this.intro.addEventListener('ended', () => this.swapToLoop(this.epoch));
  }

  // Muted inline playback is allowed without a gesture; decode the first frames early
  // so the first entry does not wait on the decoder, then park both at frame 0.
  prime() {
    const epoch = this.epoch;
    for (const v of [this.intro, this.loop]) {
      // Skip if the screen was entered meanwhile; enter() owns playback then.
      const done = () => { if (epoch !== this.epoch) return; v.pause(); this.rewind(v); };
      Promise.resolve().then(() => v.play()).then(done, done);
    }
  }

  rewind(v) {
    try { if (v.currentTime !== 0) v.currentTime = 0; } catch (e) { /* not seekable yet */ }
  }

  onFirstFrame(v, epoch, fn) {
    const run = () => { if (epoch === this.epoch) fn(); };
    if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(run);
    else v.addEventListener('playing', run, { once: true });
  }

  enter() {
    const epoch = ++this.epoch;
    this.diagnostics.entries++;
    this.resetState();
    this.loop.pause();
    this.rewind(this.loop);
    this.rewind(this.intro);
    this.onFirstFrame(this.intro, epoch, () => this.startEntrance(epoch, true));
    // Never leave the controls hidden if the video cannot start.
    this.fallbackTimer = setTimeout(() => this.startEntrance(epoch, false), 700);
    Promise.resolve().then(() => this.intro.play()).catch(() => {});
  }

  startEntrance(epoch, synced) {
    if (epoch !== this.epoch || this.stage.classList.contains('is-playing')) return;
    clearTimeout(this.fallbackTimer);
    this.diagnostics[synced ? 'synced' : 'fallback']++;
    this.stage.classList.add('is-playing');
    // Input opens when the last entrance (scroll 12) finishes: 0.985 + 0.45 s.
    this.inputTimer = setTimeout(() => { if (epoch === this.epoch) this.stage.classList.add('is-interactive'); }, 1435);
  }

  swapToLoop(epoch) {
    if (epoch !== this.epoch) return;
    // The intro holds its last frame until the loop has presented its first one.
    this.onFirstFrame(this.loop, epoch, () => { this.stage.classList.add('loop-front'); this.diagnostics.loopSwaps++; });
    Promise.resolve().then(() => this.loop.play()).catch(() => {});
  }

  leave() {
    this.epoch++;
    this.resetState();
    for (const v of [this.intro, this.loop]) { v.pause(); this.rewind(v); }
  }

  resetState() {
    clearTimeout(this.inputTimer);
    clearTimeout(this.fallbackTimer);
    this.stage.classList.remove('is-playing', 'is-interactive', 'loop-front');
  }
}

const CHOOSE_CARD_LAYOUT = (() => {
  // From docs/oap-spec/choose-v8/layout.json (master 2048x2732, final top-left).
  const cols = [125.02, 589.02, 1053.02, 1517.02], rows = [562.4, 1147.4, 1732.4];
  return Array.from({ length: 12 }, (_, i) => ({
    left: cols[i % 4],
    top: rows[Math.floor(i / 4)],
    delay: 0.38 + 0.055 * i
  }));
})();

// Selected-card glitter: sparkles sit on the card edge (x/y in % of the card, size in % of its width).
const CHOOSE_SPARKLES = [
  [-3, 9, 16, 0], [101, 24, 12, .45], [86, -3, 17, .9], [6, 97, 14, .3],
  [102, 80, 17, 1.15], [44, -4, 11, .6], [-4, 58, 12, 1.3], [62, 102, 15, .15]
];
const CHOOSE_GLITTER = CHOOSE_SPARKLES.map(([x, y, s, d]) => `<i style="left:${x}%;top:${y}%;width:${s}%;--d:${d}s"></i>`).join('');

function buildChooseGrid(grid, onChoose) {
  grid.innerHTML = CHOOSE_CARD_LAYOUT.map((c, i) => {
    const n = String(i + 1).padStart(2, '0');
    // Glow, shine and glitter layers only animate while the card is selected (display:none otherwise).
    return `<button class="scroll-choice choose-anim choose-rise" style="left:calc(100%*${c.left}/2048);top:calc(100%*${c.top}/2732);--delay:${c.delay.toFixed(3)}s" aria-label="${i + 1}번 소환서 선택" aria-pressed="false" data-index="${i}"><span class="card-lift"><img src="assets/oap/choose/scroll-${n}.webp" alt="" draggable="false"><span class="card-shine"></span></span><span class="card-glow"></span><span class="card-glitter">${CHOOSE_GLITTER}</span></button>`;
  }).join('');
  grid.querySelectorAll('.scroll-choice').forEach(b => b.addEventListener('click', () => onChoose(Number(b.dataset.index))));
}

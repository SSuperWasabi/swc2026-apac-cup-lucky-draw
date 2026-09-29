/* SWC2026 APAC — screen transition (AE 01_Transition, TRANS_ASIA alpha sequence).
   iPad Safari has no H.264 alpha, so the clip is two plain videos that the browser plays and composites
   itself (no per-frame JavaScript, so a busy main thread cannot freeze it):
     matte  = 1 - alpha, blended with multiply   -> page * (1 - a)
     colour = premultiplied colour on black, added with plus-lighter (screen where unsupported) -> + colour * a
   which is exactly "colour over page". The screen swaps while the frame is fully covered and the next
   screen's entrance starts as the cover lifts. With the admin switch off, actions run immediately. */
class ScreenTransition {
  constructor(matte, colour, shield) {
    this.matte = matte;
    this.colour = colour;
    this.shield = shield;
    this.videos = [matte, colour];
    // 1.8x speed (user decision) is in the files: all 61 authored frames at 54 fps.
    // Frames 11-48 cover the screen completely (alpha >= 254).
    this.coverAt = 13 / 54;
    this.revealAt = 48 / 54;
    this.busy = false;
    this.revealed = [];
    this.available = !!(matte && colour);
    this.warmed = false;
  }

  // Hold both clips in memory and run their decoders once, so the first transition starts on decoded frames.
  async warm() {
    await Promise.all(this.videos.map(async v => {
      try {
        const response = await fetch(v.getAttribute('src'));
        if (response.ok) { const url = URL.createObjectURL(await response.blob()); if (!this.busy) { v.src = url; v.load(); } }
      } catch (e) { /* keep the network source */ }
    }));
    if (this.busy) return;
    try { await Promise.all(this.videos.map(v => v.play())); } catch (e) { /* autoplay refused: the first run starts them */ }
    if (!this.busy) this.rewind();
    this.warmed = true;
  }

  rewind() {
    for (const v of this.videos) { v.pause(); try { if (v.currentTime !== 0) v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
  }

  show(on) {
    for (const v of this.videos) v.classList.toggle('is-active', on);
    if (this.shield) this.shield.classList.toggle('is-active', on);
  }

  // Runs fn when the screen is fully covered; callbacks queued with afterReveal() run as it lifts.
  run(fn) {
    if (!this.available || this.busy) { fn(); return; }
    this.busy = true;
    const clock = this.colour;
    let covered = false, revealed = false, done = false;
    const cover = () => { if (covered) return; covered = true; try { fn(); } catch (e) { console.warn('Transition action failed', e); } };
    const reveal = () => { if (revealed) return; revealed = true; this.revealed.splice(0).forEach(cb => { try { cb(); } catch (e) { /* next */ } }); };
    const finish = () => {
      if (done) return; done = true;
      cover(); reveal();
      clearTimeout(watchdog);
      this.show(false);
      // Rewind now so the next transition starts without a seek.
      this.rewind();
      this.busy = false;
    };
    // Never trap the kiosk: a stalled clip still completes the navigation.
    const watchdog = setTimeout(finish, 4000);
    // Both clips start in the same task from a decoded, paused first frame; measured they stay frame-locked
    // (a playback-rate follower was tried and made them drift under load, so there is none).
    // Only the swap timing is read on the main thread; the pictures keep playing even if it is busy.
    const tick = (now, meta) => {
      if (done) return;
      const t = meta ? meta.mediaTime : clock.currentTime;
      if (t >= this.coverAt) cover();
      if (t >= this.revealAt) reveal();
      if (!clock.ended) this.frame(tick);
    };
    clock.onended = finish;
    if (this.videos.some(v => v.currentTime !== 0)) this.rewind();
    this.show(true);
    Promise.resolve().then(() => Promise.all(this.videos.map(v => v.play()))).then(() => this.frame(tick), finish);
  }

  frame(cb) { this.frameOf(this.colour, cb); }

  frameOf(video, cb) {
    if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(cb);
    else requestAnimationFrame(() => cb(performance.now(), null));
  }

  // Deferred start for the next screen's entrance (runs now when no transition is showing).
  afterReveal(cb) { if (this.busy) this.revealed.push(cb); else cb(); }
}

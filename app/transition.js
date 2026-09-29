/* SWC2026 APAC — screen transition (AE 01_Transition, TRANS_ASIA alpha sequence).
   The video stacks colour (top, premultiplied on black) over alpha (bottom) because iPad Safari has no
   H.264 alpha; WebGL recombines them over the whole screen. The screen swaps while the frame is fully
   covered and the next screen's own entrance starts as the cover lifts. Without WebGL or with the admin
   switch off, actions run immediately. */
class ScreenTransition {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    // The 1.8x speed-up is in the file (user decision): all 61 authored frames at 54 fps, played at rate 1.
    // (v18 resampled to 30 fps by dropping frames, which stuttered.) Frames 11-48 cover the screen (alpha >= 254).
    this.coverAt = 13 / 54;
    this.revealAt = 48 / 54;
    this.rate = 1;
    this.busy = false;
    this.gl = null;
    this.revealed = [];
    try { this.setupGl(); } catch (e) { this.gl = null; }
  }

  get available() { return !!this.gl; }

  // Hold the whole clip in memory (no Range/service-worker streaming mid-transition) and run the decoder once,
  // so the first real transition starts on an already decoded first frame.
  async warm() {
    const v = this.video;
    try {
      const response = await fetch(v.getAttribute('src'));
      if (response.ok) { const url = URL.createObjectURL(await response.blob()); if (!this.busy) { v.src = url; v.load(); } }
    } catch (e) { /* keep the network source */ }
    if (this.busy) return;
    try {
      await v.play();
      await new Promise(resolve => { if (typeof v.requestVideoFrameCallback === 'function') v.requestVideoFrameCallback(() => resolve()); else setTimeout(resolve, 60); });
    } catch (e) { /* autoplay refused: the first run starts it */ }
    if (!this.busy) { v.pause(); try { v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
  }

  setupGl() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 uv;uniform vec2 crop;void main(){uv=vec2(0.5+(p.x*0.5)*crop.x,0.5-(p.y*0.5)*crop.y);gl_Position=vec4(p,0.,1.);}'));
    // Colour from the top half, alpha from the bottom half; the colour is already premultiplied.
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){vec3 c=texture2D(t,vec2(uv.x,uv.y*0.5)).rgb;float a=texture2D(t,vec2(uv.x,0.5+uv.y*0.5)).r;gl_FragColor=vec4(min(c,vec3(a)),a);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.cropLoc = gl.getUniformLocation(program, 'crop');
    this.gl = gl;
  }

  // Cover the viewport like object-fit: cover for a 3:4 frame.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const frame = 768 / 1024, view = w / h;
    this.crop = view > frame ? [1, frame / view] : [view / frame, 1];
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw() {
    const gl = this.gl, v = this.video;
    if (v.readyState < 2) return;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
    gl.uniform2f(this.cropLoc, this.crop[0], this.crop[1]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Runs fn when the screen is fully covered; callbacks queued with afterReveal() run as it lifts.
  run(fn) {
    if (!this.available || this.busy) { fn(); return; }
    this.busy = true;
    const v = this.video;
    let covered = false, revealed = false, done = false;
    const cover = () => { if (covered) return; covered = true; try { fn(); } finally { /* keep going */ } };
    const reveal = () => { if (revealed) return; revealed = true; const list = this.revealed.splice(0); list.forEach(cb => { try { cb(); } catch (e) { /* next */ } }); };
    const finish = () => {
      if (done) return; done = true;
      cover(); reveal();
      clearTimeout(watchdog);
      v.pause();
      // Rewind now so the next transition starts without a seek.
      try { v.currentTime = 0; } catch (e) { /* not seekable */ }
      this.canvas.classList.remove('is-active');
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.busy = false;
    };
    // Never trap the kiosk: a stalled video still completes the navigation.
    const watchdog = setTimeout(finish, 4000);
    const tick = (now, meta) => {
      if (done) return;
      this.draw();
      const t = meta ? meta.mediaTime : v.currentTime;
      if (t >= this.coverAt) cover();
      if (t >= this.revealAt) reveal();
      if (!v.ended) this.frame(tick);
    };
    v.onended = finish;
    this.resize();
    this.canvas.classList.add('is-active');
    if (v.currentTime !== 0) { try { v.currentTime = 0; } catch (e) { /* not seekable yet */ } }
    v.playbackRate = this.rate;
    Promise.resolve().then(() => v.play()).then(() => this.frame(tick), finish);
  }

  frame(cb) {
    if (typeof this.video.requestVideoFrameCallback === 'function') this.video.requestVideoFrameCallback(cb);
    else requestAnimationFrame(() => cb(performance.now(), null));
  }

  // Deferred start for the next screen's entrance (runs now when no transition is showing).
  afterReveal(cb) { if (this.busy) this.revealed.push(cb); else cb(); }
}

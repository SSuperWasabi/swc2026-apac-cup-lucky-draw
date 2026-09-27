// Builds layout.json / motion.json for the CHOOSE YOUR SCROLL v8 screen from an AE extract.
// Usage: node build-choose-v8-spec.cjs <extract-dir> <out-dir>
const fs = require('fs');
const path = require('path');

const [extractDir, outDir] = process.argv.slice(2);
const s = require(path.resolve(extractDir, 'structure.json'));
const ROOT = '21-1_CHOOSE_YOUR_SCROLL_INTRO_THEN_LOOP_V8';
const root = s.comps.find(c => c.name === ROOT);
if (!root) throw new Error('root comp missing');
const compByName = Object.fromEntries(s.comps.map(c => [c.name, c]));
const W = root.width, H = root.height;
const r3 = n => Math.round(n * 1000) / 1000;

function prop(layer, suffix) {
  return layer.props.find(p => p.path.endsWith(suffix) && !/[XYZ] 위치$/.test(p.path));
}
function finalValue(p) { return p.keys ? p.keys[p.keys.length - 1].v : p.value; }

// Interactive elements stay in the app; everything else is baked into the background video.
const interactive = root.layers.filter(l => l.enabled && l.type === 'precomp' && l.source && /SCROLL_CARD_|BUTTON/.test(l.source.name));

const elements = [];
const motion = [];
for (const l of interactive.slice().reverse()) { // bottom-most first = stacking order
  const src = compByName[l.source.name];
  const anchor = finalValue(prop(l, '> 기준점'));
  const pos = finalValue(prop(l, '> 위치'));
  const scale = finalValue(prop(l, '> 비율'))[0] / 100;
  const w = src.width * scale, h = src.height * scale;
  const left = pos[0] - anchor[0] * scale, top = pos[1] - anchor[1] * scale;
  const m = /SCROLL_CARD_(\d+)/.exec(src.name);
  const id = m ? `scroll-${m[1]}` : /RANDOM/.test(src.name) ? 'random' : 'select';
  elements.push({
    id,
    aeLayer: l.name,
    aeComp: src.name,
    asset: `${id}.png`,
    assetSize: [src.width, src.height],
    scale,
    master: { left: r3(left), top: r3(top), width: r3(w), height: r3(h) },
    css1024: { left: r3(left / 2), top: r3(top / 2), width: r3(w / 2), height: r3(h / 2) },
    percent: { left: r3(left / W * 100), top: r3(top / H * 100), width: r3(w / W * 100), height: r3(h / H * 100) },
    zIndex: elements.length + 1
  });

  const tracks = {};
  for (const [key, suffix] of [['opacity', '> 불투명도'], ['position', '> 위치']]) {
    const p = prop(l, suffix);
    if (!p || !p.keys) continue;
    if (p.keys.length !== 2) throw new Error(`${l.name} ${key}: expected 2 keys`);
    const [a, b] = p.keys;
    if (a.outInterp !== 'linear' || b.inInterp !== 'linear') throw new Error(`${l.name} ${key}: non-linear keys`);
    tracks[key] = key === 'opacity'
      ? { from: a.v / 100, to: b.v / 100 }
      : { fromTranslateMaster: [a.v[0] - b.v[0], a.v[1] - b.v[1]], to: [0, 0] };
    tracks[key].start = r3(a.t);
    tracks[key].duration = r3(b.t - a.t);
  }
  const starts = Object.values(tracks).map(t => t.start);
  const durs = Object.values(tracks).map(t => t.duration);
  if (new Set(starts).size !== 1 || new Set(durs).size !== 1) throw new Error(`${l.name}: tracks not aligned`);
  const t = Object.values(tracks)[0];
  motion.push({
    id,
    start: t.start,
    duration: t.duration,
    easing: 'linear',
    from: { opacity: tracks.opacity.from, translateMaster: tracks.position ? tracks.position.fromTranslateMaster : [0, 0] },
    to: { opacity: tracks.opacity.to, translateMaster: [0, 0] }
  });
}

const markers = root.markers.map(m => ({ t: m.t, comment: m.comment }));
const lastEnd = Math.max(...motion.map(m => m.start + m.duration));
const baked = root.layers.filter(l => l.enabled && !interactive.includes(l)).map(l => l.name);

const common = {
  source: {
    aep: path.basename(s.project),
    comp: ROOT,
    extractedAt: s.extractedAt,
    aeVersion: s.aeVersion
  },
  canvas: { width: W, height: H, fps: root.frameRate, cssWidth: W / 2, cssHeight: H / 2 }
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'layout.json'), JSON.stringify({
  ...common,
  coordinateSystem: 'Top-left of each element box after entrance (final state). master = 2048x2732 px; css1024 = master/2; percent = of canvas.',
  background: {
    intro: { file: 'choose-bg-intro.mp4', seconds: [0, 2], playCount: 1 },
    loop: { file: 'choose-bg-loop.mp4', seconds: [2, 6], loop: true },
    bakedLayers: baked
  },
  elements
}, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'motion.json'), JSON.stringify({
  ...common,
  timeBase: 'Seconds from the first presented frame of choose-bg-intro.mp4',
  markers,
  entranceEnds: r3(lastEnd),
  translateNote: 'translateMaster is in 2048-px master units; divide by 2 for CSS px at 1024 width.',
  elements: motion
}, null, 2) + '\n');
console.log(`elements=${elements.length} entranceEnds=${r3(lastEnd)} baked=${baked.length}`);

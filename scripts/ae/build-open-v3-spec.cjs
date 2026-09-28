// Builds docs/oap-spec/open-v3/layout.json from the AE v3 layout file and the scripted extract.
// Usage: node build-open-v3-spec.cjs <AE v3 layout.json> <extract-dir> <out-dir>
const fs = require('fs');
const path = require('path');

const [aeLayoutFile, extractDir, outDir] = process.argv.slice(2);
const ae = JSON.parse(fs.readFileSync(aeLayoutFile, 'utf8'));
const s = require(path.resolve(extractDir, 'structure.json'));
const IDLE = '04_Caster_Cam2_OPEN_SCROLL_IPAD_IDLE_V3';
const idle = s.comps.find(c => c.name === IDLE);
if (!idle) throw new Error('missing ' + IDLE);
const prop = (layer, suffix) => layer.props.find(p => p.path.endsWith(suffix) && !/[XYZ] 위치$/.test(p.path)).value;

// The scroll clip layer decides the real slot: 720 px source scaled into the 1768 square.
const clip = idle.layers.find(l => l.enabled && l.source && l.source.name === 'sacred-idle.mp4');
const scale = prop(clip, '> 비율')[0] / 100, anchor = prop(clip, '> 기준점'), pos = prop(clip, '> 위치');
const r3 = n => Math.round(n * 1000) / 1000;
const slot = { left: r3(pos[0] - anchor[0] * scale), top: r3(pos[1] - anchor[1] * scale), width: r3(clip.source.width * scale), height: r3(clip.source.height * scale) };
for (const k of ['left', 'top', 'width', 'height']) if (Math.abs(slot[k] - ae.videoSlot[k]) > 0.01) throw new Error(`slot.${k} ${slot[k]} != AE layout ${ae.videoSlot[k]}`);

const out = {
  source: { aep: path.basename(s.project), comps: [IDLE, '04_Caster_Cam2_OPEN_SCROLL_IPAD_FRAME_V3', '04_Caster_Cam2_OPEN_SCROLL_IPAD_OPEN_V3'], extractedAt: s.extractedAt, aeVersion: s.aeVersion },
  canvas: { width: ae.canvas.width, height: ae.canvas.height, fps: ae.canvas.fps },
  coordinateSystem: 'Top-left boxes in 2048x2732 master px.',
  frameLoop: { file: 'open-frame-loop.mp4', frames: ae.frameLoopFrames, seconds: r3(ae.frameLoopFrames / ae.canvas.fps), note: 'FRAME_V3 render: titles, logo, emblem, SLIDE bar baked; slot is pure black in every frame' },
  videoSlot: { ...slot, sourceSize: [clip.source.width, clip.source.height], scale: r3(scale), idleClip: 'sacred-idle.mp4 (loops 101/30 s)', openClip: 'sacred-open.mp4 (drag progress -> source time)' },
  instructionBar: { left: ae.instruction.x, top: ae.instruction.y, width: ae.instruction.width, height: ae.instruction.height, text: ae.instruction.text, baked: true },
  dragGuide: { left: ae.futureDragGuide.x, top: ae.futureDragGuide.y, width: ae.futureDragGuide.width, height: ae.futureDragGuide.height, source: 'AE reserved area (futureDragGuide)' },
  autoOpen: 'No on-screen button (removed v4 for layout balance). Enter on the scroll or a tap after a playback failure runs the 1.8x path.',
  backButton: { label: '← BACK', note: 'App control above the emblem, same style as the choose screen HOME pill' }
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'layout.json'), JSON.stringify(out, null, 2) + '\n');
console.log('slot', JSON.stringify(slot));

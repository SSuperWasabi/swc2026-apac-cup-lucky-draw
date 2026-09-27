// Prints a compact outline of an extract/<name>/structure.json.
// Usage: node summarize.cjs <extract-dir>
const s = require(require('path').resolve(process.argv[2], 'structure.json'));
const f3 = n => (typeof n === 'number' ? n.toFixed(2) : n);
console.log(`roots=${JSON.stringify(s.roots)} fonts=${JSON.stringify(s.missingOrSubstitutedFonts)}`);
const miss = s.footage.filter(f => f.missing);
console.log('missing:', miss.length);
miss.forEach(f => console.log('  MISSING', f.name, f.missingFootagePath || f.file));
const ext = s.footage.filter(f => f.file && !/swc2026_oap_APAC_Final|SWC2026 APAC Cup_Lucky Draw App/i.test(f.file));
console.log('external:', ext.length);
ext.forEach(f => console.log('  EXT', f.file, 'usedIn=' + f.usedIn));
for (const c of s.comps) {
  console.log(`\n## ${c.name} ${c.width}x${c.height} ${c.frameRate}fps ${c.duration}s wa=${f3(c.workAreaStart)}+${f3(c.workAreaDuration)} markers=${JSON.stringify(c.markers.map(m => [m.t, m.comment]))}`);
  for (const l of c.layers) {
    if (!l.enabled && !l.isTrackMatte) continue;
    const anim = l.props.filter(p => p.keys || p.expression).map(p =>
      p.path.replace(/^변형 > /, '') + (p.keys ? `[${p.keys.length}k ${f3(p.keys[0].t)}-${f3(p.keys[p.keys.length - 1].t)}]` : '') + (p.expression ? '[expr]' : ''));
    const bits = [
      `  ${l.index} ${l.type} "${l.name}"`,
      l.source ? `<${l.source.name}>` : '',
      `${f3(l.inPoint)}-${f3(l.outPoint)}`,
      l.parent ? `p=${l.parent}` : '',
      l.trackMatteType && l.trackMatteType !== 'NO_TRACK_MATTE' ? `matte=${l.trackMatteType}` : '',
      l.isTrackMatte ? 'IS_MATTE' : '',
      l.blendingMode && l.blendingMode !== 'NORMAL' ? `blend=${l.blendingMode}` : '',
      l.effects ? 'fx=' + l.effects.map(e => e.name).join('|') : '',
      l.masks ? `masks=${l.masks.length}` : '',
      anim.join(', ')
    ];
    console.log(bits.filter(Boolean).join(' ').slice(0, 400));
  }
}

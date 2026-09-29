// Exports CHOOSE YOUR SCROLL v8 app assets from the AE copy. Never saves the project.
// Expects a global JOB = { project, out, texts? } — texts maps a root layer name to replacement text
// (e.g. the baked subtitle), applied before anything is rendered.
(function () {
  var ROOT = '21-1_CHOOSE_YOUR_SCROLL_INTRO_THEN_LOOP_V8';
  var log = [];
  function write(name, text) {
    var f = new File(JOB.out + '/' + name);
    f.encoding = 'UTF-8';
    if (!f.open('w')) throw new Error('Cannot write ' + f.fsName);
    f.write(text);
    f.close();
  }
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function status(state, extra) { write('export-status.json', '{"state":' + q(state) + (extra ? ',' + extra : '') + ',"log":[' + (function () { var a = []; for (var i = 0; i < log.length; i++) a.push(q(log[i])); return a.join(','); })() + ']}'); }
  function find(name) {
    for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === name) return it; }
    throw new Error('Comp not found: ' + name);
  }
  // saveFrameToPng may complete asynchronously; wait until the file exists and its size settles.
  function savePng(comp, t, file) {
    var f = new File(file);
    if (f.exists) f.remove();
    comp.saveFrameToPng(t, f);
    var last = -1, stable = 0;
    for (var i = 0; i < 600; i++) {
      $.sleep(100);
      f = new File(file);
      if (f.exists && f.length > 0) {
        if (f.length === last) { if (++stable >= 3) return f.length; } else { stable = 0; last = f.length; }
      }
    }
    throw new Error('PNG not written: ' + file);
  }

  app.beginSuppressDialogs();
  try {
    var outDir = new Folder(JOB.out);
    if (!outDir.exists) outDir.create();
    new Folder(JOB.out + '/assets').create();
    new Folder(JOB.out + '/bg-seq').create();
    new Folder(JOB.out + '/verify').create();
    status('running');
    if (app.project && (app.project.file || app.project.numItems > 0)) throw new Error('AE has a project open; refusing to continue.');
    app.open(new File(JOB.project));
    var root = find(ROOT);
    if (JOB.texts) for (var name in JOB.texts) {
      var doc = root.layer(name).property('ADBE Text Properties').property('ADBE Text Document');
      if (doc.numKeys > 0) throw new Error('Text is keyframed: ' + name);
      var v = doc.value; log.push(name + ': "' + v.text + '" -> "' + JOB.texts[name] + '"'); v.text = JOB.texts[name]; doc.setValue(v);
    }

    // 1) Reference frames with every layer as authored.
    savePng(root, 3, JOB.out + '/verify/full-t3.png');
    savePng(root, 0.6, JOB.out + '/verify/full-t0.6.png');
    log.push('reference frames saved');

    // 2) Interactive element PNGs at native precomp size.
    var interactive = [];
    for (var i = 1; i <= root.numLayers; i++) {
      var l = root.layer(i);
      if (!l.enabled || !(l.source instanceof CompItem)) continue;
      // Plain if/else: nested ternaries mis-evaluated in ExtendScript.
      var srcName = l.source.name, id = null, m = srcName.match(/SCROLL_CARD_(\d+)/);
      if (m) id = 'scroll-' + m[1];
      else if (srcName.indexOf('RANDOM') >= 0) id = 'random';
      else if (srcName.indexOf('BUTTON') >= 0) id = 'select';
      if (id === null) continue;
      interactive.push(l);
      var bytes = savePng(l.source, 3, JOB.out + '/assets/' + id + '.png');
      log.push(id + ' <- ' + l.source.name + ' ' + l.source.width + 'x' + l.source.height + ' ' + bytes + 'B');
    }
    if (interactive.length !== 14) throw new Error('Expected 14 interactive layers, got ' + interactive.length);

    // 3) Background-only frames: hide interactive layers, render 0-6 s as PNG sequence.
    for (var k = 0; k < interactive.length; k++) interactive[k].enabled = false;
    savePng(root, 3, JOB.out + '/verify/bg-t3.png');

    var rq = app.project.renderQueue;
    for (var n = 1; n <= rq.numItems; n++) if (rq.item(n).status === RQItemStatus.QUEUED) rq.item(n).render = false;
    var item = rq.items.add(root);
    item.timeSpanStart = 0;
    item.timeSpanDuration = 6;
    var om = item.outputModule(1), tpl = null, names = om.templates;
    // Korean AE ships no PNG sequence template; use the TIFF-with-alpha sequence template.
    for (var t = 0; t < names.length; t++) if (/TIFF/i.test(names[t])) { tpl = names[t]; break; }
    if (!tpl) throw new Error('No TIFF output template. Available: ' + names.join(' | '));
    om.applyTemplate(tpl);
    om.file = new File(JOB.out + '/bg-seq/bg_[#####].tif');
    log.push('render template: ' + tpl + '; settings: ' + item.getSettings(GetSettingsFormat.STRING)['Resolution']);
    var t0 = new Date().getTime();
    rq.render();
    log.push('render seconds: ' + (new Date().getTime() - t0) / 1000 + ' status=' + item.status);

    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    status('ok');
  } catch (err) {
    try { status('error', '"message":' + q(err.message) + ',"line":' + err.line); } catch (e2) {}
    try { if (app.project && app.project.file) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e3) {}
  }
  app.endSuppressDialogs(false);
})();

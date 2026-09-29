// Renders one comp of an AE copy to an alpha TIFF sequence and saves reference PNG frames.
// Never saves the project. Expects a global JOB = {
//   project, out, comp, start, duration,          // render span in seconds (comp null = refs only)
//   hide: [layer names to disable before render], // optional
//   moveY: { layerName: dy, ... },               // optional vertical shift in comp px
//   refs: [{ comp, t, file }]                     // optional reference frames (as authored)
// }.
(function () {
  var log = [];
  function write(name, text) {
    var f = new File(JOB.out + '/' + name);
    f.encoding = 'UTF-8';
    if (!f.open('w')) throw new Error('Cannot write ' + f.fsName);
    f.write(text);
    f.close();
  }
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function status(state, extra) {
    var a = [];
    for (var i = 0; i < log.length; i++) a.push(q(log[i]));
    write('render-status.json', '{"state":' + q(state) + (extra ? ',' + extra : '') + ',"log":[' + a.join(',') + ']}');
  }
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
    new Folder(JOB.out).create();
    new Folder(JOB.out + '/seq').create();
    new Folder(JOB.out + '/verify').create();
    status('running');
    if (app.project && (app.project.file || app.project.numItems > 0)) throw new Error('AE has a project open; refusing to continue.');
    app.open(new File(JOB.project));

    var refs = JOB.refs || [];
    for (var r = 0; r < refs.length; r++) {
      savePng(find(refs[r].comp), refs[r].t, JOB.out + '/verify/' + refs[r].file);
      log.push('ref ' + refs[r].file + ' <- ' + refs[r].comp + ' @' + refs[r].t);
    }

    if (!JOB.comp) { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); status('ok'); app.endSuppressDialogs(false); return; } // refs only
    var comp = find(JOB.comp), hide = JOB.hide || [];
    for (var h = 0; h < hide.length; h++) { comp.layer(hide[h]).enabled = false; log.push('hidden: ' + hide[h]); }
    var moves = JOB.moveY || {};
    for (var name in moves) {
      if (!moves.hasOwnProperty(name)) continue;
      var pos = comp.layer(name).property('ADBE Transform Group').property('ADBE Position');
      if (pos.numKeys > 0) throw new Error('Animated position, not shifted: ' + name);
      var v = pos.value; v[1] += moves[name]; pos.setValue(v);
      log.push('moved ' + name + ' by ' + moves[name] + ' -> y=' + v[1]);
    }

    var rq = app.project.renderQueue;
    for (var n = 1; n <= rq.numItems; n++) if (rq.item(n).status === RQItemStatus.QUEUED) rq.item(n).render = false;
    var item = rq.items.add(comp);
    item.timeSpanStart = JOB.start;
    item.timeSpanDuration = JOB.duration;
    var om = item.outputModule(1), tpl = null, names = om.templates;
    // Korean AE ships no PNG sequence template; use the TIFF-with-alpha sequence template.
    for (var t = 0; t < names.length; t++) if (/TIFF/i.test(names[t])) { tpl = names[t]; break; }
    if (!tpl) throw new Error('No TIFF output template. Available: ' + names.join(' | '));
    om.applyTemplate(tpl);
    om.file = new File(JOB.out + '/seq/f_[#####].tif');
    var t0 = new Date().getTime();
    rq.render();
    log.push('render ' + JOB.comp + ' ' + JOB.start + '+' + JOB.duration + 's in ' + (new Date().getTime() - t0) / 1000 + 's status=' + item.status);

    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    status('ok');
  } catch (err) {
    try { status('error', '"message":' + q(err.message) + ',"line":' + err.line); } catch (e2) {}
    try { if (app.project && app.project.file) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e3) {}
  }
  app.endSuppressDialogs(false);
})();

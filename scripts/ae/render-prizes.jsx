// Renders one OAP v5 win video per prize from the WIN_PRIZE template copy. Never saves the project.
// Expects a global JOB = {
//   project, out, seconds,
//   prizes: [{ id, name, png }]   // name goes into EDIT_02_PRIZE_NAME, png replaces the prize cutout
// }.
(function () {
  var MASTER = '15_WIN_PRIZE_IPAD_MASTER_V5', CUTOUT = 'EDIT_01_PRIZE_CUTOUT_V2';
  var REVEAL = 'PRIZE REVEAL - original animation', NAME = 'EDIT_02_PRIZE_NAME';
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
    new Folder(JOB.out + '/verify').create();
    status('running');
    if (app.project && (app.project.file || app.project.numItems > 0)) throw new Error('AE has a project open; refusing to continue.');
    app.open(new File(JOB.project));
    var master = find(MASTER), cutout = find(CUTOUT);

    var rq = app.project.renderQueue;
    for (var n = 1; n <= rq.numItems; n++) if (rq.item(n).status === RQItemStatus.QUEUED) rq.item(n).render = false;

    for (var p = 0; p < JOB.prizes.length; p++) {
      var prize = JOB.prizes[p];
      var png = new File(prize.png);
      if (!png.exists) throw new Error('Missing cutout: ' + prize.png);
      var footage = app.project.importFile(new ImportOptions(png));

      // Own copies of the cutout precomp and the master, so every prize keeps the template animation.
      var pre = cutout.duplicate();
      pre.name = 'EDIT_01_' + prize.id;
      pre.layer(1).replaceSource(footage, false);
      var comp = master.duplicate();
      comp.name = 'WIN_' + prize.id;
      comp.layer(REVEAL).replaceSource(pre, false);
      var text = comp.layer(NAME).property('ADBE Text Properties').property('ADBE Text Document');
      if (text.numKeys > 0) throw new Error('Prize name is keyframed');
      var doc = text.value;
      doc.text = prize.name;
      text.setValue(doc);

      savePng(comp, 6, JOB.out + '/verify/' + prize.id + '.png');

      var item = rq.items.add(comp);
      item.timeSpanStart = 0;
      item.timeSpanDuration = JOB.seconds;
      var om = item.outputModule(1), tpl = null, names = om.templates;
      for (var t = 0; t < names.length; t++) if (/H\.264/.test(names[t]) && /40Mbps/.test(names[t])) { tpl = names[t]; break; }
      if (!tpl) throw new Error('No H.264 40Mbps template. Available: ' + names.join(' | '));
      om.applyTemplate(tpl);
      om.file = new File(JOB.out + '/' + prize.id + '-2048.mp4');
      log.push(prize.id + ': ' + footage.width + 'x' + footage.height + ' "' + prize.name + '"');
    }

    var t0 = new Date().getTime();
    status('rendering');
    rq.render();
    log.push('render seconds: ' + (new Date().getTime() - t0) / 1000);
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    status('ok');
  } catch (err) {
    try { status('error', '"message":' + q(err.message) + ',"line":' + err.line); } catch (e2) {}
    try { if (app.project && app.project.file) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e3) {}
  }
  app.endSuppressDialogs(false);
})();

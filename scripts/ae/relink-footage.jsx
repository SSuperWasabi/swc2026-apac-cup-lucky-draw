// Relinks footage items whose file equals JOB.from to JOB.to, saves the (copied) project, closes it.
// Expects a global JOB = { project, from, to, out }.
(function () {
  function write(name, text) {
    var f = new File(JOB.out + '/' + name);
    f.encoding = 'UTF-8';
    if (!f.open('w')) throw new Error('Cannot write ' + f.fsName);
    f.write(text);
    f.close();
  }
  function q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function norm(p) { return String(p).replace(/\\/g, '/').toLowerCase(); }

  var result = [];
  app.beginSuppressDialogs();
  try {
    var outDir = new Folder(JOB.out);
    if (!outDir.exists) outDir.create();
    write('relink-status.json', '{"state":"running"}');
    if (app.project && (app.project.file || app.project.numItems > 0)) throw new Error('AE has a project open; refusing to continue.');
    if (norm(JOB.project).indexOf('/resource/oap/ae-work/') < 0) throw new Error('Refusing to save a project outside the ae-work copy.');

    var to = new File(JOB.to);
    if (!to.exists) throw new Error('Target file missing: ' + JOB.to);
    var proj = app.open(new File(JOB.project));
    var matched = 0;
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (!(it instanceof FootageItem) || !(it.mainSource instanceof FileSource) || !it.mainSource.file) continue;
      if (norm(it.mainSource.file.fsName) !== norm(new File(JOB.from).fsName)) continue;
      var before = { w: it.width, h: it.height, usedIn: it.usedIn.length, alpha: it.mainSource.alphaMode };
      it.replace(to);
      matched++;
      result.push('{"name":' + q(it.name) + ',"usedIn":' + it.usedIn.length + ',"before":' + q(before.w + 'x' + before.h + ' usedIn=' + before.usedIn) +
        ',"after":' + q(it.width + 'x' + it.height) + ',"file":' + q(it.mainSource.file.fsName) + ',"missing":' + it.footageMissing + '}');
      if (it.width !== before.w || it.height !== before.h || it.usedIn.length !== before.usedIn || it.footageMissing) throw new Error('Post-relink mismatch on ' + it.name);
    }
    if (!matched) throw new Error('No footage matched ' + JOB.from);
    app.project.save();
    app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    write('relink-status.json', '{"state":"ok","matched":' + matched + ',"items":[' + result.join(',') + ']}');
  } catch (err) {
    try { write('relink-status.json', '{"state":"error","message":' + q(err.message) + ',"line":' + err.line + ',"items":[' + result.join(',') + ']}'); } catch (e2) {}
    try { if (app.project && app.project.file) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e3) {}
  }
  app.endSuppressDialogs(false);
})();

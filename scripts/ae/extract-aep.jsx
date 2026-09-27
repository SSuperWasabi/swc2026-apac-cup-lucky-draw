// Read-only AEP structure extractor.
// Expects a global JOB = { project, out, roots: [compName...], closeAfter }.
// Opens the project, dumps comps/layers/keyframes/footage to JSON, closes WITHOUT saving.
(function () {
  var started = new Date().getTime();
  var outDir = new Folder(JOB.out);
  var log = [];

  function esc(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/[\x00-\x1f]/g, ' ');
  }
  function stringify(v, ind) {
    ind = ind || '';
    var nx = ind + ' ', i, parts, k;
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return '"' + esc(v) + '"';
    if (v instanceof Array) {
      if (!v.length) return '[]';
      var flat = true;
      for (i = 0; i < v.length; i++) if (typeof v[i] === 'object' && v[i] !== null) flat = false;
      parts = [];
      for (i = 0; i < v.length; i++) parts.push(stringify(v[i], nx));
      return flat ? '[' + parts.join(',') + ']' : '[\n' + nx + parts.join(',\n' + nx) + '\n' + ind + ']';
    }
    parts = [];
    for (k in v) if (v.hasOwnProperty(k)) parts.push('"' + esc(k) + '": ' + stringify(v[k], nx));
    return parts.length ? '{\n' + nx + parts.join(',\n' + nx) + '\n' + ind + '}' : '{}';
  }
  function writeFile(name, text) {
    var f = new File(outDir.fsName + '/' + name);
    f.encoding = 'UTF-8';
    f.lineFeed = 'Unix';
    if (!f.open('w')) throw new Error('Cannot write ' + f.fsName + ' (enable Allow Scripts to Write Files)');
    f.write(text);
    f.close();
  }
  function tryGet(fn, fallback) { try { return fn(); } catch (e) { return fallback === undefined ? null : fallback; } }

  var INTERP = {}; INTERP[KeyframeInterpolationType.LINEAR] = 'linear';
  INTERP[KeyframeInterpolationType.BEZIER] = 'bezier'; INTERP[KeyframeInterpolationType.HOLD] = 'hold';
  var BLEND = {};
  (function () { for (var k in BlendingMode) if (typeof BlendingMode[k] === 'number' || BlendingMode[k] !== undefined) BLEND[BlendingMode[k]] = k; })();
  var MATTE = {};
  (function () { for (var k in TrackMatteType) MATTE[TrackMatteType[k]] = k; })();

  function val(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof TextDocument) {
      return {
        text: tryGet(function () { return v.text; }),
        font: tryGet(function () { return v.font; }),
        fontFamily: tryGet(function () { return v.fontFamily; }),
        fontStyle: tryGet(function () { return v.fontStyle; }),
        fontSize: tryGet(function () { return v.fontSize; }),
        fillColor: tryGet(function () { return v.applyFill ? v.fillColor : null; }),
        strokeColor: tryGet(function () { return v.applyStroke ? v.strokeColor : null; }),
        strokeWidth: tryGet(function () { return v.applyStroke ? v.strokeWidth : null; }),
        tracking: tryGet(function () { return v.tracking; }),
        leading: tryGet(function () { return v.leading; }),
        autoLeading: tryGet(function () { return v.autoLeading; }),
        justification: tryGet(function () { return String(v.justification); }),
        allCaps: tryGet(function () { return v.allCaps; }),
        boxText: tryGet(function () { return v.boxText; }),
        boxTextSize: tryGet(function () { return v.boxText ? v.boxTextSize : null; }),
        boxTextPos: tryGet(function () { return v.boxText ? v.boxTextPos : null; })
      };
    }
    if (v instanceof Shape) return { closed: v.closed, vertices: v.vertices, inTangents: v.inTangents, outTangents: v.outTangents, featherCount: tryGet(function () { return v.featherSegLocs.length; }, 0) };
    if (v instanceof MarkerValue) return { comment: v.comment, duration: v.duration, chapter: v.chapter, url: v.url };
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(val(v[i])); return a; }
    var t = typeof v;
    if (t === 'number' || t === 'boolean' || t === 'string') return v;
    return String(v);
  }

  function easeArr(arr) {
    if (!arr) return null;
    var r = [];
    for (var i = 0; i < arr.length; i++) r.push({ speed: arr[i].speed, influence: arr[i].influence });
    return r;
  }

  function dumpProp(p, inTransform) {
    var hasKeys = p.numKeys > 0;
    var hasExpr = tryGet(function () { return p.canSetExpression && p.expressionEnabled && p.expression !== ''; }, false);
    var isText = p.propertyValueType === PropertyValueType.TEXT_DOCUMENT;
    if (!hasKeys && !hasExpr && !inTransform && !isText) return null;
    if (p.propertyValueType === PropertyValueType.NO_VALUE || p.propertyValueType === PropertyValueType.CUSTOM_VALUE) {
      return hasExpr ? { name: p.name, matchName: p.matchName, expression: p.expression } : null;
    }
    var o = { name: p.name, matchName: p.matchName };
    if (!hasKeys) o.value = val(tryGet(function () { return p.value; }));
    if (hasExpr) {
      o.expression = p.expression;
      o.expressionError = tryGet(function () { return p.expressionError; }, '');
    }
    if (p.dimensionsSeparated) o.dimensionsSeparated = true;
    if (hasKeys) {
      o.keys = [];
      for (var k = 1; k <= p.numKeys; k++) {
        (function (k) {
          var key = {
            t: p.keyTime(k),
            v: val(p.keyValue(k)),
            inInterp: INTERP[p.keyInInterpolationType(k)] || String(p.keyInInterpolationType(k)),
            outInterp: INTERP[p.keyOutInterpolationType(k)] || String(p.keyOutInterpolationType(k))
          };
          var ei = tryGet(function () { return easeArr(p.keyInTemporalEase(k)); });
          var eo = tryGet(function () { return easeArr(p.keyOutTemporalEase(k)); });
          if (ei) key.easeIn = ei;
          if (eo) key.easeOut = eo;
          if (tryGet(function () { return p.keyTemporalAutoBezier(k); }, false)) key.autoBezier = true;
          if (tryGet(function () { return p.keyTemporalContinuous(k); }, false)) key.continuous = true;
          if (p.isSpatial) {
            key.spIn = tryGet(function () { return p.keyInSpatialTangent(k); });
            key.spOut = tryGet(function () { return p.keyOutSpatialTangent(k); });
            if (tryGet(function () { return p.keyRoving(k); }, false)) key.roving = true;
          }
          o.keys.push(key);
        })(k);
      }
    }
    return o;
  }

  function walk(group, inTransform, out, path) {
    for (var i = 1; i <= group.numProperties; i++) {
      var p = tryGet(function () { return group.property(i); });
      if (!p) continue;
      var here = path ? path + ' > ' + p.name : p.name;
      if (p.propertyType === PropertyType.PROPERTY) {
        var d = dumpProp(p, inTransform);
        if (d) { d.path = here; out.push(d); }
      } else {
        if (tryGet(function () { return p.canSetEnabled && !p.enabled; }, false)) continue;
        walk(p, inTransform || p.matchName === 'ADBE Transform Group', out, here);
      }
    }
  }

  function markers(mp) {
    var r = [];
    if (!mp) return r;
    for (var i = 1; i <= mp.numKeys; i++) r.push({ t: mp.keyTime(i), comment: mp.keyValue(i).comment, duration: mp.keyValue(i).duration });
    return r;
  }

  function layerType(l) {
    if (l instanceof TextLayer) return 'text';
    if (l instanceof ShapeLayer) return 'shape';
    if (l instanceof CameraLayer) return 'camera';
    if (l instanceof LightLayer) return 'light';
    if (l instanceof AVLayer) {
      var s = l.source;
      if (s instanceof CompItem) return 'precomp';
      if (s && s.mainSource instanceof SolidSource) return l.nullLayer ? 'null' : 'solid';
      return 'footage';
    }
    return 'unknown';
  }

  function dumpLayer(l) {
    var o = {
      index: l.index, name: l.name, type: layerType(l),
      enabled: l.enabled, solo: l.solo, shy: l.shy, locked: l.locked,
      inPoint: l.inPoint, outPoint: l.outPoint, startTime: l.startTime, stretch: l.stretch,
      parent: l.parent ? l.parent.index : null, label: l.label, comment: l.comment
    };
    if (l instanceof AVLayer) {
      o.source = l.source ? { name: l.source.name, id: l.source.id, width: tryGet(function () { return l.source.width; }), height: tryGet(function () { return l.source.height; }) } : null;
      o.width = l.width; o.height = l.height;
      o.blendingMode = BLEND[l.blendingMode] || String(l.blendingMode);
      o.threeD = l.threeDLayer; o.adjustment = l.adjustmentLayer; o.guide = l.guideLayer;
      o.collapse = l.collapseTransformation; o.motionBlur = l.motionBlur;
      o.timeRemap = l.timeRemapEnabled;
      o.isTrackMatte = l.isTrackMatte;
      o.trackMatteType = MATTE[l.trackMatteType] || String(l.trackMatteType);
      o.trackMatteLayer = tryGet(function () { return l.trackMatteLayer ? l.trackMatteLayer.index : null; });
      o.audioEnabled = tryGet(function () { return l.audioEnabled; });
      o.rectAtIn = tryGet(function () {
        var r = l.sourceRectAtTime(Math.max(l.inPoint, 0), false);
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
    }
    var fx = l.property('ADBE Effect Parade');
    if (fx && fx.numProperties) {
      o.effects = [];
      for (var e = 1; e <= fx.numProperties; e++) o.effects.push({ name: fx.property(e).name, matchName: fx.property(e).matchName, enabled: fx.property(e).enabled });
    }
    var masks = l.property('ADBE Mask Parade');
    if (masks && masks.numProperties) {
      o.masks = [];
      for (var m = 1; m <= masks.numProperties; m++) o.masks.push({ name: masks.property(m).name, mode: String(masks.property(m).maskMode), inverted: masks.property(m).inverted });
    }
    o.markers = markers(l.property('ADBE Marker'));
    o.props = [];
    walk(l, false, o.props, '');
    return o;
  }

  function dumpComp(c) {
    var o = {
      name: c.name, id: c.id, width: c.width, height: c.height, pixelAspect: c.pixelAspect,
      frameRate: c.frameRate, duration: c.duration, frames: Math.round(c.duration * c.frameRate),
      workAreaStart: c.workAreaStart, workAreaDuration: c.workAreaDuration,
      displayStartTime: c.displayStartTime, bgColor: c.bgColor,
      folder: c.parentFolder ? c.parentFolder.name : null, comment: c.comment,
      markers: markers(c.markerProperty), layers: []
    };
    for (var i = 1; i <= c.numLayers; i++) o.layers.push(dumpLayer(c.layer(i)));
    return o;
  }

  function status(obj) { writeFile('status.json', stringify(obj)); }

  app.beginSuppressDialogs();
  try {
    if (!outDir.exists) outDir.create();
    // Probe write permission before touching any project.
    writeFile('status.json', stringify({ state: 'running', startedAt: String(new Date()) }));

    if (app.project && app.project.file) throw new Error('A saved project is already open: ' + app.project.file.fsName);
    if (app.project && app.project.numItems > 0) throw new Error('Current untitled project is not empty; refusing to replace it.');

    var pf = new File(JOB.project);
    if (!pf.exists) throw new Error('Project not found: ' + JOB.project);
    var proj = app.open(pf);
    if (!proj) throw new Error('app.open returned null');

    var comps = [], footage = [], byName = {};
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (it instanceof CompItem) {
        comps.push({ name: it.name, id: it.id, width: it.width, height: it.height, frameRate: it.frameRate, duration: it.duration, numLayers: it.numLayers, folder: it.parentFolder ? it.parentFolder.name : null, usedIn: it.usedIn.length });
        (byName[it.name] = byName[it.name] || []).push(it);
      } else if (it instanceof FootageItem) {
        var ms = it.mainSource, f = {
          name: it.name, id: it.id, usedIn: it.usedIn.length,
          kind: ms instanceof FileSource ? 'file' : ms instanceof SolidSource ? 'solid' : ms instanceof PlaceholderSource ? 'placeholder' : 'other',
          width: it.width, height: it.height, duration: it.duration, frameRate: it.frameRate,
          missing: it.footageMissing, isStill: tryGet(function () { return ms.isStill; }),
          hasAlpha: tryGet(function () { return ms.hasAlpha; })
        };
        if (ms instanceof FileSource) {
          f.file = ms.file ? ms.file.fsName : null;
          f.missingFootagePath = tryGet(function () { return ms.missingFootagePath; });
        }
        if (f.kind !== 'solid') footage.push(f);
      }
    }

    // Full detail for root comps and every precomp reachable from them.
    var detailed = [], seen = {}, missingRoots = [];
    function visit(c) {
      if (seen[c.id]) return;
      seen[c.id] = true;
      detailed.push(dumpComp(c));
      for (var j = 1; j <= c.numLayers; j++) {
        var s = c.layer(j).source;
        if (s instanceof CompItem && c.layer(j).enabled) visit(s);
        else if (s instanceof CompItem) log.push('Disabled precomp layer skipped: ' + c.name + ' / ' + c.layer(j).name);
      }
    }
    if (JOB.rootPattern) {
      // Auto-pick top-level comps (not used inside other comps) whose name matches.
      var re = new RegExp(JOB.rootPattern, 'i');
      for (var ri = 1; ri <= proj.numItems; ri++) {
        var ci = proj.item(ri);
        if (ci instanceof CompItem && (JOB.rootAnyLevel || ci.usedIn.length === 0) && re.test(ci.name)) JOB.roots.push(ci.name);
      }
    }
    for (var r = 0; r < JOB.roots.length; r++) {
      var hits = byName[JOB.roots[r]];
      if (!hits) { missingRoots.push(JOB.roots[r]); continue; }
      if (hits.length > 1) log.push('Duplicate comp name, using first: ' + JOB.roots[r]);
      visit(hits[0]);
    }

    var fonts = [];
    tryGet(function () {
      var mf = app.fonts.missingOrSubstitutedFonts;
      for (var q = 0; q < mf.length; q++) fonts.push({ postScriptName: mf[q].postScriptName, family: mf[q].familyName, style: mf[q].styleName, isSubstitute: mf[q].isSubstitute });
    });

    var rq = [];
    for (var n = 1; n <= proj.renderQueue.numItems; n++) {
      var q = proj.renderQueue.item(n), oms = [];
      for (var m = 1; m <= q.numOutputModules; m++) oms.push(tryGet(function () { return q.outputModule(m).file ? q.outputModule(m).file.fsName : null; }));
      rq.push({ comp: q.comp ? q.comp.name : null, status: String(q.status), render: q.render, timeSpanStart: q.timeSpanStart, timeSpanDuration: q.timeSpanDuration, outputs: oms });
    }

    writeFile('structure.json', stringify({
      extractedAt: String(new Date()), aeVersion: app.version, project: JOB.project,
      bitsPerChannel: proj.bitsPerChannel, roots: JOB.roots, missingRoots: missingRoots,
      missingOrSubstitutedFonts: fonts,
      footage: footage, compIndex: comps, comps: detailed, renderQueue: rq, notes: log
    }));

    if (JOB.closeAfter) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    status({ state: 'ok', seconds: (new Date().getTime() - started) / 1000, comps: comps.length, detailedComps: detailed.length, footage: footage.length, missingRoots: missingRoots, closed: !!JOB.closeAfter, notes: log });
  } catch (err) {
    try { status({ state: 'error', message: err.message, line: err.line, notes: log }); } catch (e2) {}
    try { if (JOB.closeAfter && app.project && app.project.file && app.project.file.fsName === new File(JOB.project).fsName) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e3) {}
  }
  app.endSuppressDialogs(false);
})();

/*  TransitionLab for After Effects  -  v1.0.1
    Procedural, never-the-same transitions at the playhead cut. Built only on native AE effects.

    Install : copy this file AND the "assets" folder next to it into
              <AE>/Support Files/Scripts/ScriptUI Panels/  (then Window > TransitionLab.jsx)
              or run once via File > Scripts > Run Script File.
    Headless: $.global.TL_HEADLESS = true; $.evalFile(file);
              TL.generate({ style: "FilmFlash", duration: "medium", seed: 123, sfx: true });
*/
(function (thisObj) {

var TL = $.global.TL = {};
TL.VERSION = "1.0.1";
var SETTINGS = "TransitionLab";
var HIT = 0.5;              // every SFX has its hit at 0.5 s
var SCRIPT_FILE = File($.fileName);

var STYLES = [
    { id: "PhotoMatchCut",  name: "Photo Match Cut" },
    { id: "Scrapbook",      name: "Scrapbook" },
    { id: "AestheticFilm",  name: "Aesthetic Film" },
    { id: "PunchHole",      name: "Punch Hole" },
    { id: "OpticalGlare",   name: "Optical Glare" },
    { id: "Paper",          name: "Paper" },
    { id: "Horror",         name: "Horror" },
    { id: "VHS",            name: "VHS" },
    { id: "FilmFlash",      name: "Film Flash" },
    { id: "LensFlares",     name: "Lens Flares" },
    { id: "SlideProjector", name: "Slide Projector" }
];
var DUR = { "short": 0.55, "medium": 0.85, "long": 1.3 };

// ------------------------------------------------------------------ utils
function RNG(seed) { this.s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; }
RNG.prototype.next = function () { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; };
RNG.prototype.f = function (a, b) { return a + (b - a) * this.next(); };
RNG.prototype.i = function (a, b) { return Math.floor(this.f(a, b + 1 - 1e-9)); };
RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };
RNG.prototype.chance = function (p) { return this.next() < p; };
RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
RNG.prototype.shuffle = function (arr) { var a = arr.slice(0); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(this.next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function styleById(id) { for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i]; return null; }
function getSetting(k, d) { try { if (app.settings.haveSetting(SETTINGS, k)) return app.settings.getSetting(SETTINGS, k); } catch (e) {} return d; }
function setSetting(k, v) { try { app.settings.saveSetting(SETTINGS, k, String(v)); } catch (e) {} }

// ------------------------------------------------------------------ keyframes
function dimsOf(p) {
    if (p.isSpatial) return 1;
    var t = p.propertyValueType;
    if (t === PropertyValueType.TwoD) return 2;
    if (t === PropertyValueType.ThreeD) return 3;
    return 1;
}
function speeds(p, a, b, dt) {
    var i, r = [];
    if (p.isSpatial) { var s = 0; for (i = 0; i < a.length; i++) s += (b[i] - a[i]) * (b[i] - a[i]); return [Math.sqrt(s) / dt]; }
    if (a instanceof Array) { for (i = 0; i < dimsOf(p); i++) r.push(i < a.length && i < b.length ? (b[i] - a[i]) / dt : 0); return r; }
    return [(b - a) / dt];
}
function eases(d, spd, mult, infl) {
    var r = [];
    for (var i = 0; i < d; i++) r.push(new KeyframeEase(spd ? spd[Math.min(i, spd.length - 1)] * mult : 0, infl));
    return r;
}
// keys: [[t, v, segType], ...]  segType for the segment starting at that key: io | in | out | lin | hold
function anim(p, keys) {
    var n = keys.length, T = [], V = [], k;
    for (k = 0; k < n; k++) { T.push(keys[k][0]); V.push(keys[k][1]); }
    p.setValuesAtTimes(T, V);
    var d = dimsOf(p), inE = [], outE = [], inT = [], outT = [];
    var B = KeyframeInterpolationType.BEZIER, L = KeyframeInterpolationType.LINEAR, H = KeyframeInterpolationType.HOLD;
    for (k = 0; k < n; k++) { inE[k] = eases(d, null, 0, 33.4); outE[k] = eases(d, null, 0, 33.4); inT[k] = B; outT[k] = B; }
    for (k = 0; k < n - 1; k++) {
        var tp = keys[k][2] || "io", dt = Math.max(1e-4, T[k + 1] - T[k]);
        var sp = (V[k] instanceof Array || typeof V[k] === "number") ? speeds(p, V[k], V[k + 1], dt) : null;
        if (tp === "io") { outE[k] = eases(d, null, 0, 65); inE[k + 1] = eases(d, null, 0, 65); }
        else if (tp === "in") { outE[k] = eases(d, null, 0, 85); inE[k + 1] = eases(d, sp, 2.4, 22); }
        else if (tp === "out") { outE[k] = eases(d, sp, 2.4, 22); inE[k + 1] = eases(d, null, 0, 85); }
        else if (tp === "soft") { outE[k] = eases(d, null, 0, 40); inE[k + 1] = eases(d, null, 0, 40); }
        else if (tp === "lin") { outT[k] = L; inT[k + 1] = L; }
        else if (tp === "hold") { outT[k] = H; }
    }
    for (k = 0; k < n; k++) {
        var idx = p.nearestKeyIndex(T[k]);
        try { if (inT[k] === B || outT[k] === B) p.setTemporalEaseAtKey(idx, inE[k], outE[k]); } catch (e1) {}
        try { p.setInterpolationTypeAtKey(idx, inT[k], outT[k]); } catch (e2) {}
        if (p.isSpatial) {
            try { var z = (V[k].length === 3) ? [0, 0, 0] : [0, 0]; p.setSpatialAutoBezierAtKey(idx, false); p.setSpatialTangentsAtKey(idx, z, z); } catch (e3) {}
        }
    }
    return p;
}
function holdKeys(p, T, V) {
    p.setValuesAtTimes(T, V);
    for (var k = 0; k < T.length; k++) { try { p.setInterpolationTypeAtKey(p.nearestKeyIndex(T[k]), KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); } catch (e) {} }
    return p;
}
function clearKeys(p) { try { while (p.numKeys > 0) p.removeKey(p.numKeys); } catch (e) {} }

// ------------------------------------------------------------------ effects / masks / shapes
function fx(layer, mn, vals) {
    var parade = layer.property("ADBE Effect Parade");
    var e = parade.addProperty(mn);
    if (vals) for (var k in vals) { if (vals.hasOwnProperty(k)) { try { e.property(parseInt(k, 10)).setValue(vals[k]); } catch (x) {} } }
    return e;
}
function tryFx(layer, mn, vals) { try { return fx(layer, mn, vals); } catch (e) { return null; } }
// CS Vignette when installed, else a black solid with a feathered subtract mask; property(1) drives the amount
function vignette(c, A, soft) {
    var e = tryFx(A, "CS Vignette", { 2: soft });
    if (e) return e;
    var L = c.solid("vignette", [0, 0, 0], A.inPoint, A.outPoint);
    addMask(L, ellipseShape(c.W / 2, c.H / 2, c.W * 0.62, c.H * 0.62), { feather: Math.min(c.W, c.H) * soft / 90, mode: MaskMode.SUBTRACT });
    L.opacity.setValue(0);
    return { property: function () { return L.opacity; } };
}

function maskShape(pts, inT, outT) { var s = new Shape(); s.vertices = pts; if (inT) s.inTangents = inT; if (outT) s.outTangents = outT; s.closed = true; return s; }
function addMask(layer, shape, o) {
    o = o || {};
    var m = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    m.property("ADBE Mask Shape").setValue(shape);
    if (o.feather) m.property("ADBE Mask Feather").setValue([o.feather, o.feather]);
    if (o.expansion) m.property("ADBE Mask Offset").setValue(o.expansion);
    if (o.mode) m.maskMode = o.mode;
    return m;
}
function ellipseShape(cx, cy, rx, ry) {
    var k = 0.5523;
    return maskShape([[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]],
        [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]],
        [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]]);
}
// jagged line from p to q (q excluded), n segments, amplitude amp
function jagLine(R, p, q, n, amp) {
    var pts = [], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len, o = 0;
    for (var i = 0; i < n; i++) {
        var k = i / n;
        o = o * 0.6 + R.f(-amp, amp) * 0.4;
        var j = o + R.f(-amp, amp) * 0.25;
        if (i === 0) j = 0;
        pts.push([p[0] + dx * k + nx * j, p[1] + dy * k + ny * j]);
    }
    return pts;
}
function rectPts(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
// rectangle whose four sides are torn (jagged)
function tornRect(R, x0, y0, x1, y1, amp, seg) {
    var pts = [];
    pts = pts.concat(jagLine(R, [x0, y0], [x1, y0], seg, amp));
    pts = pts.concat(jagLine(R, [x1, y0], [x1, y1], seg, amp));
    pts = pts.concat(jagLine(R, [x1, y1], [x0, y1], seg, amp));
    pts = pts.concat(jagLine(R, [x0, y1], [x0, y0], seg, amp));
    return pts;
}

function shapeGroup(layer, name) {
    var root = layer.property("ADBE Root Vectors Group");
    var g = root.addProperty("ADBE Vector Group"); g.name = name;
    return root.property(root.numProperties);
}
function shapeRect(layer, name, size, pos, round, color, opacity) {
    var g = shapeGroup(layer, name), c = g.property("ADBE Vectors Group");
    c.addProperty("ADBE Vector Shape - Rect");
    c.addProperty("ADBE Vector Graphic - Fill");
    var r = c.property(1); r.property("ADBE Vector Rect Size").setValue(size); r.property("ADBE Vector Rect Roundness").setValue(round || 0);
    c.property(2).property("ADBE Vector Fill Color").setValue(color);
    var tr = g.property("ADBE Vector Transform Group");
    tr.property("ADBE Vector Position").setValue(pos);
    if (opacity != null) tr.property("ADBE Vector Group Opacity").setValue(opacity);
    return g;
}
function shapeEllipse(layer, name, size, pos, color) {
    var g = shapeGroup(layer, name), c = g.property("ADBE Vectors Group");
    c.addProperty("ADBE Vector Shape - Ellipse");
    c.addProperty("ADBE Vector Graphic - Fill");
    c.property(1).property("ADBE Vector Ellipse Size").setValue(size);
    c.property(2).property("ADBE Vector Fill Color").setValue(color);
    g.property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue(pos);
    return g;
}
function addRepeater(group, copies, offset, posStep) {
    var c = group.property("ADBE Vectors Group");
    c.addProperty("ADBE Vector Filter - Repeater");
    var rp = c.property(c.numProperties);
    rp.property("ADBE Vector Repeater Copies").setValue(copies);
    rp.property("ADBE Vector Repeater Offset").setValue(offset);
    rp.property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position").setValue(posStep);
    return rp;
}

// ------------------------------------------------------------------ project bins / assets
function findFolder(name, parent) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FolderItem && it.name === name && (!parent || it.parentFolder === parent)) return it;
    }
    var f = app.project.items.addFolder(name);
    if (parent) f.parentFolder = parent;
    return f;
}
function rootBin() { return findFolder("TransitionLab", null); }
function bin(name) { return findFolder(name, rootBin()); }

function assetsFolder() {
    var saved = getSetting("assetsPath", "");
    if (saved && Folder(saved).exists) return Folder(saved);
    var cands = [SCRIPT_FILE.parent.fsName + "/assets", SCRIPT_FILE.parent.fsName + "/TransitionLab/assets"];
    for (var i = 0; i < cands.length; i++) if (Folder(cands[i]).exists) return Folder(cands[i]);
    return null;
}
function assetItems(styleId, kind) {
    var tag = "TLASSET:" + styleId + ":" + kind, r = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FootageItem && it.comment === tag) r.push(it);
    }
    return r;
}
function isImported(styleId) { return assetItems(styleId, "sfx").length > 0 || assetItems(styleId, "overlay").length > 0; }

TL.importStyle = function (styleId) {
    var root = assetsFolder();
    if (!root) return "assets folder not found";
    var st = styleById(styleId); if (!st) return "unknown style";
    var b = null, n = 0;
    var kinds = [["sfx", /\.(wav|aif|aiff|mp3)$/i], ["overlays", /\.(mov|mp4|avi|png|jpg|jpeg|psd|tif|tiff|webm|mxf)$/i]];
    for (var k = 0; k < kinds.length; k++) {
        var fol = Folder(root.fsName + "/" + styleId + "/" + kinds[k][0]);
        if (!fol.exists) continue;
        var tag = "TLASSET:" + styleId + ":" + (kinds[k][0] === "sfx" ? "sfx" : "overlay");
        var have = assetItems(styleId, kinds[k][0] === "sfx" ? "sfx" : "overlay"), haveMap = {};
        for (var h = 0; h < have.length; h++) { try { haveMap[have[h].mainSource.file.fsName] = 1; } catch (e) {} }
        var files = fol.getFiles(function (f) { return f instanceof File && kinds[k][1].test(f.name); });
        for (var i = 0; i < files.length; i++) {
            if (haveMap[files[i].fsName]) continue;
            try {
                var it = app.project.importFile(new ImportOptions(files[i]));
                if (!b) b = bin(st.name);
                it.parentFolder = b; it.comment = tag; n++;
            } catch (e2) {}
        }
    }
    return n;
};

// ------------------------------------------------------------------ cut detection
function isTG(L) { return L.comment && L.comment.indexOf("TL:") === 0; }
function isClip(L) {
    if (!(L instanceof AVLayer)) return L instanceof TextLayer || L instanceof ShapeLayer ? !isTG(L) && L.enabled : false;
    return L.enabled && L.hasVideo && !L.adjustmentLayer && !L.guideLayer && !L.nullLayer && !isTG(L);
}
function clipsOf(comp) { var r = []; for (var i = 1; i <= comp.numLayers; i++) { var L = comp.layer(i); if (isClip(L)) r.push(L); } return r; }
function topActive(clips, t) {
    var best = null;
    for (var i = 0; i < clips.length; i++) { var L = clips[i]; if (L.inPoint <= t + 1e-6 && L.outPoint > t + 1e-6 && (!best || L.index < best.index)) best = L; }
    return best;
}
function pairAt(clips, e, tol) {
    var ending = null, starting = null;
    for (var i = 0; i < clips.length; i++) {
        var L = clips[i];
        if (Math.abs(L.outPoint - e) < tol && (!ending || L.index < ending.index)) ending = L;
        if (Math.abs(L.inPoint - e) < tol && (!starting || L.index < starting.index)) starting = L;
    }
    return { A: ending, B: starting, pair: !!(ending && starting && ending !== starting) };
}
function findCut(comp, t, snap) {
    var fd = comp.frameDuration, tol = fd * 0.51, clips = clipsOf(comp), best = null, bestScore = 1e9;
    for (var i = 0; i < clips.length; i++) {
        var ed = [clips[i].inPoint, clips[i].outPoint];
        for (var j = 0; j < 2; j++) {
            var e = ed[j];
            if (e <= fd * 0.5 || e >= comp.duration - fd * 0.5 || Math.abs(e - t) > snap) continue;
            var pr = pairAt(clips, e, tol), score = Math.abs(e - t) + (pr.pair ? 0 : snap * 2);
            if (score < bestScore) { bestScore = score; best = { time: e, A: pr.A, B: pr.B, pair: pr.pair }; }
        }
    }
    if (!best) best = { time: t, A: null, B: null, pair: false };
    best.time = Math.round(best.time / fd) * fd;
    if (!best.A) best.A = topActive(clips, best.time - fd);
    if (!best.B) best.B = topActive(clips, best.time + fd * 0.01);
    return best;
}
function allCuts(comp) {
    var fd = comp.frameDuration, clips = clipsOf(comp), seen = {}, r = [];
    for (var i = 0; i < clips.length; i++) {
        var e = clips[i].outPoint, key = Math.round(e / fd);
        if (seen[key]) continue;
        var pr = pairAt(clips, e, fd * 0.51);
        if (pr.pair) { seen[key] = 1; r.push(key * fd); }
    }
    r.sort(function (a, b) { return a - b; });
    return r;
}

// ------------------------------------------------------------------ context
function nextIndex(comp) {
    var mx = 0;
    for (var i = 1; i <= comp.numLayers; i++) { var m = /^TL:(\d+)/.exec(comp.layer(i).comment || ""); if (m) mx = Math.max(mx, parseInt(m[1], 10)); }
    return mx + 1;
}

function Ctx(comp, cut, style, opts) {
    var c = this;
    c.comp = comp; c.W = comp.width; c.H = comp.height; c.fd = comp.frameDuration; c.fps = comp.frameRate;
    c.C = [comp.width / 2, comp.height / 2];
    c.u = Math.min(comp.width, comp.height) / 1080;        // size unit (1 = 1080p short side)
    c.cut = cut.time; c.A = cut.A; c.B = cut.B;
    c.ref = null;
    if (c.A && c.B) c.ref = c.A.index < c.B.index ? c.A : c.B; else c.ref = c.A || c.B;
    c.seed = opts.seed || (Math.floor(Math.random() * 2000000000) + 1);
    c.R = new RNG(c.seed);
    c.D = (DUR[opts.duration] || DUR.medium) * c.R.f(0.85, 1.2);
    c.opts = opts; c.style = style;
    c.uid = nextIndex(comp);
    c.tag = "TL" + pad2(c.uid) + " " + style.name;
    c.label = (c.uid % 15) + 1;
    c.last = null; c.layers = []; c.notes = [];
}
Ctx.prototype.span = function (L, tIn, tOut) {
    tIn = Math.max(0, tIn); tOut = Math.min(this.comp.duration, tOut);
    if (tOut <= tIn) tOut = tIn + this.fd;
    try { if (L.startTime > tIn) L.startTime = tIn; } catch (e) {}
    try { L.inPoint = tIn; L.outPoint = tOut; } catch (e2) {}
};
Ctx.prototype.place = function (L, name, tIn, tOut, o) {
    o = o || {};
    L.name = this.tag + " | " + name;
    L.comment = "TL:" + this.uid + ":" + this.style.id + ":" + this.seed;
    L.label = this.label;
    if (o.below) L.moveAfter(o.below);
    else if (this.last) L.moveBefore(this.last);
    else if (this.ref) L.moveBefore(this.ref);
    else L.moveToBeginning();
    if (!o.below) this.last = L;
    if (tIn != null) this.span(L, tIn, tOut);
    this.layers.push(L);
    return L;
};
Ctx.prototype.solid = function (name, color, tIn, tOut, o) {
    o = o || {};
    var w = Math.max(4, Math.round(o.w || this.W)), h = Math.max(4, Math.round(o.h || this.H));
    var L = this.comp.layers.addSolid(color, this.tag + " | " + name, w, h, 1, this.comp.duration);
    try { L.source.parentFolder = bin("Solids"); } catch (e) {}
    if (o.adj) L.adjustmentLayer = true;
    if (o.blend) L.blendingMode = o.blend;
    if (o.opacity != null) L.opacity.setValue(o.opacity);
    return this.place(L, name, tIn, tOut, o);
};
Ctx.prototype.adjust = function (name, tIn, tOut, o) { o = o || {}; o.adj = true; return this.solid(name, [1, 1, 1], tIn, tOut, o); };
Ctx.prototype.shape = function (name, tIn, tOut, o) { var L = this.comp.layers.addShape(); return this.place(L, name, tIn, tOut, o); };
Ctx.prototype.nul = function (name, tIn, tOut, o) { var L = this.comp.layers.addNull(this.comp.duration); L.position.setValue(this.C); try { L.source.parentFolder = bin("Solids"); } catch (e) {} return this.place(L, name, tIn, tOut, o); };
Ctx.prototype.ex = function (expr) { return expr.replace(/\$CUT/g, this.cut.toFixed(5)); };
Ctx.prototype.note = function (s) { this.notes.push(s); };

// visible comp area expressed in a layer's own coordinates (ignores rotation/parenting)
function compToLayer(L, p, t) {
    var a = L.anchorPoint.valueAtTime(t, false), pos = L.position.valueAtTime(t, false), s = L.scale.valueAtTime(t, false);
    return [a[0] + (p[0] - pos[0]) / ((s[0] || 100) / 100), a[1] + (p[1] - pos[1]) / ((s[1] || 100) / 100)];
}
function visibleRect(c, L, t) {
    var p0 = compToLayer(L, [0, 0], t), p1 = compToLayer(L, [c.W, c.H], t);
    var x0 = clamp(Math.min(p0[0], p1[0]), 0, L.width), x1 = clamp(Math.max(p0[0], p1[0]), 0, L.width);
    var y0 = clamp(Math.min(p0[1], p1[1]), 0, L.height), y1 = clamp(Math.max(p0[1], p1[1]), 0, L.height);
    if (x1 - x0 < 4 || y1 - y0 < 4) return { x0: 0, y0: 0, x1: L.width, y1: L.height };
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

// freeze-frame duplicate of a clip, showing comp-time frameT, living [tIn, tOut]
Ctx.prototype.freeze = function (src, frameT, tIn, tOut, name, o) {
    if (!src) return null;
    var d = src.duplicate();
    try { d.parent = null; } catch (e0) {}
    if (d.canSetTimeRemapEnabled) {
        var st = frameT - src.startTime;
        try { st = src.sourceTime(frameT); } catch (e1) {}
        d.timeRemapEnabled = true;
        var tr = d.property("ADBE Time Remapping");
        while (tr.numKeys > 1) tr.removeKey(tr.numKeys);
        tr.setValueAtKey(1, st);
        d.startTime = tIn;
        try { d.outPoint = tOut; } catch (e2) {}
    }
    d.enabled = true;
    return this.place(d, name, tIn, tOut, o);
};

// "glow blob": soft coloured light moving through the frame
Ctx.prototype.blob = function (name, color, tIn, tOut, peakT, o) {
    var c = this, R = c.R; o = o || {};
    var L = c.solid(name, color, tIn, tOut, { blend: BlendingMode.ADD });
    var rx = c.W * R.f(0.22, 0.55), ry = c.H * R.f(0.18, 0.5);
    addMask(L, ellipseShape(c.W / 2, c.H / 2, rx, ry), { feather: Math.min(c.W, c.H) * R.f(0.3, 0.5) });
    var dir = o.dir || R.sign(), y0 = c.H * R.f(0.15, 0.85), y1 = c.H * R.f(0.15, 0.85);
    anim(L.position, [[tIn, [c.W / 2 - dir * c.W * R.f(0.7, 1.0), y0], "lin"], [peakT, [c.W / 2 + R.f(-0.15, 0.15) * c.W, c.H / 2 + R.f(-0.2, 0.2) * c.H], "lin"], [tOut, [c.W / 2 + dir * c.W * R.f(0.7, 1.0), y1]]]);
    var s = R.f(110, 170);
    anim(L.scale, [[tIn, [s * 0.7, s * 0.7], "io"], [peakT, [s, s * R.f(0.8, 1.1)], "io"], [tOut, [s * 0.8, s * 0.8]]]);
    anim(L.opacity, [[tIn, 0, "in"], [peakT, o.peak || R.f(70, 100), "out"], [tOut, 0]]);
    return L;
};
Ctx.prototype.flash = function (name, tIn, tOut, peak, o) {
    var c = this; o = o || {};
    var A = c.adjust(name, tIn, tOut);
    var e = fx(A, "ADBE Exposure2");
    var keys = [[tIn, 0, "soft"], [c.cut, peak, "soft"], [tOut, 0]];
    if (o.hold) keys = [[tIn, 0, "in"], [c.cut - c.fd, peak, "lin"], [c.cut + o.hold, peak, "out"], [tOut, 0]];
    anim(e.property(3), keys);
    if (o.flicker) e.property(3).expression = "seedRandom(Math.floor(time/thisComp.frameDuration)+" + c.R.i(1, 999) + ",true); value*(1+random(-" + o.flicker + "," + o.flicker + "))";
    return A;
};

Ctx.prototype.sfx = function () {
    var c = this;
    if (!c.opts.sfx) return;
    var items = assetItems(c.style.id, "sfx");
    if (!items.length) { TL.importStyle(c.style.id); items = assetItems(c.style.id, "sfx"); }
    if (!items.length) return;
    var lastKey = "lastSfx_" + c.style.id, last = parseInt(getSetting(lastKey, "-1"), 10), k = c.R.i(0, items.length - 1);
    if (items.length > 1 && k === last) k = (k + 1 + c.R.i(0, items.length - 2)) % items.length;
    setSetting(lastKey, k);
    var L = c.comp.layers.add(items[k]);
    L.startTime = c.cut - HIT;
    c.place(L, "sfx " + items[k].name.replace(/\.[^.]+$/, ""), null, null);
    if (L.inPoint < 0) L.inPoint = 0;
    try { var g = c.R.f(-4, -1); L.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([g, g]); } catch (e) {}
    c.note("sfx " + (k + 1));
};
Ctx.prototype.overlay = function () {
    var c = this, R = c.R;
    if (!c.opts.overlays) return;
    var items = assetItems(c.style.id, "overlay");
    if (!items.length || !R.chance(0.6)) return;
    var it = R.pick(items), L = c.comp.layers.add(it);
    var dur = it.duration > 0 ? it.duration : c.D * 1.4;
    L.startTime = c.cut - dur / 2;
    L.blendingMode = BlendingMode.SCREEN;
    var s = Math.max(c.W / it.width, c.H / it.height) * 100 * R.f(1.0, 1.15);
    L.scale.setValue([s * R.sign(), s]);
    L.position.setValue(c.C);
    c.place(L, "overlay " + it.name, c.cut - dur / 2, c.cut + dur / 2);
    c.note("overlay");
};

// ------------------------------------------------------------------ palettes
var PAL_BURN = [
    { mid: [1, 0.38, 0.05], hi: [1, 0.93, 0.75] }, { mid: [0.95, 0.15, 0.05], hi: [1, 0.8, 0.55] },
    { mid: [1, 0.55, 0.1], hi: [1, 1, 0.9] }, { mid: [0.85, 0.1, 0.35], hi: [1, 0.75, 0.6] },
    { mid: [0.55, 0.22, 0.9], hi: [0.95, 0.85, 1] }, { mid: [0.95, 0.65, 0.2], hi: [1, 0.97, 0.88] }
];
var PAL_GLARE = [
    [[1, 0.7, 0.3], [1, 0.45, 0.15], [1, 0.9, 0.7]], [[0.3, 0.72, 1], [0.6, 0.9, 1], [0.25, 0.4, 1]],
    [[1, 0.4, 0.65], [0.72, 0.4, 1], [1, 0.75, 0.5]], [[1, 0.85, 0.55], [0.5, 1, 0.85], [1, 0.6, 0.3]],
    [[1, 0.55, 0.25], [0.35, 0.65, 1], [1, 0.95, 0.85]]
];
var PAPER = [[0.95, 0.93, 0.88], [0.98, 0.97, 0.94], [0.74, 0.6, 0.45], [0.87, 0.86, 0.83], [0.96, 0.82, 0.8], [0.78, 0.87, 0.93], [0.95, 0.9, 0.6], [0.16, 0.16, 0.17], [0.9, 0.4, 0.3]];

// ================================================================== STYLES
var GEN = {};

// ---------------------------------------------------------------- Film Flash
GEN.FilmFlash = function (c) {
    var R = c.R, pre = c.D * R.f(0.38, 0.5), post = c.D * R.f(0.55, 0.8), t0 = c.cut - pre, t1 = c.cut + post;
    var nb = R.chance(0.45) ? 2 : 1;
    for (var k = 0; k < nb; k++) {
        var pal = R.pick(PAL_BURN);
        var L = c.solid("burn " + (k + 1), [0, 0, 0], t0, t1, { blend: k ? BlendingMode.SCREEN : BlendingMode.ADD });
        var e = fx(L, "ADBE Fractal Noise", { 1: R.pick([6, 7, 4, 9]), 2: 4, 4: R.f(150, 240), 10: R.f(220, 520), 16: R.i(3, 6), 28: R.i(0, 9999) });
        anim(e.property(5), [[t0, -R.f(70, 100), "soft"], [c.cut, R.f(15, 55), "soft"], [t1, -R.f(80, 115)]]);
        var ang = R.f(0, 6.283), dist = R.f(300, 1100) * c.u, o0 = [c.W / 2 + R.f(-300, 300), c.H / 2 + R.f(-300, 300)];
        anim(e.property(13), [[t0, o0, "lin"], [t1, [o0[0] + Math.cos(ang) * dist, o0[1] + Math.sin(ang) * dist]]]);
        anim(e.property(24), [[t0, R.f(0, 360), "lin"], [t1, R.f(250, 800)]]);
        fx(L, "ADBE Tritone", { 1: pal.hi, 2: pal.mid, 3: [0, 0, 0] });
        anim(L.opacity, [[t0, 0, "in"], [c.cut - pre * 0.35, 100, "lin"], [c.cut + post * 0.45, 100, "out"], [t1, 0]]);
    }
    c.flash("flash", t0, t1, R.f(0.6, 1.6), { flicker: R.pick([0, 0.2, 0.35]), hold: R.chance(0.4) ? c.fd * R.i(1, 2) : 0 });
    if (R.chance(0.35)) {
        var wf = c.solid("white frame", [1, 0.97, 0.92], c.cut - c.fd * R.i(0, 1), c.cut + c.fd * R.i(1, 2), { blend: BlendingMode.ADD, opacity: R.f(40, 80) });
        c.note("white frame");
    }
    if (R.chance(0.5)) {
        var sh = c.adjust("shake", t0, t1);
        var tf = fx(sh, "ADBE Geometry2", { 10: 0, 11: 180 });
        tf.property(2).expression = c.ex("var e=Math.max(0,1-Math.abs(time-$CUT)/" + (c.D * 0.6).toFixed(3) + "); value+(wiggle(14," + (R.f(10, 24) * c.u).toFixed(1) + ")-value)*e");
        tf.property(4).expression = c.ex("var e=Math.max(0,1-Math.abs(time-$CUT)/" + (c.D * 0.6).toFixed(3) + "); value+" + R.f(3, 8).toFixed(1) + "*e");
        c.note("shake");
    }
    c.note(nb + " burn layer(s)");
};

// ---------------------------------------------------------------- Optical Glare
GEN.OpticalGlare = function (c) {
    var R = c.R, pre = c.D * R.f(0.4, 0.55), post = c.D * R.f(0.6, 0.85), t0 = c.cut - pre, t1 = c.cut + post;
    var pal = R.pick(PAL_GLARE), dir = R.sign();
    var nb = R.i(2, 3);
    for (var k = 0; k < nb; k++) {
        var tIn = t0 + R.f(0, pre * 0.3), tOut = t1 - R.f(0, post * 0.3);
        c.blob("glare " + (k + 1), pal[k % pal.length], tIn, tOut, c.cut + R.f(-0.08, 0.06) * c.D, { dir: dir, peak: R.f(28, 58) });
    }
    var ns = R.i(1, 2);
    for (var s = 0; s < ns; s++) {
        var L = c.solid("streak " + (s + 1), [0, 0, 0], t0, t1, { blend: BlendingMode.ADD });
        var e = fx(L, "ADBE Fractal Noise", { 1: 1, 2: R.pick([3, 4]), 4: R.f(220, 320), 5: -R.f(20, 45), 9: 0, 11: R.f(3000, 8000) * c.u, 12: R.f(12, 50) * c.u, 16: R.i(2, 4), 28: R.i(0, 9999) });
        var oy = c.H * R.f(0.3, 0.7);
        anim(e.property(13), [[t0, [0, oy], "lin"], [t1, [dir * R.f(2000, 5000) * c.u, oy]]]);
        fx(L, "ADBE Tint", { 1: [0, 0, 0], 2: R.pick(pal) });
        addMask(L, maskShape(rectPts(-10, c.H / 2 - c.H * 0.18, c.W + 10, c.H / 2 + c.H * 0.18)), { feather: c.H * 0.16 });
        L.position.setValue([c.W / 2, c.H * R.f(0.3, 0.7)]);
        L.rotation.setValue(R.f(-12, 12));
        anim(L.opacity, [[t0, 0, "in"], [c.cut, R.f(70, 100), "out"], [t1, 0]]);
    }
    var bl = c.adjust("bloom", t0, t1);
    var g = fx(bl, "ADBE Glo2", { 2: R.f(150, 200), 3: R.f(60, 160) * c.u });
    anim(g.property(4), [[t0, 0, "soft"], [c.cut, R.f(0.4, 0.9), "soft"], [t1, 0]]);
    var ex = fx(bl, "ADBE Exposure2");
    anim(ex.property(3), [[t0, 0, "soft"], [c.cut, R.f(0.15, 0.55), "soft"], [t1, 0]]);
    c.note(nb + " blobs, " + ns + " streak(s)");
};

// ---------------------------------------------------------------- Lens Flares
GEN.LensFlares = function (c) {
    var R = c.R, pre = c.D * R.f(0.45, 0.6), post = c.D * R.f(0.6, 0.85), t0 = c.cut - pre, t1 = c.cut + post;
    var nf = R.chance(0.35) ? 2 : 1, dir = R.sign();
    for (var k = 0; k < nf; k++) {
        var L = c.solid("flare " + (k + 1), [0, 0, 0], t0, t1, { blend: BlendingMode.ADD });
        var lt = R.i(1, 3), e = fx(L, "ADBE Lens Flare", { 3: lt });
        var y0 = c.H * R.f(0.15, 0.7), y1 = c.H * R.f(0.15, 0.7), d = (k ? -dir : dir);
        anim(e.property(1), [[t0, [c.W / 2 - d * c.W * 0.6, y0], "lin"], [c.cut, [c.W * R.f(0.35, 0.65), c.H * R.f(0.3, 0.55)], "lin"], [t1, [c.W / 2 + d * c.W * 0.6, y1]]]);
        var peak = k ? R.f(105, 130) : R.f(135, 170);
        anim(e.property(2), [[t0, R.f(70, 100), "in"], [c.cut, peak, "out"], [t1, R.f(70, 100)]]);
        anim(L.opacity, [[t0, 0, "in"], [t0 + pre * 0.5, 100, "lin"], [c.cut + post * 0.5, 100, "out"], [t1, 0]]);
        if (k === 0) {
            var fname = L.name;
            var st = c.solid("anamorphic", R.chance(0.6) ? [0.35, 0.65, 1] : [1, 0.6, 0.3], t0, t1, { blend: BlendingMode.ADD, w: c.W * 2.2, h: c.H * 0.05 });
            addMask(st, ellipseShape(st.width / 2, st.height / 2, st.width * 0.48, st.height * 0.45), { feather: st.height * 0.45 });
            st.position.expression = "thisComp.layer(\"" + fname + "\").effect(1)(1)";
            st.opacity.expression = "var b=thisComp.layer(\"" + fname + "\").effect(1)(2); linear(b,80,180,0,100)*thisComp.layer(\"" + fname + "\").transform.opacity/100";
            fx(st, "ADBE Glo2", { 2: 100, 3: 30 * c.u, 4: 1 });
        }
    }
    c.flash("whiteout", t0, t1, R.f(0.3, 1.0), { flicker: R.chance(0.3) ? 0.2 : 0 });
    c.note(nf + " flare(s)");
};

// ---------------------------------------------------------------- Paper
function paperSheet(c, name, color, tIn, tOut, pts, sw, sh, o) {
    var R = c.R; o = o || {};
    var rim = null;
    if (!o.noRim) {
        rim = c.solid(name + " rim", [0.99, 0.98, 0.96], tIn, tOut, { w: sw, h: sh });
        addMask(rim, maskShape(pts), { expansion: R.f(3, 9) * c.u });
        fx(rim, "ADBE Roughen Edges", { 1: 2, 3: R.f(4, 9) * c.u, 6: R.f(12, 30), 9: 4, 14: R.i(0, 999) });
        fx(rim, "ADBE Drop Shadow", { 2: R.f(90, 150), 3: R.f(100, 220), 4: R.f(8, 22) * c.u, 5: R.f(25, 60) * c.u });
    }
    var L = c.solid(name, color, tIn, tOut, { w: sw, h: sh });
    addMask(L, maskShape(pts), {});
    fx(L, "ADBE Fractal Noise", { 1: 1, 2: 4, 4: R.f(80, 140), 10: R.f(60, 160), 16: 6, 28: R.i(0, 9999), 30: R.f(12, 22), 31: 4 });
    fx(L, "ADBE Noise", { 1: R.f(4, 9), 2: 0 });
    fx(L, "ADBE Roughen Edges", { 1: 2, 3: R.f(2, 5) * c.u, 6: R.f(8, 20), 9: 3, 14: R.i(0, 999) });
    if (o.noRim) fx(L, "ADBE Drop Shadow", { 2: R.f(90, 150), 3: R.f(100, 220), 4: R.f(8, 22) * c.u, 5: R.f(25, 60) * c.u });
    if (rim) { rim.parent = L; }
    return L;
}
GEN.Paper = function (c) {
    var R = c.R, pre = c.D * R.f(0.4, 0.55), post = c.D * R.f(0.5, 0.75), t0 = c.cut - pre, t1 = c.cut + post;
    var variant = R.pick(["slide", "slide", "tear", "stack"]), stop = R.chance(0.4), stopFps = R.pick([8, 10, 12]);
    var W = c.W, H = c.H, amp = Math.min(W, H) * R.f(0.012, 0.03), seg = R.i(22, 40);
    var sheets = [];
    function slideSheet(name, color, tIn, tCover, tLeave, tOut, dirv) {
        var horiz = dirv[0] !== 0, sw = horiz ? W * 1.32 : W * 1.5, sh = horiz ? H * 1.5 : H * 1.32;
        var pts = tornRect(R, 0, 0, sw, sh, amp, seg);
        var L = paperSheet(c, name, color, tIn, tOut, pts, sw, sh);
        var offX = (W + sw) / 2 + W * 0.05, offY = (H + sh) / 2 + H * 0.05;
        var p0 = [W / 2 - dirv[0] * offX, H / 2 - dirv[1] * offY], p2 = [W / 2 + dirv[0] * offX, H / 2 + dirv[1] * offY];
        var exitBack = R.chance(0.3);
        if (exitBack) p2 = p0;
        anim(L.position, [[tIn, p0, "soft"], [tCover, [W / 2 + R.f(-8, 8) * c.u, H / 2 + R.f(-8, 8) * c.u], "hold"], [tLeave, [W / 2, H / 2], "soft"], [tOut, p2]]);
        var r0 = R.f(-6, 6);
        anim(L.rotation, [[tIn, r0 + R.f(-5, 5), "soft"], [tCover, r0 * 0.3, "hold"], [tLeave, r0 * 0.3, "soft"], [tOut, r0 + R.f(-6, 6)]]);
        L.motionBlur = true;
        sheets.push(L);
        return L;
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (variant === "slide") {
        slideSheet("sheet", R.pick(PAPER), c.cut - pre * R.f(0.45, 0.65), c.cut - c.fd, c.cut + c.fd * R.i(0, 2), c.cut + post * R.f(0.45, 0.65), R.pick(dirs));
    } else if (variant === "stack") {
        var n = R.i(2, 3), cols = R.shuffle(PAPER), ds = R.shuffle(dirs), stag = c.fd * R.i(2, 4);
        for (var k = 0; k < n; k++) {
            var tc = c.cut - c.fd - (n - 1 - k) * stag;
            slideSheet("sheet " + (k + 1), cols[k], tc - pre * R.f(0.4, 0.55), tc, c.cut + c.fd * (n - 1 - k) * 2, c.cut + c.fd * (n - 1 - k) * 2 + post * R.f(0.4, 0.6), ds[k % 4]);
        }
    } else {
        // two halves meet at a jagged seam and are torn apart
        var vert = R.chance(0.7), col = R.pick(PAPER), sw = W * 1.4, sh = H * 1.4, ox = W * 0.2, oy = H * 0.2;
        var seamPts, A, B;
        if (vert) {
            var sx = W / 2 + R.f(-0.08, 0.08) * W, tilt = R.f(-0.08, 0.08) * W;
            seamPts = jagLine(R, [sx + ox - tilt, -10], [sx + ox + tilt, sh + 10], seg, amp * 1.6);
            A = [[-10, -10]].concat(seamPts).concat([[sx + ox + tilt, sh + 10], [-10, sh + 10]]);
            var rs = seamPts.slice(0).reverse();
            B = [[sw + 10, sh + 10], [sx + ox + tilt, sh + 10]].concat(rs).concat([[sw + 10, -10]]);
        } else {
            var sy = H / 2 + R.f(-0.08, 0.08) * H, tl = R.f(-0.08, 0.08) * H;
            seamPts = jagLine(R, [-10, sy + oy - tl], [sw + 10, sy + oy + tl], seg, amp * 1.6);
            A = [[-10, -10], [sw + 10, -10], [sw + 10, sy + oy + tl]].concat(seamPts.slice(0).reverse());
            B = seamPts.concat([[sw + 10, sy + oy + tl], [sw + 10, sh + 10], [-10, sh + 10]]);
        }
        var LA = paperSheet(c, "half A", col, t0, t1, A, sw, sh), LB = paperSheet(c, "half B", col, t0, t1, B, sw, sh);
        var ax = vert ? [1, 0] : [0, 1], far = (vert ? W : H) * 0.95, tA = c.cut - pre * R.f(0.45, 0.65);
        var halves = [[LA, -1], [LB, 1]];
        for (var h = 0; h < 2; h++) {
            var Lh = halves[h][0], sg = halves[h][1];
            var off = [W / 2 + ax[0] * sg * far, H / 2 + ax[1] * sg * far];
            anim(Lh.position, [[tA, off, "soft"], [c.cut - c.fd, [W / 2, H / 2], "hold"], [c.cut + c.fd, [W / 2, H / 2], "soft"], [t1, [W / 2 + ax[0] * sg * far * 1.1, H / 2 + ax[1] * sg * far * 1.1 + (vert ? R.f(0, 0.3) * H : 0)]]]);
            anim(Lh.rotation, [[c.cut + c.fd, 0, "in"], [t1, sg * R.f(4, 14)]]);
            Lh.motionBlur = true;
            sheets.push(Lh);
        }
    }
    c.comp.motionBlur = true;
    if (stop) {
        for (var s = 0; s < sheets.length; s++) {
            sheets[s].position.expression = "posterizeTime(" + stopFps + "); seedRandom(index,false); value+[random(-3,3),random(-3,3)]";
            sheets[s].rotation.expression = "posterizeTime(" + stopFps + "); seedRandom(index+7,false); value+random(-0.6,0.6)";
        }
    }
    c.note(variant + (stop ? ", stop-motion " + stopFps + "fps" : ""));
};

// ---------------------------------------------------------------- VHS
GEN.VHS = function (c) {
    var R = c.R, pre = c.D * R.f(0.45, 0.6), post = c.D * R.f(0.55, 0.8), t0 = c.cut - pre, t1 = c.cut + post;
    var W = c.W, H = c.H, roll = R.chance(0.6);
    var A = c.adjust("vhs", t0, t1), adjName = A.name;
    if (roll) {
        fx(A, "ADBE Tile", { 5: 300 });
        var tf = fx(A, "ADBE Geometry2", { 10: 0, 11: 200 });
        var s = R.sign(), k = R.f(0.35, 0.6);
        anim(tf.property(2), [[c.cut - pre * R.f(0.4, 0.7), [W / 2, H / 2], "in"], [c.cut - c.fd, [W / 2, H / 2 - s * H * k], "hold"], [c.cut, [W / 2, H / 2 + s * H * (1 - k)], "out"], [c.cut + post * R.f(0.5, 0.8), [W / 2, H / 2]]]);
        c.note("roll");
    }
    var td = fx(A, "ADBE Turbulent Displace", { 1: 8, 3: R.f(10, 45) * c.u, 5: R.f(1, 2.5), 10: R.i(0, 999), 12: 1 });
    anim(td.property(2), [[t0, 0, "in"], [c.cut, R.f(50, 130), "out"], [t1, 0]]);
    td.property(2).expression = "seedRandom(Math.floor(time/thisComp.frameDuration)," + "true); value*(random()>" + R.f(0.25, 0.5).toFixed(2) + "?1:" + R.f(0.1, 0.4).toFixed(2) + ")";
    td.property(6).expression = "time*" + R.i(500, 1100);
    var ww = fx(A, "ADBE Wave Warp", { 1: 2, 3: R.f(150, 700) * c.u, 4: R.pick([0, 180]), 5: R.f(2, 6), 6: 1 });
    anim(ww.property(2), [[t0, 0, "in"], [c.cut, R.f(8, 30) * c.u, "out"], [t1, 0]]);
    var ca = tryFx(A, "Mettle SkyBox Chromatic Aberrat", { 1: 0, 9: 0 });
    if (ca) {
        var am = R.f(10, 35);
        anim(ca.property(6), [[t0, -2, "in"], [c.cut, -am, "out"], [t1, -2]]);
        anim(ca.property(8), [[t0, 2, "in"], [c.cut, am, "out"], [t1, 2]]);
    }
    var nz = fx(A, "ADBE Noise", { 2: 0 });
    anim(nz.property(1), [[t0, 0, "in"], [c.cut, R.f(15, 35), "out"], [t1, 0]]);
    var db = fx(A, "ADBE Motion Blur", { 1: 90 });
    anim(db.property(2), [[t0, 0, "in"], [c.cut, R.f(4, 14) * c.u, "out"], [t1, 0]]);
    if (R.chance(0.5)) { var vb = tryFx(A, "ADBE Vibrance"); if (vb) anim(vb.property(2), [[t0, 0, "in"], [c.cut, R.f(20, 45), "out"], [t1, 0]]); }
    else { var ds = fx(A, "ADBE Tint"); anim(ds.property(3), [[t0, 0, "in"], [c.cut, R.f(30, 60), "out"], [t1, 0]]); }

    // tracking noise band
    var tr = c.solid("tracking", [0, 0, 0], t0, t1, { blend: BlendingMode.SCREEN });
    var fn = fx(tr, "ADBE Fractal Noise", { 1: 1, 2: R.pick([1, 3]), 4: R.f(300, 450), 5: -R.f(40, 80), 9: 0, 11: R.f(1500, 4000) * c.u, 12: R.f(2, 6) * c.u, 16: 2, 28: R.i(0, 999) });
    fn.property(24).expression = "time*" + R.i(2000, 5000);
    var bh = H * R.f(0.07, 0.25);
    addMask(tr, maskShape(rectPts(-10, H / 2 - bh / 2, W + 10, H / 2 + bh / 2)), { feather: bh * 0.4 });
    var dy = R.sign();
    anim(tr.position, [[t0, [W / 2, H / 2 - dy * H * 0.7], "lin"], [t1, [W / 2, H / 2 + dy * H * 0.7]]]);
    anim(tr.opacity, [[t0, 0, "in"], [c.cut, 100, "out"], [t1, 0]]);
    tr.opacity.expression = "seedRandom(Math.floor(time/thisComp.frameDuration)+3,true); value*random(0.5,1)";

    // scanlines
    var sl = c.solid("scanlines", [0, 0, 0], t0, t1, {});
    fx(sl, "ADBE Venetian Blinds", { 1: 50, 2: 0, 3: R.f(3, 6) * c.u, 4: 1 });
    anim(sl.opacity, [[t0, 0, "io"], [c.cut, R.f(20, 40), "io"], [t1, 0]]);

    if (roll) {
        var bar = c.shape("blanking bar", t0, t1);
        shapeRect(bar, "bar", [W + 20, H * R.f(0.04, 0.08)], [0, 0], 0, [0, 0, 0]);
        bar.position.expression = "var y=thisComp.layer(\"" + adjName + "\").effect(\"Transform\")(2)[1]; var h=thisComp.height; var m=((y+h/2)%h+h)%h; [thisComp.width/2, m]";
    }
    if (R.chance(0.55)) {
        var txt = R.pick(["PLAY \u25BA", "\u25C4\u25C4 REW", "\u25BA\u25BA FF", "TRACKING", "PLAY \u25BA  SP"]);
        var tl = c.comp.layers.addText(txt);
        var tdoc = tl.property("ADBE Text Properties").property("ADBE Text Document"), d = tdoc.value;
        d.fontSize = H * 0.055; try { d.font = "Consolas"; } catch (e) {} d.applyFill = true; d.fillColor = [1, 1, 1];
        d.justification = ParagraphJustification.LEFT_JUSTIFY;
        tdoc.setValue(d);
        c.place(tl, "osd", t0, t1);
        tl.position.setValue([W * 0.07, H * 0.12 + H * 0.04]);
        fx(tl, "ADBE Glo2", { 2: 120, 3: 8 * c.u, 4: 1 });
        tl.opacity.expression = "seedRandom(Math.floor(time/thisComp.frameDuration)+5,true); random()>0.12?100:0";
        c.note("osd");
    }
};

// ---------------------------------------------------------------- Horror
GEN.Horror = function (c) {
    var R = c.R, D = c.D * 1.15, pre = D * R.f(0.45, 0.6), post = D * R.f(0.55, 0.75), t0 = c.cut - pre, t1 = c.cut + post;
    var env = "var e=Math.pow(Math.max(0,1-Math.abs(time-" + c.cut.toFixed(5) + ")/" + (D * 0.6).toFixed(3) + "),1.3);";
    var fr = "Math.floor(time/thisComp.frameDuration)";
    var A = c.adjust("horror", t0, t1);
    var tf = fx(A, "ADBE Geometry2", { 10: 0, 11: 90 });
    var amp = R.f(15, 45) * c.u;
    tf.property(2).expression = env + "seedRandom(" + fr + "+" + R.i(1, 99) + ",true); value+[random(-1,1),random(-1,1)]*" + amp.toFixed(1) + "*e";
    tf.property(4).expression = env + "seedRandom(" + fr + "+" + R.i(100, 199) + ",true); value+random(0," + R.f(6, 14).toFixed(1) + ")*e";
    tf.property(8).expression = env + "seedRandom(" + fr + "+" + R.i(200, 299) + ",true); value+random(-2,2)*e";
    var td = fx(A, "ADBE Turbulent Displace", { 1: R.pick([1, 4, 8]), 3: R.f(40, 160) * c.u, 10: R.i(0, 999) });
    td.property(2).expression = env + "seedRandom(" + fr + "+7,true); (random()>0.5?" + R.f(30, 90).toFixed(0) + ":0)*e";
    td.property(6).expression = "time*900";
    var ex = fx(A, "ADBE Exposure2");
    var pB = R.f(0.15, 0.3), pW = R.f(0.05, 0.15);
    ex.property(3).expression = env + "seedRandom(" + fr + "+11,true); var r=random(); (r<" + pB.toFixed(2) + "*e?-6:(r>1-" + pW.toFixed(2) + "*e?" + R.f(1, 2.5).toFixed(1) + ":0))";
    var inv = fx(A, "ADBE Invert");
    inv.property(2).expression = env + "seedRandom(" + fr + "+13,true); random()<" + R.f(0.04, 0.14).toFixed(2) + "*e?0:100";
    var tint = R.chance(0.45);
    var tc = tint ? R.pick([[[0.08, 0, 0], [1, 0.8, 0.75]], [[0, 0.06, 0.03], [0.8, 1, 0.85]], [[0, 0.02, 0.08], [0.75, 0.85, 1]]]) : [[0, 0, 0], [1, 1, 1]];
    var hs = fx(A, "ADBE Tint", { 1: tc[0], 2: tc[1] });
    anim(hs.property(3), [[t0, 0, "in"], [c.cut, tint ? R.f(55, 85) : R.f(50, 95), "out"], [t1, 0]]);
    var vg = vignette(c, A, 45);
    anim(vg.property(1), [[t0, 0, "in"], [c.cut, 100, "out"], [t1, 0]]);
    var nz = fx(A, "ADBE Noise", { 2: 0 });
    anim(nz.property(1), [[t0, 0, "in"], [c.cut, R.f(8, 22), "out"], [t1, 0]]);
    var ca = tryFx(A, "Mettle SkyBox Chromatic Aberrat", { 1: 0, 9: 0 });
    if (ca) { var a = R.f(8, 25); ca.property(6).expression = env + "seedRandom(" + fr + "+17,true); -" + a.toFixed(1) + "*e*random(0.3,1)"; ca.property(8).expression = env + "seedRandom(" + fr + "+19,true); " + a.toFixed(1) + "*e*random(0.3,1)"; }
    // static / grain overlay
    var st = c.solid("static", [0, 0, 0], t0, t1, { blend: BlendingMode.OVERLAY });
    var fn = fx(st, "ADBE Fractal Noise", { 1: 1, 2: 1, 4: 300, 10: R.f(3, 8) * c.u, 16: 1 });
    fn.property(28).expression = fr;
    anim(st.opacity, [[t0, 0, "in"], [c.cut, R.f(25, 60), "out"], [t1, 0]]);
    c.note(tint ? "tint" : "desat");
};

// ---------------------------------------------------------------- Slide Projector
GEN.SlideProjector = function (c) {
    var R = c.R, pre = c.D * R.f(0.35, 0.5), post = c.D * R.f(0.6, 0.85), t0 = c.cut - pre, t1 = c.cut + post;
    var W = c.W, H = c.H, dir = R.pick([[-1, 0], [-1, 0], [1, 0], [0, -1]]);
    var gap = c.fd * R.i(0, 1), v = [dir[0] * W * 1.06, dir[1] * H * 1.06], vin = R.f(0.6, 0.85);
    var A = c.adjust("projector", t0, t1);
    var tf = fx(A, "ADBE Geometry2", { 10: 0, 11: R.f(120, 240) });
    var land = c.cut + post * R.f(0.4, 0.55), ov = R.f(0.01, 0.03);
    anim(tf.property(2), [
        [t0, [W / 2, H / 2], "in"],
        [c.cut - gap - c.fd * 0.5, [W / 2 + v[0], H / 2 + v[1]], "hold"],
        [c.cut, [W / 2 - v[0] * vin, H / 2 - v[1] * vin], "out"],
        [land, [W / 2 + v[0] * ov, H / 2 + v[1] * ov], "io"],
        [land + post * 0.25, [W / 2, H / 2]]]);
    var jit = R.f(2, 6) * c.u;
    tf.property(2).expression = "seedRandom(Math.floor(time/thisComp.frameDuration),true); var j=(time>" + land.toFixed(4) + " && time<" + (land + post * 0.35).toFixed(4) + ")?1:0; value+[0,random(-1,1)*" + jit.toFixed(1) + "*j]";
    fx(A, "ADBE Solid Composite", { 1: 100, 2: [0, 0, 0], 3: 100 });
    var gb = fx(A, "ADBE Gaussian Blur 2", { 3: 0 });
    var bmax = R.f(14, 30) * c.u;
    anim(gb.property(1), [[t0, 0, "in"], [c.cut - gap - c.fd * 0.5, bmax * 0.4, "hold"], [c.cut, bmax, "io"], [land, 0, "io"], [land + post * 0.15, R.f(2, 6) * c.u, "io"], [t1, 0]]);
    var ex = fx(A, "ADBE Exposure2");
    anim(ex.property(3), [[t0, 0, "io"], [c.cut, -R.f(0.1, 0.4), "io"], [t1, 0]]);
    ex.property(3).expression = "seedRandom(Math.floor(time/thisComp.frameDuration)+1,true); value+random(-0.08,0.08)";
    var vg = vignette(c, A, 40);
    anim(vg.property(1), [[t0, 0, "io"], [c.cut, R.f(40, 80), "io"], [t1, 0]]);
    c.note("dir " + dir.join(","));
};

// ---------------------------------------------------------------- Aesthetic Film (film strip roll)
GEN.AestheticFilm = function (c) {
    var R = c.R, pre = c.D * R.f(0.45, 0.55), post = c.D * R.f(0.55, 0.75), t0 = c.cut - pre, t1 = c.cut + post;
    var W = c.W, H = c.H, s = R.sign(), sc = R.f(78, 90);
    var A = c.adjust("film roll", t0, t1), an = A.name;
    fx(A, "ADBE Tile", { 5: 400 });
    var tf = fx(A, "ADBE Geometry2", { 10: 0, 11: R.f(180, 300) });
    anim(tf.property(2), [[t0, [W / 2, H / 2], "in"], [c.cut - c.fd, [W / 2, H / 2 + s * H * 0.5], "hold"], [c.cut, [W / 2, H / 2 - s * H * 0.5], "out"], [t1, [W / 2, H / 2]]]);
    anim(tf.property(4), [[t0, 100, "io"], [c.cut, sc, "io"], [t1, 100]]);
    fx(A, "ADBE Solid Composite", { 1: 100, 2: [0.02, 0.015, 0.01], 3: 100 });
    var tn = fx(A, "ADBE Tint", { 1: [0.08, 0.04, 0.02], 2: [1, 0.93, 0.8] });
    anim(tn.property(3), [[t0, 0, "io"], [c.cut, R.f(20, 45), "io"], [t1, 0]]);
    var nz = fx(A, "ADBE Noise", { 2: 0 });
    anim(nz.property(1), [[t0, 0, "io"], [c.cut, R.f(6, 14), "io"], [t1, 0]]);

    // film strip: frame lines + sprocket holes, locked to the roll
    var fs = c.shape("film strip", t0, t1);
    var lines = shapeRect(fs, "frame lines", [W * 1.02, H * R.f(0.03, 0.05)], [0, H / 2], 0, [0.02, 0.015, 0.01]);
    addRepeater(lines, 8, -4, [0, H]);
    var hw = W * 0.022, hh = H * 0.055, mg = W * R.f(0.035, 0.05);
    var holeCol = R.pick([[1, 0.97, 0.9], [0.95, 0.92, 0.85], [1, 0.9, 0.75]]);
    var L1 = shapeRect(fs, "holes L", [hw, hh], [-W / 2 - mg, 0], hw * 0.3, holeCol);
    addRepeater(L1, 40, -20, [0, H / 4]);
    var L2 = shapeRect(fs, "holes R", [hw, hh], [W / 2 + mg, 0], hw * 0.3, holeCol);
    addRepeater(L2, 40, -20, [0, H / 4]);
    fs.anchorPoint.setValue([0, 0]);
    fs.position.expression = "thisComp.layer(\"" + an + "\").effect(\"Transform\")(2)";
    fs.scale.expression = "var s=thisComp.layer(\"" + an + "\").effect(\"Transform\")(4); [s,s]";
    fs.motionBlur = true;
    if (R.chance(0.65)) { c.blob("light leak", R.pick([[1, 0.55, 0.2], [1, 0.4, 0.3], [1, 0.75, 0.4]]), t0 + pre * 0.3, t1 - post * 0.2, c.cut, { peak: R.f(45, 80) }); c.note("leak"); }
    c.note("roll " + (s > 0 ? "down" : "up"));
};

// ---------------------------------------------------------------- Punch Hole
GEN.PunchHole = function (c) {
    var R = c.R, pre = c.D * R.f(0.4, 0.55), post = c.D * R.f(0.6, 0.85), t0 = c.cut - pre, t1 = c.cut + post;
    var W = c.W, H = c.H, fr = "Math.floor(time/thisComp.frameDuration)";
    // scratches + dust over the whole window
    var sc = c.solid("scratches", [0, 0, 0], t0, t1, { blend: BlendingMode.ADD });
    var f1 = fx(sc, "ADBE Fractal Noise", { 1: 1, 2: 1, 4: R.f(500, 800), 5: -R.f(170, 230), 9: 0, 11: R.f(1, 4) * c.u, 12: R.f(800, 3000) * c.u, 16: 1 });
    f1.property(28).expression = fr;
    anim(sc.opacity, [[t0, 0, "in"], [c.cut, R.f(50, 85), "out"], [t1, 0]]);
    var du = c.solid("dust", [0, 0, 0], t0, t1, { blend: BlendingMode.SCREEN });
    var f2 = fx(du, "ADBE Fractal Noise", { 1: 1, 2: 4, 4: R.f(700, 1000), 5: -R.f(330, 420), 10: R.f(6, 16) * c.u, 16: 2 });
    f2.property(28).expression = fr + "*3";
    anim(du.opacity, [[t0, 0, "in"], [c.cut, 100, "out"], [t1, 0]]);
    // cue marks
    if (R.chance(0.7)) {
        var cue = c.shape("cue mark", c.cut - c.fd * R.i(6, 9), c.cut - c.fd * R.i(1, 3));
        var r = H * R.f(0.05, 0.08);
        shapeEllipse(cue, "dot", [r, r], [W * R.f(0.82, 0.9) - W / 2, H * R.f(0.1, 0.18) - H / 2], [0.98, 0.96, 0.9]);
        cue.anchorPoint.setValue([0, 0]); cue.position.setValue(c.C);
        fx(cue, "ADBE Roughen Edges", { 1: 2, 3: r * 0.12, 6: 20, 9: 3 });
        c.note("cue");
    }
    // frame jump in the gate
    if (R.chance(0.5)) {
        var gj = c.adjust("gate jump", c.cut - c.fd * 3, c.cut + c.fd * 3);
        fx(gj, "ADBE Tile", { 5: 300 });
        var tf = fx(gj, "ADBE Geometry2", { 10: 0, 11: 180 });
        var jy = H * R.f(0.08, 0.25) * R.sign();
        holdKeys(tf.property(2), [c.cut - c.fd * 3, c.cut - c.fd * 2, c.cut - c.fd, c.cut + c.fd, c.cut + c.fd * 2], [[W / 2, H / 2], [W / 2, H / 2 + jy], [W / 2, H / 2 + jy * 0.4], [W / 2, H / 2 - jy * 0.3], [W / 2, H / 2]]);
        c.note("gate jump");
    }
    // punch: A's last frame frozen, holes burn through to B
    var fz = c.freeze(c.A, c.cut - c.fd, c.cut, t1, "punched frame");
    if (fz) {
        var vr = visibleRect(c, fz, c.cut), lw = vr.x1 - vr.x0, lh = vr.y1 - vr.y0, nh = R.i(3, 7), diag = Math.sqrt(lw * lw + lh * lh);
        var popStep = Math.min(c.fd * R.i(1, 2), post * 0.4 / nh), growEnd = t1 - post * R.f(0.05, 0.2);
        for (var h = 0; h < nh; h++) {
            var hx = vr.x0 + lw * R.f(0.1, 0.9), hy = vr.y0 + lh * R.f(0.1, 0.9), r0 = 2;
            var m = addMask(fz, ellipseShape(hx, hy, r0, r0 * R.f(0.8, 1.2)), { mode: MaskMode.SUBTRACT, feather: 2 });
            var tp = c.cut + h * popStep, rp = Math.min(lw, lh) * R.f(0.04, 0.12);
            var ex = m.property("ADBE Mask Offset");
            anim(ex, [[tp - c.fd, 0, "hold"], [tp, rp, "hold"], [tp + c.fd, rp * 1.05, "in"], [Math.max(growEnd, tp + c.fd * 3), diag * R.f(0.55, 0.9)]]);
        }
        // first frame of the punch: hide holes before they pop
        fx(fz, "ADBE Roughen Edges", { 1: 3, 2: R.pick([[1, 0.45, 0.05], [0.2, 0.08, 0.02], [1, 0.7, 0.2]]), 3: R.f(10, 28) * c.u, 4: 1, 6: R.f(20, 60), 9: 5, 14: R.i(0, 999) });
        c.note(nh + " holes");
    }
    c.solid("punch flash", [1, 0.98, 0.94], c.cut, c.cut + c.fd, { blend: BlendingMode.ADD, opacity: R.f(35, 70) });
    c.flash("flicker", t0, t1, R.f(0.15, 0.45), { flicker: 0.6 });
};

// ---------------------------------------------------------------- Scrapbook (stop-motion collage)
function stroked(c, L, size, color) {
    var e = tryFx(L, "ADBE Stroke", null);
    if (!e) return;
    try { e.property(2).setValue(1); } catch (x) {}   // all masks
    try { e.property(4).setValue(color); e.property(5).setValue(size); e.property(6).setValue(1); } catch (x2) {}
}
GEN.Scrapbook = function (c) {
    var R = c.R, step = 1 / R.pick([8, 10, 12]), W = c.W, H = c.H;
    var n = R.i(4, 7), pre = Math.max(c.D * 0.5, step * (n + 1)), post = Math.max(c.D * 0.6, step * (n + 2));
    var t0 = c.cut - pre, t1 = c.cut + post, pieces = [];
    var removeOrder = R.shuffle((function () { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; })());
    var paperCols = R.shuffle(PAPER);
    for (var k = 0; k < n; k++) {
        var useB = k >= Math.floor(n * R.f(0.3, 0.6));
        var src = useB ? c.B : c.A;
        var ta = c.cut - step * (n - k) - step * 0.5;
        ta = Math.round(ta / c.fd) * c.fd;
        var tr = c.cut + step * (removeOrder[k] + 1);
        tr = Math.round(tr / c.fd) * c.fd;
        if (src && R.chance(0.8)) {
            var fz = c.freeze(src, useB ? c.cut : c.cut - c.fd, ta, tr, "piece " + (k + 1));
            if (!fz) continue;
            var vr = visibleRect(c, fz, c.cut);
            clearKeys(fz.anchorPoint); clearKeys(fz.position); clearKeys(fz.scale); clearKeys(fz.rotation);
            var lw = vr.x1 - vr.x0, lh = vr.y1 - vr.y0, bw = lw * R.f(0.3, 0.6), bh = lh * R.f(0.3, 0.6);
            var cx = vr.x0 + lw * R.f(0.25, 0.75), cy = vr.y0 + lh * R.f(0.25, 0.75);
            var torn = R.chance(0.5);
            var pts = torn ? tornRect(R, cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, Math.min(bw, bh) * 0.03, 12) : rectPts(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2);
            addMask(fz, maskShape(pts), {});
            var baseS = 100;
            try { baseS = Math.abs(src.scale.valueAtTime(c.cut, false)[0]); } catch (e) {}
            var s = baseS * R.f(0.75, 1.15), pos = [W * R.f(0.15, 0.85), H * R.f(0.18, 0.82)], rot = R.f(-14, 14);
            fz.anchorPoint.setValue([cx, cy]);
            holdKeys(fz.position, [ta, ta + step], [[pos[0] + R.f(-40, 40) * c.u, pos[1] + R.f(-40, 40) * c.u], pos]);
            holdKeys(fz.scale, [ta, ta + step], [[s * 1.12, s * 1.12], [s, s]]);
            fz.rotation.setValue(rot);
            stroked(c, fz, Math.max(6, Math.min(bw, bh) * R.f(0.04, 0.07)) * (baseS / 100), [0.98, 0.97, 0.94]);
            fx(fz, "ADBE Drop Shadow", { 2: 130, 3: R.f(110, 200), 4: R.f(6, 16) * c.u, 5: R.f(12, 30) * c.u });
            fz.position.expression = "posterizeTime(" + Math.round(1 / step) + "); seedRandom(index,false); value+[random(-2,2),random(-2,2)]";
            pieces.push(fz);
            if (R.chance(0.5)) {   // tape strip
                var tape = c.solid("tape " + (k + 1), [0.93, 0.88, 0.72], ta + step, tr, { w: W * 0.12, h: H * 0.045, opacity: R.f(65, 85) });
                addMask(tape, maskShape(tornRect(R, 0, 0, tape.width, tape.height, tape.height * 0.12, 6)), {});
                tape.position.setValue([pos[0] + R.f(-0.1, 0.1) * W, pos[1] - bh * s / 100 * 0.5]);
                tape.rotation.setValue(rot + R.f(-30, 30));
            }
        } else {
            // coloured paper scrap
            var sw = W * R.f(0.15, 0.35), sh = H * R.f(0.15, 0.35);
            var scrap = c.solid("scrap " + (k + 1), paperCols[k % paperCols.length], ta, tr, { w: sw, h: sh });
            addMask(scrap, maskShape(tornRect(R, 0, 0, sw, sh, Math.min(sw, sh) * 0.04, 10)), {});
            fx(scrap, "ADBE Roughen Edges", { 1: 2, 3: 4 * c.u, 6: 15, 9: 3 });
            fx(scrap, "ADBE Drop Shadow", { 2: 110, 4: 8 * c.u, 5: 20 * c.u });
            holdKeys(scrap.position, [ta, ta + step], [[W * R.f(0.1, 0.9), H * R.f(0.1, 0.9)], [W * R.f(0.1, 0.9), H * R.f(0.1, 0.9)]]);
            scrap.rotation.setValue(R.f(-25, 25));
            pieces.push(scrap);
        }
    }
    // the final big piece of B slams in and grows to full frame
    if (c.B) {
        var big = c.freeze(c.B, c.cut, c.cut - step, t1, "big piece");
        if (big) {
            clearKeys(big.scale); clearKeys(big.rotation);
            var bs = 100;
            try { bs = Math.abs(c.B.scale.valueAtTime(c.cut, false)[0]); } catch (e2) {}
            var v2 = visibleRect(c, big, c.cut), lw2 = v2.x1 - v2.x0, lh2 = v2.y1 - v2.y0;
            addMask(big, maskShape(tornRect(R, v2.x0 + lw2 * 0.02, v2.y0 + lh2 * 0.02, v2.x0 + lw2 * 0.98, v2.y0 + lh2 * 0.98, Math.min(lw2, lh2) * 0.012, 30)), {});
            var steps = Math.max(2, Math.floor(post / step) - 1), T = [], S = [], Ro = [], r0 = R.f(-5, 5);
            for (var i = 0; i <= steps; i++) {
                var kk = i / steps;
                T.push(c.cut - step + i * step);
                var sv = bs * (i === 0 ? 0.8 : 0.9 + 0.13 * kk);
                S.push([sv, sv]); Ro.push(r0 * (1 - kk));
            }
            holdKeys(big.scale, T, S);
            holdKeys(big.rotation, T, Ro);
            fx(big, "ADBE Drop Shadow", { 2: 140, 4: 14 * c.u, 5: 35 * c.u });
            big.outPoint = T[T.length - 1] + step;
        }
    }
    c.note(n + " pieces @" + Math.round(1 / step) + "fps");
};

// ---------------------------------------------------------------- Photo Match Cut
function photoRig(c, src, frameT, tIn, tOut, name, border, polaroid) {
    var rig = c.nul(name + " rig", tIn, tOut);
    var ph = c.freeze(src, frameT, tIn, tOut, name);
    if (!ph) return null;
    var bw = c.W * (1 + border * 2), bh = c.H * (1 + border * 2) + (polaroid ? c.H * 0.16 : 0);
    var bd = c.solid(name + " border", [0.97, 0.96, 0.93], tIn, tOut, { w: bw, h: bh, below: ph });
    bd.position.setValue([c.W / 2, c.H / 2 + (polaroid ? c.H * 0.08 : 0)]);
    fx(bd, "ADBE Drop Shadow", { 2: 150, 3: c.R.f(120, 200), 4: c.R.f(12, 30) * c.u, 5: c.R.f(30, 60) * c.u });
    ph.parent = rig; bd.parent = rig;
    return { rig: rig, photo: ph, border: bd };
}
GEN.PhotoMatchCut = function (c) {
    var R = c.R, D = c.D * 1.25, pre = D * R.f(0.45, 0.55), post = D * R.f(0.55, 0.7), t0 = c.cut - pre, t1 = c.cut + post;
    var W = c.W, H = c.H;
    if (!c.A || !c.B) throw new Error("Photo Match Cut needs two clips around the cut");
    var bg = c.adjust("photo bg", t0, t1);
    var gb = fx(bg, "ADBE Gaussian Blur 2", { 3: 1 });
    var bmax = R.f(18, 40) * c.u;
    anim(gb.property(1), [[t0, 0, "io"], [t0 + pre * 0.6, bmax, "hold"], [t1 - post * 0.35, bmax, "io"], [t1, 0]]);
    var ex = fx(bg, "ADBE Exposure2");
    anim(ex.property(3), [[t0, 0, "io"], [t0 + pre * 0.6, -R.f(0.6, 1.4), "hold"], [t1 - post * 0.35, -R.f(0.6, 1.4), "io"], [t1, 0]]);
    var border = R.f(0.025, 0.05), polaroid = R.chance(0.3), sA = R.f(68, 82), rA = R.f(-8, 8);
    // extra scattered photos from A's past
    var extra = R.chance(0.5) ? R.i(1, 2) : 0;
    for (var x = 0; x < extra; x++) {
        var tx = Math.max(c.A.inPoint, c.cut - R.f(1, 3));
        var ep = photoRig(c, c.A, tx, t0 + pre * (0.3 + 0.2 * x), c.cut + post * 0.5, "photo past " + (x + 1), border, polaroid);
        if (!ep) continue;
        var es = sA * R.f(0.6, 0.8);
        holdKeys(ep.rig.scale, [t0 + pre * (0.3 + 0.2 * x)], [[es, es]]);
        ep.rig.position.setValue([W * R.f(0.2, 0.8), H * R.f(0.25, 0.75)]);
        ep.rig.rotation.setValue(R.f(-18, 18));
    }
    var pa = photoRig(c, c.A, t0, t0, c.cut + post * 0.6, "photo A", border, polaroid);
    anim(pa.rig.scale, [[t0, [100, 100], "io"], [c.cut, [sA, sA], "soft"], [c.cut + post * 0.6, [sA * 0.95, sA * 0.95]]]);
    anim(pa.rig.rotation, [[t0, 0, "io"], [c.cut, rA, "soft"], [c.cut + post * 0.6, rA * 1.2]]);
    anim(pa.rig.position, [[t0, c.C, "io"], [c.cut, [W / 2 + R.f(-0.06, 0.06) * W, H / 2 + R.f(-0.05, 0.05) * H], "soft"], [c.cut + post * 0.6, [W / 2 + R.f(-0.1, 0.1) * W, H / 2 + R.f(-0.1, 0.1) * H]]]);
    // photo B drops in and becomes the frame
    var dropT = pre * R.f(0.35, 0.5), side = R.pick([[0, 1], [0, -1], [1, 0], [-1, 0]]);
    var pb = photoRig(c, c.B, t1, c.cut - dropT, t1, "photo B", border, polaroid);
    var rB = R.f(-9, 9), sB = sA * R.f(0.95, 1.05);
    var land = [W / 2 + R.f(-0.04, 0.04) * W, H / 2 + R.f(-0.04, 0.04) * H];
    anim(pb.rig.position, [[c.cut - dropT, [W / 2 + side[0] * W * 1.1, H / 2 + side[1] * H * 1.15], "out"], [c.cut, land, "io"], [t1 - c.fd, c.C]]);
    anim(pb.rig.rotation, [[c.cut - dropT, rB * 2.2, "out"], [c.cut, rB, "io"], [t1 - c.fd, 0]]);
    anim(pb.rig.scale, [[c.cut - dropT, [sB * 1.08, sB * 1.08], "out"], [c.cut, [sB, sB], "io"], [t1 - c.fd, [100, 100]]]);
    anim(pb.border.opacity, [[t1 - post * 0.4, 100, "io"], [t1 - c.fd, 0]]);
    c.flash("camera flash", c.cut - c.fd * 2, c.cut + c.fd * R.i(3, 6), R.f(1.5, 3), {});
    c.note((polaroid ? "polaroid" : "print") + (extra ? ", +" + extra + " photos" : ""));
};

// ================================================================== generate
TL.styles = STYLES;
TL.generateAt = function (comp, cut, styleId, opts) {
    var st = styleById(styleId);
    if (!st) throw new Error("Unknown style " + styleId);
    var c = new Ctx(comp, cut, st, opts);
    GEN[st.id](c);
    c.overlay();
    c.sfx();
    return c;
};
TL.generate = function (opts) {
    opts = opts || {};
    var comp = opts.comp || app.project.activeItem;
    if (!(comp instanceof CompItem)) throw new Error("Open a composition and put the playhead on a cut");
    if (opts.sfx == null) opts.sfx = true;
    if (opts.overlays == null) opts.overlays = true;
    var styleId = opts.style;
    if (!styleId || styleId === "random") styleId = STYLES[Math.floor(Math.random() * STYLES.length)].id;
    var t = (opts.time != null) ? opts.time : comp.time;
    var cut = findCut(comp, t, opts.snap != null ? opts.snap : 1.0);
    app.beginUndoGroup("TransitionLab");
    try {
        var c = TL.generateAt(comp, cut, styleId, opts);
    } finally { app.endUndoGroup(); }
    var fmt = comp.width > comp.height * 1.05 ? "Horizontal" : (comp.height > comp.width * 1.05 ? "Vertical" : "Square");
    return c.tag + " @ " + cut.time.toFixed(2) + "s  [" + fmt + ", seed " + c.seed + "]" + (cut.pair ? "" : " (no clean cut found)") + "\n" + c.notes.join(", ");
};
TL.generateAll = function (opts) {
    opts = opts || {};
    var comp = opts.comp || app.project.activeItem;
    if (!(comp instanceof CompItem)) throw new Error("Open a composition");
    if (opts.sfx == null) opts.sfx = true;
    if (opts.overlays == null) opts.overlays = true;
    var cuts = allCuts(comp), n = 0;
    app.beginUndoGroup("TransitionLab - all cuts");
    try {
        for (var i = 0; i < cuts.length; i++) {
            var sid = (opts.style && opts.style !== "random") ? opts.style : STYLES[Math.floor(Math.random() * STYLES.length)].id;
            var o = {}; for (var k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];
            o.seed = null;
            TL.generateAt(comp, findCut(comp, cuts[i], comp.frameDuration), sid, o); n++;
        }
    } finally { app.endUndoGroup(); }
    return n + " transitions generated";
};
TL.removeAt = function (comp, t) {
    comp = comp || app.project.activeItem;
    if (!(comp instanceof CompItem)) return 0;
    t = (t != null) ? t : comp.time;
    var uids = {}, i, L, m;
    for (i = 1; i <= comp.numLayers; i++) {
        L = comp.layer(i); m = /^TL:(\d+)/.exec(L.comment || "");
        if (m && L.inPoint <= t + 1e-6 && L.outPoint >= t - 1e-6) uids[m[1]] = 1;
    }
    var n = 0;
    app.beginUndoGroup("TransitionLab - remove");
    for (i = comp.numLayers; i >= 1; i--) {
        L = comp.layer(i); m = /^TL:(\d+)/.exec(L.comment || "");
        if (m && uids[m[1]]) { L.remove(); n++; }
    }
    app.endUndoGroup();
    return n;
};

// ================================================================== UI
function buildUI(thisObj) {
    var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", "TransitionLab", undefined, { resizeable: true });
    w.orientation = "column"; w.alignChildren = ["fill", "top"]; w.spacing = 6; w.margins = 10;

    var hdr = w.add("statictext", undefined, "TRANSITIONLAB  v" + TL.VERSION);
    try { hdr.graphics.font = ScriptUI.newFont(hdr.graphics.font.name, "BOLD", 13); } catch (e) {}
    var fmt = w.add("statictext", undefined, "Format: auto (from active comp)");

    var pD = w.add("panel", undefined, "Duration");
    pD.orientation = "row"; pD.alignChildren = ["left", "center"]; pD.margins = [10, 14, 10, 8];
    var rbD = { "short": pD.add("radiobutton", undefined, "Short"), medium: pD.add("radiobutton", undefined, "Medium"), "long": pD.add("radiobutton", undefined, "Long") };
    var curD = getSetting("duration", "medium"); if (!rbD[curD]) curD = "medium";
    rbD[curD].value = true;

    var pS = w.add("panel", undefined, "Style");
    pS.orientation = "column"; pS.alignChildren = ["fill", "top"]; pS.spacing = 2; pS.margins = [10, 14, 10, 8];
    var rows = [], cur = getSetting("style", "FilmFlash");
    function refreshImport() {
        for (var i = 0; i < rows.length; i++) { var ok = false; try { ok = isImported(rows[i].id); } catch (e) {} rows[i].btn.text = ok ? "\u2713 Ready" : "Import"; }
    }
    for (var i = 0; i < STYLES.length; i++) {
        (function (st) {
            var g = pS.add("group"); g.orientation = "row"; g.alignChildren = ["left", "center"]; g.spacing = 4;
            var rb = g.add("radiobutton", undefined, st.name); rb.alignment = ["fill", "center"]; rb.preferredSize.width = 130;
            var bt = g.add("button", undefined, "Import"); bt.preferredSize = [72, 22]; bt.alignment = ["right", "center"];
            rb.value = (st.id === cur);
            rb.onClick = function () { for (var j = 0; j < rows.length; j++) rows[j].rb.value = (rows[j].id === st.id); setSetting("style", st.id); };
            bt.onClick = function () {
                app.beginUndoGroup("TL import");
                var r = TL.importStyle(st.id);
                app.endUndoGroup();
                status.text = (typeof r === "number") ? st.name + ": " + r + " file(s) imported" : st.name + ": " + r;
                refreshImport();
            };
            rows.push({ id: st.id, rb: rb, btn: bt });
        })(STYLES[i]);
    }

    var gO = w.add("group"); gO.orientation = "row"; gO.alignChildren = ["left", "center"];
    var cbS = gO.add("checkbox", undefined, "Sound FX"); cbS.value = getSetting("sfx", "1") === "1";
    var cbO = gO.add("checkbox", undefined, "Overlays"); cbO.value = getSetting("ovl", "1") === "1";
    var cbR = gO.add("checkbox", undefined, "Random style"); cbR.value = getSetting("rnd", "0") === "1";
    cbS.onClick = function () { setSetting("sfx", cbS.value ? "1" : "0"); };
    cbO.onClick = function () { setSetting("ovl", cbO.value ? "1" : "0"); };
    cbR.onClick = function () { setSetting("rnd", cbR.value ? "1" : "0"); };

    var bGen = w.add("button", undefined, "GENERATE"); bGen.preferredSize.height = 38;
    var gB = w.add("group"); gB.orientation = "row"; gB.alignChildren = ["fill", "center"];
    var bAll = gB.add("button", undefined, "All cuts"); var bDel = gB.add("button", undefined, "Remove at playhead");
    var gA = w.add("group"); gA.orientation = "row"; gA.alignChildren = ["fill", "center"];
    var bAss = gA.add("button", undefined, "Assets folder..."); var bImpAll = gA.add("button", undefined, "Import all");
    var status = w.add("statictext", undefined, "Put the playhead on a cut between two clips.", { multiline: true });
    status.preferredSize = [240, 56];

    function opts() {
        var d = "medium"; for (var k in rbD) if (rbD.hasOwnProperty(k) && rbD[k].value) d = k;
        setSetting("duration", d);
        var s = "FilmFlash"; for (var j = 0; j < rows.length; j++) if (rows[j].rb.value) s = rows[j].id;
        return { duration: d, style: cbR.value ? "random" : s, sfx: cbS.value, overlays: cbO.value };
    }
    function comp() { var c = app.project.activeItem; if (!(c instanceof CompItem)) { status.text = "Open a composition first."; return null; } fmt.text = "Format: " + (c.width > c.height * 1.05 ? "Horizontal" : (c.height > c.width * 1.05 ? "Vertical" : "Square")) + "  " + c.width + "x" + c.height; return c; }
    bGen.onClick = function () { var c = comp(); if (!c) return; try { status.text = TL.generate(opts()); } catch (e) { status.text = "Error: " + e.toString() + (e.line ? " (line " + e.line + ")" : ""); } refreshImport(); };
    bAll.onClick = function () { var c = comp(); if (!c) return; try { status.text = TL.generateAll(opts()); } catch (e) { status.text = "Error: " + e.toString() + (e.line ? " (line " + e.line + ")" : ""); } refreshImport(); };
    bDel.onClick = function () { var c = comp(); if (!c) return; status.text = TL.removeAt(c) + " layer(s) removed"; };
    bAss.onClick = function () { var f = Folder.selectDialog("Select the TransitionLab 'assets' folder"); if (f) { setSetting("assetsPath", f.fsName); status.text = "Assets: " + f.fsName; } };
    bImpAll.onClick = function () { app.beginUndoGroup("TL import all"); var n = 0; for (var j = 0; j < STYLES.length; j++) { var r = TL.importStyle(STYLES[j].id); if (typeof r === "number") n += r; } app.endUndoGroup(); status.text = n + " file(s) imported"; refreshImport(); };

    if (!assetsFolder()) status.text = "Assets folder not found - click 'Assets folder...'";
    refreshImport();
    w.layout.layout(true);
    w.onResizing = w.onResize = function () { this.layout.resize(); };
    if (w instanceof Window) { w.center(); w.show(); }
    return w;
}

if (!$.global.TL_HEADLESS) buildUI(thisObj);

})(this);

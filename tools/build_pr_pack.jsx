/*  Builds the Premiere Pro overlay pack with the AE TransitionLab engine.
    $.global.PACK = { styles:[...], orients:["H","V"], perDur:2, root:"<...>/assets/PR", start:true, only:null }
    For every style/orientation/duration it generates a transition at 1.2 s on placeholder clips,
    keeps only overlay layers and queues a render. Writes <root>/manifest.json.
*/
(function () {
    var P = $.global.PACK || {};
    $.global.TL_HEADLESS = true;
    $.evalFile(File("C:/Все файлы/TransitionLab/TransitionLab.jsx"));

    var CUT = 1.2, LEN = 2.4, FPS = 25;
    var ROOT = Folder(P.root || "C:/Все файлы/TransitionLab/assets/PR");
    var KIND = { FilmFlash: "screen", OpticalGlare: "screen", LensFlares: "screen", PunchHole: "screen", Horror: "screen", Paper: "alpha", VHS: "screen", Scrapbook: "alpha" };
    var SIZE = { H: [1920, 1080], V: [1080, 1920] };
    var DURS = ["short", "medium", "long"];
    var styles = P.styles || ["FilmFlash", "OpticalGlare", "LensFlares", "PunchHole", "Horror", "Paper", "VHS", "Scrapbook"];
    var orients = P.orients || ["H", "V"], perDur = P.perDur || 2;

    function mkdir(f) { if (!f.exists) { mkdir(f.parent); f.create(); } return f; }
    function folder(name, parent) {
        for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof FolderItem && it.name === name && it.parentFolder === parent) return it; }
        var f = app.project.items.addFolder(name); f.parentFolder = parent; return f;
    }
    var packBin = folder("TL PR Pack", app.project.rootFolder);
    var phSolids = [];
    var manifest = [], queued = 0, seed = P.seed || 7000;

    for (var o = 0; o < orients.length; o++) {
        var W = SIZE[orients[o]][0], H = SIZE[orients[o]][1];
        for (var s = 0; s < styles.length; s++) {
            var st = styles[s], kind = KIND[st];
            var outDir = mkdir(Folder(ROOT.fsName + "/" + orients[o] + "/" + st));
            for (var d = 0; d < DURS.length; d++) {
                for (var n = 1; n <= perDur; n++) {
                    var nm = st.toLowerCase() + "_" + DURS[d] + "_" + (n < 10 ? "0" : "") + n;
                    var comp = app.project.items.addComp("TGPACK " + orients[o] + " " + nm, W, H, 1, LEN, FPS);
                    comp.parentFolder = packBin; comp.bgColor = [0, 0, 0];
                    var A = comp.layers.addSolid([0.5, 0.5, 0.5], "ph A", W, H, 1, LEN); A.inPoint = 0; A.outPoint = CUT;
                    var B = comp.layers.addSolid([0.4, 0.4, 0.4], "ph B", W, H, 1, LEN); B.inPoint = CUT; B.outPoint = LEN;
                    var srcA = A.source, srcB = B.source;
                    seed += 17;
                    TL.generateAt(comp, { time: CUT, A: A, B: B, pair: true }, st, { seed: seed, duration: DURS[d], sfx: false, overlays: false });
                    // strip everything that is not a pure overlay
                    for (var i = comp.numLayers; i >= 1; i--) {
                        var L = comp.layer(i), kill = false;
                        if (L instanceof AVLayer) {
                            if (L.adjustmentLayer || !L.hasVideo) kill = true;
                            if (L.source === srcA || L.source === srcB) kill = true;
                        }
                        if (/blanking bar/.test(L.name)) kill = true;
                        if (kind === "screen" && /scanlines/.test(L.name)) kill = true;
                        if (kill) L.remove();
                    }
                    if (kind === "alpha") {
                        for (var j = 1; j <= comp.numLayers; j++) {
                            var Lj = comp.layer(j);
                            if (Lj.blendingMode === BlendingMode.SCREEN || Lj.blendingMode === BlendingMode.ADD) {
                                var sc = Lj.property("ADBE Effect Parade").addProperty("ADBE Shift Channels");
                                try { sc.property(1).setValue(5); } catch (e) {}    // Take Alpha From: Luminance
                                Lj.blendingMode = BlendingMode.NORMAL;
                            }
                        }
                    }
                    try { srcA.remove(); srcB.remove(); } catch (e2) {}
                    var ext = kind === "alpha" ? ".mov" : ".mp4";
                    var f = File(outDir.fsName + "/" + nm + ext);
                    if (!P.only || P.only === nm) {
                        var rq = app.project.renderQueue.items.add(comp);
                        try { rq.applyTemplate("Best Settings"); } catch (e3) {}
                        var om = rq.outputModule(1);
                        om.applyTemplate(kind === "alpha" ? "High Quality with Alpha" : "H.264 - Match Render Settings - 15 Mbps");
                        om.file = f;
                        queued++;
                    }
                    manifest.push('{"style":"' + st + '","orient":"' + orients[o] + '","dur":"' + DURS[d] + '","file":"' + orients[o] + "/" + st + "/" + nm + ext + '","blend":"' + kind + '"}');
                }
            }
        }
    }
    var mf = File(ROOT.fsName + "/manifest.json");
    mkdir(ROOT); mf.encoding = "UTF-8"; mf.open("w");
    mf.write('{"fps":' + FPS + ',"cut":' + CUT + ',"length":' + LEN + ',"items":[\n' + manifest.join(",\n") + "\n]}\n");
    mf.close();
    if (P.start) app.scheduleTask("app.project.renderQueue.render()", 500, false);
    return queued + " renders queued, manifest " + manifest.length + " items";
})();

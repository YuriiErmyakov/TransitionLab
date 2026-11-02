// Test harness: $.global.T = { style, seed, duration, times:[...], out: "folder", keep:false }
(function () {
    var T = $.global.T || {};
    $.global.TL_HEADLESS = true;
    $.evalFile(File("C:/Все файлы/TransitionLab/TransitionLab.jsx"));
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof CompItem && app.project.item(i).name === (T.comp || "TL test")) comp = app.project.item(i);
    if (!T.keep) for (var j = comp.numLayers; j >= 1; j--) if (/^TL:/.test(comp.layer(j).comment || "")) comp.layer(j).remove();
    comp.time = T.time != null ? T.time : 4;
    var msg = TL.generate({ comp: comp, style: T.style, seed: T.seed, duration: T.duration || "medium", sfx: T.sfx !== false });
    var out = Folder(T.out); if (!out.exists) out.create();
    var times = T.times || [-0.4, -0.2, -0.1, -0.04, 0, 0.04, 0.12, 0.24, 0.4, 0.6];
    var files = [];
    for (var k = 0; k < times.length; k++) {
        var t = comp.time + times[k];
        var f = File(out.fsName + "/f" + (k < 10 ? "0" : "") + k + ".png");
        if (f.exists) f.remove();
        comp.saveFrameToPng(t, f);
        files.push(f.fsName);
    }
    return msg;
})();

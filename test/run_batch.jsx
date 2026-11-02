// Batch test: $.global.TB = { styles:[...], seed, duration, out }
// Each style goes into its own duplicate "CA test - <style>" comp so async frame saves don't collide.
(function () {
    var TB = $.global.TB || {};
    $.global.CA_HEADLESS = true;
    $.evalFile(File("C:/Все файлы/CutAlchemy/CutAlchemy.jsx"));
    function findComp(n) { for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if (it instanceof CompItem && it.name === n) return it; } return null; }
    var base = findComp("CA test");
    var times = TB.times || [-0.4, -0.2, -0.1, -0.04, 0, 0.04, 0.12, 0.24, 0.4, 0.6];
    var log = [];
    for (var s = 0; s < TB.styles.length; s++) {
        var name = "CA test - " + TB.styles[s] + (TB.suffix || "");
        var old = findComp(name); if (old) old.remove();
        var comp = base.duplicate(); comp.name = name;
        comp.time = 4;
        try {
            log.push(CA.generate({ comp: comp, style: TB.styles[s], seed: TB.seed, duration: TB.duration || "medium", sfx: true }));
        } catch (e) { log.push(TB.styles[s] + " ERROR: " + e.toString() + " line " + e.line); continue; }
        var out = Folder(TB.out + "/" + TB.styles[s] + (TB.suffix || "")); if (!out.exists) out.create();
        var old2 = out.getFiles("*.png"); for (var o = 0; o < old2.length; o++) old2[o].remove();
        for (var k = 0; k < times.length; k++) comp.saveFrameToPng(4 + times[k], File(out.fsName + "/f" + (k < 10 ? "0" : "") + k + ".png"));
    }
    return log.join("\n");
})();

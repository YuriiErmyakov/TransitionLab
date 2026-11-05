// Builds effectcraft/TransitionLab-EC.jsx (the EffectCraft edition) from TransitionLab.jsx.
// The After Effects file stays untouched; run `node tools/build_ec.mjs` after every change to it.
//
// Why a separate build: After Effects numbers effect parameters flat, a group taking one index for
// its start and one for its end (Fractal Noise: 7 = Transform, 8..14 its controls, 15 = end).
// EffectCraft nests groups (7 = Transform, 7.1..7.7). The EC edition patches every effect it adds
// so that effect.property(n) keeps the After Effects meaning.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let s = readFileSync(join(root, "TransitionLab.jsx"), "utf8").replace(/\r\n/g, "\n");

function swap(from, to) {
    if (!s.includes(from)) throw new Error("build_ec: pattern not found: " + from);
    s = s.split(from).join(to);
}

swap("/*  TransitionLab for After Effects  -  v", "/*  TransitionLab for EffectCraft (built from TransitionLab.jsx by tools/build_ec.mjs)  -  v");
swap(`    var e = parade.addProperty(mn);\n`, `    var e = aeIndexed(parade.addProperty(mn));\n`);
swap(`function tryFx(layer, mn, vals) {`, `// effect.property(n) with After Effects' flat numbering (group start and end each take an index)
function aeIndexed(e) {
    var flat = [], END = {};
    (function walk(g) {
        for (var i = 1; i <= g.numProperties; i++) {
            var p = g.property(i);
            if (p.numProperties > 0) { flat.push(p); walk(p); flat.push(END); } else flat.push(p);
        }
    })(e);
    var own = e.property;
    e.property = function (n) {
        if (typeof n !== "number") return own.call(e, n);
        var p = flat[n - 1];
        if (!p || p === END) throw new Error(e.matchName + ": no parameter " + n);
        return p;
    };
    return e;
}
function tryFx(layer, mn, vals) {`);
// An installed EffectCraft panel has no folder of its own ($.fileName is the bare file name), and
// without Preferences > Scripting & Expressions > Allow Scripts to Write Files a script can't look into
// folders, though importing a file by its full path works. So the assets path comes from the
// installer (effectcraft/install.ps1 writes it over SCRIPT_FILE) or from the Assets folder button,
// and the bundled assets are listed here; files a user adds are found when folders can be read.
const assetList = [];
(function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + "/");
        else assetList.push(rel + e.name);
    }
})(join(root, "assets"), "");
assetList.sort();
swap(`function assetsFolder() {
    var saved = getSetting("assetsPath", "");
    if (saved && Folder(saved).exists) return Folder(saved);
    var cands = [SCRIPT_FILE.parent.fsName + "/assets", SCRIPT_FILE.parent.fsName + "/TransitionLab/assets"];
    for (var i = 0; i < cands.length; i++) if (Folder(cands[i]).exists) return Folder(cands[i]);
    return null;
}`, `var BUNDLED_ASSETS = ${JSON.stringify(assetList)};
function assetsFolder() {
    var saved = getSetting("assetsPath", "");
    if (saved) return Folder(saved);
    var dir = "";
    try { dir = SCRIPT_FILE.parent ? String(SCRIPT_FILE.parent.fsName) : ""; } catch (e) {}
    return dir ? Folder(dir + "/assets") : null;
}
// the folder's files when folders can be read, else the bundled ones that belong in it
function assetFiles(root, styleId, kind, re) {
    var files = [];
    try { files = Folder(root.fsName + "/" + styleId + "/" + kind).getFiles(function (f) { return f instanceof File && re.test(f.name); }) || []; } catch (e) { files = []; }
    if (files.length) return files;
    var head = styleId + "/" + kind + "/";
    for (var i = 0; i < BUNDLED_ASSETS.length; i++) {
        var p = BUNDLED_ASSETS[i];
        if (p.indexOf(head) === 0 && re.test(p)) files.push(File(root.fsName + "/" + p));
    }
    return files;
}`);
swap(`        var fol = Folder(root.fsName + "/" + styleId + "/" + kinds[k][0]);
        if (!fol.exists) continue;
`, ``);
swap(`        var files = fol.getFiles(function (f) { return f instanceof File && kinds[k][1].test(f.name); });`,
    `        var files = assetFiles(root, styleId, kinds[k][0], kinds[k][1]);`);
// EffectCraft centres a radio button inside a wider control: size it to its text, keep the
// row full width and the Import button on the right
swap(`var g = pS.add("group"); g.orientation = "row"; g.alignChildren = ["left", "center"]; g.spacing = 4;`,
    `var g = pS.add("group"); g.orientation = "row"; g.alignChildren = ["left", "center"]; g.spacing = 4; g.alignment = ["fill", "center"];`);
swap(`var rb = g.add("radiobutton", undefined, st.name); rb.alignment = ["fill", "center"]; rb.preferredSize.width = 130;`,
    `var rb = g.add("radiobutton", undefined, ""); rb.preferredSize.width = 18;
            var lb = g.add("statictext", undefined, st.name); lb.preferredSize.width = 108; lb.justify = "left";`);
// EffectCraft names the repeater's position like a group transform's
swap(`rp.property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position")`,
    `rp.property("ADBE Vector Repeater Transform").property("ADBE Vector Position")`);
swap(`"TRANSITIONLAB  v"`, `"TRANSITIONLAB for EffectCraft  v"`);

const out = join(root, "effectcraft", "TransitionLab-EC.jsx");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, s);
console.log("wrote " + out);

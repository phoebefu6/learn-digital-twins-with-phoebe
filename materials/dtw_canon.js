/* Writes every bench setting the widget offers, computed by assets/dtw-live.js, as JSON.
   Usage: node materials/dtw_canon.js <repo> <out.json>   (by Phoebe Fu) */
var path = require("path"), fs = require("fs");
var repo = process.argv[2] || ".", out = process.argv[3];
var D = require(path.resolve(repo, "assets/dtw-live.js"));
function slimRung(r) {
  var o = { id: r.id, rmse: r.rmse, energy: r.energy, eTrue: r.eTrue, eErr: r.eErr, eBase: r.eBase, saving: r.saving };
  if (r.cover !== undefined) {
    o.cover = r.cover; o.width = r.width; o.flagged = r.flagged;
    o.floors = r.floors.map(function (f) { return { rmse: f.rmse, eErr: f.eErr, cover: f.cover, width: f.width, gain: f.gain, z: f.shift.z, w1: f.shift.w1, w2: f.shift.w2 }; });
  } else {
    o.floors = r.floors.map(function (f) { return { rmse: f.rmse, eErr: f.eErr }; });
  }
  return o;
}
var res = { generated: "2026-11-24", defaults: D.DEFAULTS, world: D.WORLD, selfTest: D.selfTest(), faults: {}, settings: {} };
D.FAULTS.forEach(function (f) { res.faults[f] = D.selfTest(f).pass; });
[1124, 1, 7, 42].forEach(function (seed) {
  var L = D.ladder({ seed: seed });
  var s = { truthK: L.truthK, cal: L.cal, sensorRmse: L.sensorRmse, trueSaving: L.trueSaving,
    rungs: L.rungs.map(slimRung), anti: slimRung(L.anti), brk: slimRung(L.brk), custom: {} };
  [0.4, 0.2, 0.1, 0.01].forEach(function (sd) {
    [false, true].forEach(function (b) { s.custom[sd + "_" + (b ? "break" : "clean")] = slimRung(D.custom(sd, b, { seed: seed })); });
  });
  res.settings[String(seed)] = s;
});
var st = JSON.stringify(res, null, 1);
if (out) fs.writeFileSync(out, st); else console.log(st);

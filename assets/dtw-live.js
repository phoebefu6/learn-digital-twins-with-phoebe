/* dtw-live.js - the computed engine for learn-digital-twins-with-phoebe, by Phoebe Fu.
   One file for node and the browser. Python mirror: materials/dtw_reference.py (must agree).

   EVERYTHING HERE IS SYNTHETIC AND CONSTRUCTED. Kittiwake Hall is a fictional six-storey teaching
   building. Its facilities team builds a thermal twin of each floor to plan heating. The "real"
   building is a seeded generator; the twin is a 2-node RC model (room air Ti, building mass Tm).

   How the constructed world is wired (each line is a modelling choice, declared on the widget):
   - 14 days, hourly. Day 0 is a Monday. Week 1 = calibration week (the normal schedule).
     Week 2 = the trial week: the real building runs a night setback (15 C at night and weekends).
   - weather: daily mean outdoor temperature is a seeded random walk from 6 C, plus a 3.5 C daily swing;
     solar gain on weekdays and weekends from a seeded cloudiness per day.
   - occupants: 2.5 kW per floor in occupied hours, scaled by a seeded 0.6 to 1.0 per floor per day.
     The twin only knows the timetable, so it assumes 0.8.
   - as-built gap: each real floor loses heat 1.15 to 1.45 times faster than the drawings say (kU),
     and stores 0.70 to 0.95 of the designed mass (kC). The design-spec twin uses 1.0 and 1.0.
   - a thermostat on each floor heats with 4 kW per degree below setpoint, up to 20 kW, reading its
     own noisy sensor; the heat meter logs what it delivered. Sensors: noise sd 0.4 C. Unmodelled
     disturbances (doors, windows, people moving) add sd 0.12 C per hour to the real room.
   Ladder: design-spec twin (open loop) -> calibrated kU, kC (grid search on week 1) -> + Kalman
   data assimilation -> what-if (night setback, 24 h ahead each midnight of week 2, with a 95% band)
   -> scorecard (tracking RMSE against the true room, band coverage, energy estimate error).
   Anti-lever: tell the filter the sensors are perfect (assumed sd 0.01 C): it copies the noise,
   the band collapses and coverage falls.
   Break button: an unlogged insulation retrofit on floor 4 at the start of week 2 (kU x 0.6):
   the twin drifts, floor 4's innovations shift, and the widget points at the change log.
   selfTest() runs on load; each check is proven to fail on a planted fault (FAULTS).
*/
(function (root) {
  "use strict";

  var FAULT = null; // set only inside selfTest to prove a check can fail
  var Z95 = 1.959963984540054;

  var WORLD = {
    floors: 6, days: 14, sub: 4,
    Ci: 6.0, Cm: 20.0, Rim: 0.5, Rio: 10.0, Rmo: 4.0, endFloorLoss: 1.3,
    kULo: 1.15, kUHi: 1.45, kCLo: 0.70, kCHi: 0.95,
    occKw: 2.5, occLo: 0.6, occHi: 1.0, occAssumed: 0.8,
    solarKw: 3.0, tMean0: 6.0, tWalkSd: 1.5, tSwing: 3.5,
    kp: 4.0, qMax: 20.0, sensorSd: 0.4, procSd: 0.12,
    dayOn: 7, dayOff: 19, tDay: 21, tNight: 19, tSetback: 15,
    retrofitFloor: 3, retrofitKU: 0.6, burnInDays: 3
  };

  var DEFAULTS = { seed: 1124, sensorSdAssumed: 0.4, qi: 0.3, qm: 0.05 };

  var RUNGS = [
    { id: "design", label: "Design-spec twin (open loop)" },
    { id: "calib", label: "Calibrated kU and kC (open loop)" },
    { id: "kalman", label: "+ Kalman data assimilation" }
  ];

  function extend(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    if (b) for (k in b) o[k] = b[k];
    return o;
  }

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rnd) { // Box-Muller, two draws per call, no caching
    var u1 = rnd(), u2 = rnd();
    return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
  }

  function occupied(day, h) { var dow = ((day % 7) + 7) % 7; return dow < 5 && h >= 8 && h < 18; }
  function setpoint(day, h, setback) {
    var dow = ((day % 7) + 7) % 7, on = dow < 5 && h >= WORLD.dayOn && h < WORLD.dayOff;
    return on ? WORLD.tDay : (setback ? WORLD.tSetback : WORLD.tNight);
  }
  function heat(tset, tread) { var q = WORLD.kp * (tset - tread); return q < 0 ? 0 : (q > WORLD.qMax ? WORLD.qMax : q); }

  // Parameters of one floor: design multipliers for end floors, times kU / kC.
  function params(f, kU, kC) {
    var end = (f === 0 || f === WORLD.floors - 1) ? WORLD.endFloorLoss : 1;
    return { Ci: WORLD.Ci, Cm: WORLD.Cm * kC, Rim: WORLD.Rim, Rio: WORLD.Rio / (kU * end), Rmo: WORLD.Rmo / (kU * end) };
  }

  // One hour of the 2-node RC model, explicit Euler in WORLD.sub substeps. u = {to, q (kW into room air)}.
  function step(p, x, to, q) {
    var dt = 1 / WORLD.sub, ti = x[0], tm = x[1];
    for (var s = 0; s < WORLD.sub; s++) {
      var dti = ((tm - ti) / p.Rim + (to - ti) / p.Rio + q) / p.Ci;
      var dtm = ((ti - tm) / p.Rim + (to - tm) / p.Rmo) / p.Cm;
      ti += dt * dti; tm += dt * dtm;
    }
    return [ti, tm];
  }

  // The constructed world: weather, solar, occupancy, the real floors, their sensors and heat meters.
  // Draw order is fixed: floor multipliers, then per day weather and cloud, then per day per floor occupancy,
  // then per hour per floor process noise and sensor noise.
  function world(seed, brk, noSetback) {
    var rnd = mulberry32(seed), F = WORLD.floors, D = WORLD.days, B = WORLD.burnInDays, f, d, h, i;
    var kU = [], kC = [];
    for (f = 0; f < F; f++) { kU.push(WORLD.kULo + (WORLD.kUHi - WORLD.kULo) * rnd()); kC.push(WORLD.kCLo + (WORLD.kCHi - WORLD.kCLo) * rnd()); }
    var tMean = [], cloud = [], occ = [], m = WORLD.tMean0;
    for (d = -B; d <= D; d++) { m += WORLD.tWalkSd * normal(rnd); tMean.push(m); cloud.push(0.2 + 0.8 * rnd()); }
    for (d = -B; d <= D; d++) { var row = []; for (f = 0; f < F; f++) row.push(WORLD.occLo + (WORLD.occHi - WORLD.occLo) * rnd()); occ.push(row); }
    var T = (D + B) * 24 + 1, to = [], sol = [], occT = [];
    for (i = 0; i < T; i++) {
      d = Math.floor(i / 24) - B; h = i % 24;
      to.push(tMean[d + B] + WORLD.tSwing * Math.sin(2 * Math.PI * (h - 9) / 24));
      sol.push(h >= 7 && h < 17 ? WORLD.solarKw * cloud[d + B] * Math.sin(Math.PI * (h - 7) / 10) : 0);
      var o = [];
      for (f = 0; f < F; f++) o.push(occupied(d, h) ? WORLD.occKw * occ[d + B][f] : 0);
      occT.push(o);
    }
    var x = [], truth = [], meas = [], qlog = [];
    for (f = 0; f < F; f++) { x.push([WORLD.tNight, WORLD.tNight]); truth.push([]); meas.push([]); qlog.push([]); }
    var start = B * 24;
    for (i = 0; i < T; i++) {
      d = Math.floor(i / 24) - B; h = i % 24;
      var setback = d >= 7 && !noSetback;
      for (f = 0; f < F; f++) {
        var y = x[f][0] + WORLD.sensorSd * normal(rnd);
        if (i >= start) { truth[f].push(x[f][0]); meas[f].push(y); }
        if (i === T - 1) continue;
        var q = heat(setpoint(d, h, setback), y);
        if (i >= start) qlog[f].push(q);
        var ku = kU[f];
        if (brk && f === WORLD.retrofitFloor && d >= 7 && FAULT !== "breakLogged") ku = ku * WORLD.retrofitKU; // planted fault: the change reaches the model too
        x[f] = step(params(f, ku, kC[f]), x[f], to[i], q + sol[i] + occT[i][f]);
        x[f][0] += WORLD.procSd * normal(rnd);
      }
    }
    // inputs the twin sees: weather, solar, the timetable (not true occupancy), the heat meter
    var toW = to.slice(start), solW = sol.slice(start), occN = [];
    for (i = 0; i < toW.length; i++) { d = Math.floor(i / 24); h = i % 24; occN.push(occupied(d, h) ? WORLD.occKw * WORLD.occAssumed : 0); }
    return { kU: kU, kC: kC, to: toW, sol: solW, occN: occN, truth: truth, meas: meas, qlog: qlog, n: D * 24 + 1, brk: !!brk };
  }

  // Open-loop simulation of one floor's twin over hours [0, n), driven by logged heat. Returns Ti per hour.
  function openLoop(W, f, p, n) {
    var x = [W.meas[f][0], W.meas[f][0]], out = [x[0]], xs = [x.slice()];
    for (var i = 0; i < n - 1; i++) {
      x = step(p, x, W.to[i], W.qlog[f][i] + W.sol[i] + W.occN[i]);
      out.push(x[0]); xs.push(x.slice());
    }
    return { ti: out, x: xs };
  }

  function rmse(a, b, lo, hi) { var s = 0, n = 0; for (var i = lo; i < hi; i++) { var e = a[i] - b[i]; s += e * e; n++; } return Math.sqrt(s / n); }

  // Calibration: grid search on kU, kC minimising week-1 open-loop RMSE against the sensors
  // (hours 24 to 168; the first day is warm-up). Coarse grid at 0.1, then fine at 0.02 around the best.
  function calibrate(W, f) {
    if (FAULT === "calibStale") return { kU: 1, kC: 1, rmse: NaN };
    var best = { kU: 1, kC: 1, rmse: Infinity };
    function tryOne(ku, kc) {
      var r = rmse(openLoop(W, f, params(f, ku, kc), 169).ti, W.meas[f], 24, 169);
      if (r < best.rmse) best = { kU: ku, kC: kc, rmse: r };
    }
    var a, b;
    for (a = 0; a <= 15; a++) for (b = 0; b <= 12; b++) tryOne(0.5 + 0.1 * a, 0.4 + 0.1 * b);
    var cu = best.kU, cc = best.kC;
    for (a = -5; a <= 5; a++) for (b = -5; b <= 5; b++) tryOne(cu + 0.02 * a, cc + 0.02 * b);
    return best;
  }

  // Linear hourly map of the model: x' = A x + bq * (heat+gains) + bo * to. Found by stepping unit inputs.
  function linear(p) {
    var z = step(p, [0, 0], 0, 0), c1 = step(p, [1, 0], 0, 0), c2 = step(p, [0, 1], 0, 0);
    var bq = step(p, [0, 0], 0, 1);
    return { A: [[c1[0] - z[0], c2[0] - z[0]], [c1[1] - z[1], c2[1] - z[1]]], bq: bq };
  }
  function mm(A, B) { return [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]], [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]]; }
  function tr(A) { return [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]; }
  function propagate(A, P, Q) { var M = mm(mm(A, P), tr(A)); return [[M[0][0] + Q[0][0], M[0][1] + Q[0][1]], [M[1][0] + Q[1][0], M[1][1] + Q[1][1]]]; }

  // Kalman update on a measurement of Ti (H = [1, 0]). Returns state, covariance, gain, innovation.
  function update(x, P, y, r) {
    var S = P[0][0] + r, K = [P[0][0] / S, P[1][0] / S], v = y - x[0];
    var sgn = FAULT === "gainSign" ? -1 : 1;
    var xn = [x[0] + sgn * K[0] * v, x[1] + sgn * K[1] * v];
    var Pn = FAULT === "noCovUpdate" ? P : [[(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]], [P[1][0] - K[1] * P[0][0], P[1][1] - K[1] * P[0][1]]];
    return { x: xn, P: Pn, K: K, v: v, S: S };
  }

  // Kalman filter over the whole record for one floor. Returns posterior Ti and the state/cov at each hour, plus innovations.
  function kalman(W, f, p, o) {
    var r = o.sensorSdAssumed * o.sensorSdAssumed, Q = [[o.qi * o.qi, 0], [0, o.qm * o.qm]];
    var x = [W.meas[f][0], W.meas[f][0]], P = [[r, 0], [0, 1.0]], post = [x[0]], xs = [x.slice()], Ps = [P], innov = [0], gain = [0];
    var L = linear(p);
    for (var i = 0; i < W.n - 1; i++) {
      x = step(p, x, W.to[i], W.qlog[f][i] + W.sol[i] + W.occN[i]);
      P = propagate(L.A, P, Q);
      var u = update(x, P, W.meas[f][i + 1], r);
      x = u.x; P = u.P;
      post.push(x[0]); xs.push(x.slice()); Ps.push(P); innov.push(u.v); gain.push(u.K[0]);
    }
    return { ti: post, x: xs, P: Ps, innov: innov, gain: gain };
  }

  // What-if: from each midnight of week 2, run the twin 24 h ahead under the setback schedule with its own
  // thermostat. Band = 1.96 sd of the predicted sensor reading (state covariance + assumed sensor noise),
  // propagated through the closed loop when the thermostat is between 0 and full power.
  function whatIf(W, f, p, xs, Ps, o) {
    var r = o.sensorSdAssumed * o.sensorSdAssumed, Q = [[o.qi * o.qi, 0], [0, o.qm * o.qm]], L = linear(p);
    var energy = 0, inBand = 0, nBand = 0, width = 0, pred = [];
    for (var d = 7; d < 14; d++) {
      var t0 = d * 24, x = xs[t0].slice(), P = Ps ? Ps[t0] : null;
      for (var k = 0; k < 24; k++) {
        var i = t0 + k, h = k;
        var q = heat(setpoint(d, h, true), x[0]);
        energy += q;
        x = step(p, x, W.to[i], q + W.sol[i] + W.occN[i]);
        if (P) {
          var A = L.A;
          var Qe = Q;
          if (q > 0 && q < WORLD.qMax) {
            // closed loop: the real thermostat reads a noisy sensor, so its noise enters the room too
            A = [[A[0][0] - L.bq[0] * WORLD.kp, A[0][1]], [A[1][0] - L.bq[1] * WORLD.kp, A[1][1]]];
            var g0 = L.bq[0] * WORLD.kp, g1 = L.bq[1] * WORLD.kp;
            Qe = [[Q[0][0] + g0 * g0 * r, g0 * g1 * r], [g0 * g1 * r, Q[1][1] + g1 * g1 * r]];
          }
          P = propagate(A, P, Qe);
          var sd = Math.sqrt(P[0][0] + (FAULT === "bandNoR" ? 0 : r)), y = W.meas[f][i + 1];
          if (Math.abs(y - x[0]) <= Z95 * sd) inBand++;
          nBand++; width += 2 * Z95 * sd;
        }
        pred.push(x[0]);
      }
    }
    var eTrue = 0;
    for (var j = 168; j < 336; j++) eTrue += W.qlog[f][j];
    return { energy: energy, eTrue: eTrue, inBand: inBand, nBand: nBand, width: nBand ? width / nBand : null, pred: pred };
  }

  // Planning what-if: at the end of week 1, run the twin the whole of week 2 ahead from its state at hour 168,
  // with its own thermostat, under the setback schedule or the normal one. Returns the heat it would use.
  function plan(W, p, x0, setback) {
    var x = x0.slice(), e = 0;
    for (var i = 168; i < 336; i++) {
      var d = Math.floor(i / 24), h = i % 24, q = heat(setpoint(d, h, setback), x[0]);
      e += q;
      x = step(p, x, W.to[i], q + W.sol[i] + W.occN[i]);
    }
    return e;
  }

  // Innovation shift test per floor: week-2 mean minus week-1 mean (hours 24-167 vs 168-336), Welch z.
  function shift(innov) {
    function ms(lo, hi) { var s = 0, n = 0, i; for (i = lo; i < hi; i++) { s += innov[i]; n++; } var m = s / n, v = 0; for (i = lo; i < hi; i++) v += (innov[i] - m) * (innov[i] - m); return { m: m, v: v / (n - 1), n: n }; }
    var a = ms(25, 168), b = ms(168, 337);
    var z = (b.m - a.m) / Math.sqrt(a.v / a.n + b.v / b.n);
    return { w1: a.m, w2: b.m, delta: b.m - a.m, z: z };
  }

  function runRung(id, W, o, cal) {
    var F = WORLD.floors, f, res = { id: id, floors: [] }, sT = 0, nT = 0, E = 0, Et = 0, inB = 0, nB = 0, wid = 0, Eb = 0;
    for (f = 0; f < F; f++) {
      var p = id === "design" ? params(f, 1, 1) : params(f, cal[f].kU, cal[f].kC), run, Ps = null;
      if (id === "kalman") { run = kalman(W, f, p, o); Ps = run.P; } else run = openLoop(W, f, p, W.n);
      var wi = whatIf(W, f, p, run.x, Ps, o), es = plan(W, p, run.x[168], true), eb = plan(W, p, run.x[168], false);
      var r2 = rmse(run.ti, W.truth[f], 168, W.n);
      var row = { rmse: r2, energy: es, eTrue: wi.eTrue, eErr: (es - wi.eTrue) / wi.eTrue, eBase: eb };
      if (id === "kalman") {
        row.cover = wi.inBand / wi.nBand; row.width = wi.width; row.shift = shift(run.innov);
        var g = 0; for (var j = 168; j < W.n; j++) g += run.gain[j]; row.gain = g / (W.n - 168);
        inB += wi.inBand; nB += wi.nBand; wid += wi.width;
      }
      res.floors.push(row);
      for (var t = 168; t < W.n; t++) { var e = run.ti[t] - W.truth[f][t]; sT += e * e; nT++; }
      E += es; Et += wi.eTrue; Eb += eb;
    }
    res.rmse = Math.sqrt(sT / nT); res.energy = E; res.eTrue = Et; res.eErr = (E - Et) / Et; res.eBase = Eb; res.saving = (Eb - E) / Eb;
    if (id === "kalman") {
      res.cover = inB / nB; res.width = wid / F;
      var flagged = [];
      res.floors.forEach(function (r, i) { if (Math.abs(r.shift.z) > 4) flagged.push(i); });
      res.flagged = flagged;
    }
    return res;
  }

  // Sensor-only baseline: what you get by reading the sensors with no model at all.
  function sensorRmse(W) {
    var s = 0, n = 0;
    for (var f = 0; f < WORLD.floors; f++) for (var t = 168; t < W.n; t++) { var e = W.meas[f][t] - W.truth[f][t]; s += e * e; n++; }
    return Math.sqrt(s / n);
  }

  function ladder(opts) {
    var o = extend(DEFAULTS, opts), W = world(o.seed, false);
    var cal = [];
    for (var f = 0; f < WORLD.floors; f++) cal.push(calibrate(W, f));
    var rungs = RUNGS.map(function (r) { var x = runRung(r.id, W, o, cal); x.label = r.label; return x; });
    var anti = runRung("kalman", W, extend(o, { sensorSdAssumed: 0.01 }), cal); anti.id = "anti"; anti.label = "Trust the sensors fully";
    var WB = world(o.seed, true);
    var brk = runRung("kalman", WB, o, cal); brk.id = "break"; brk.label = "Unlogged retrofit, floor 4";
    var WN = world(o.seed, false, true), eBase = 0, eSet = 0;
    for (f = 0; f < WORLD.floors; f++) for (var j = 168; j < 336; j++) { eBase += WN.qlog[f][j]; eSet += W.qlog[f][j]; }
    var trueSaving = { base: eBase, setback: eSet, saving: (eBase - eSet) / eBase };
    return { opts: o, truthK: { kU: W.kU, kC: W.kC }, cal: cal, rungs: rungs, anti: anti, brk: brk, sensorRmse: sensorRmse(W), trueSaving: trueSaving };
  }

  // One Kalman run with the reader's own assumed sensor noise (and optionally the break), on the same world.
  function custom(sd, brk, opts) {
    var o = extend(DEFAULTS, opts), W = world(o.seed, false), cal = [];
    for (var f = 0; f < WORLD.floors; f++) cal.push(calibrate(W, f));
    var r = runRung("kalman", brk ? world(o.seed, true) : W, extend(o, { sensorSdAssumed: sd }), cal);
    r.id = "custom"; return r;
  }

  // Each check is a property; selfTest(fault) re-runs them with a fault planted in the REAL code path.
  function selfTest(fault) {
    var prev = FAULT; FAULT = fault || null;
    var checks = [];
    try {
      // 1. scalar random walk: steady-state gain equals the closed form K = P/(P+r), P = (q + sqrt(q^2+4qr))/2
      var q = 0.09, r = 0.16, x = [0, 0], P = [[1, 0], [0, 1]];
      for (var i = 0; i < 400; i++) { P = [[P[0][0] + q, 0], [0, 1]]; var u = update(x, P, 0, r); P = u.P; x = u.x; }
      var Pp = (q + Math.sqrt(q * q + 4 * q * r)) / 2, Kss = Pp / (Pp + r), uu = update([0, 0], [[P[0][0] + q, 0], [0, 1]], 0, r);
      checks.push({ name: "Kalman gain on a random walk settles at the closed form P/(P+r) = " + Kss.toFixed(4), pass: Math.abs(uu.K[0] - Kss) < 1e-9 });
      // 2. the update moves the state toward the measurement by K times the innovation
      var u2 = update([20, 20], [[0.16, 0], [0, 1]], 21, 0.16);
      checks.push({ name: "an update with equal prior and sensor variance lands halfway to the reading", pass: Math.abs(u2.x[0] - 20.5) < 1e-12 });
      var L = ladder({ seed: 1124 });
      var kal = L.rungs[2];
      checks.push({ name: "calibration recovers each floor's heat-loss multiplier kU within 0.1", pass: L.cal.every(function (c, f) { return Math.abs(c.kU - L.truthK.kU[f]) < 0.1; }) });
      checks.push({ name: "the honest filter tracks the true room better than the raw sensors", pass: kal.rmse < L.sensorRmse });
      checks.push({ name: "the honest what-if band covers between 90 and 99.5 percent of week-2 readings (nominal 95)", pass: kal.cover >= 0.90 && kal.cover <= 0.995, value: kal.cover });
      checks.push({ name: "an unlogged retrofit on floor 4 is flagged on floor 4 and nowhere else", pass: L.brk.flagged.length === 1 && L.brk.flagged[0] === WORLD.retrofitFloor && kal.flagged.length === 0 });
    } catch (err) {
      checks.push({ name: "engine threw: " + String(err), pass: false });
    }
    FAULT = prev;
    var pass = checks.every(function (c) { return c.pass; });
    return { pass: pass, checks: checks, fault: fault || null };
  }

  var DTW = {
    WORLD: WORLD, DEFAULTS: DEFAULTS, RUNGS: RUNGS,
    mulberry32: mulberry32, world: world, params: params, step: step, calibrate: calibrate, kalman: kalman, update: update,
    whatIf: whatIf, ladder: ladder, custom: custom, selfTest: selfTest,
    FAULTS: ["gainSign", "noCovUpdate", "calibStale", "bandNoR", "breakLogged"]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DTW;
  if (root) {
    root.DTW = DTW;
    try {
      DTW.selfTestResult = selfTest();
      if (!DTW.selfTestResult.pass && root.console) root.console.error("dtw-live selfTest failed", DTW.selfTestResult);
    } catch (e) { DTW.selfTestResult = { pass: false, error: String(e) }; }
  }
})(typeof window !== "undefined" ? window : null);

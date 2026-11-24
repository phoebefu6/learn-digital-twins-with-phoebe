"""Python reference for assets/dtw-live.js: same constants, same seeded draws, same arithmetic order.

Usage:
  python3 -I dtw_reference.py                         # print the canon ladder (seed 1124)
  python3 -I dtw_reference.py --compare FILE          # compare by VALUE with node's canon JSON
                                                      # (node materials/dtw_canon.js <repo> FILE)
  python3 -I dtw_reference.py --compare FILE --plant 0.001
                                                      # proves the comparator fails a 0.1% fault
Agreement rule: every integer and list of flagged floors identical; every real number within 1e-9
relative (or 1e-12 absolute near zero). Exit 1 on any disagreement.

Everything is synthetic: Kittiwake Hall, its floors, weather and sensors are constructed. By Phoebe Fu.
"""
import json, math, sys

M32 = 0xFFFFFFFF
Z95 = 1.959963984540054
W0 = dict(floors=6, days=14, sub=4,
          Ci=6.0, Cm=20.0, Rim=0.5, Rio=10.0, Rmo=4.0, endFloorLoss=1.3,
          kULo=1.15, kUHi=1.45, kCLo=0.70, kCHi=0.95,
          occKw=2.5, occLo=0.6, occHi=1.0, occAssumed=0.8,
          solarKw=3.0, tMean0=6.0, tWalkSd=1.5, tSwing=3.5,
          kp=4.0, qMax=20.0, sensorSd=0.4, procSd=0.12,
          dayOn=7, dayOff=19, tDay=21, tNight=19, tSetback=15,
          retrofitFloor=3, retrofitKU=0.6, burnInDays=3)
DEFAULTS = dict(seed=1124, sensorSdAssumed=0.4, qi=0.3, qm=0.05)


def to_i32(x):
    x &= M32
    return x - (1 << 32) if x & 0x80000000 else x


def imul(a, b):
    return to_i32(a * b)


def mulberry32(seed):
    st = [to_i32(seed)]

    def rnd():
        a = to_i32(st[0] + 0x6D2B79F5)
        st[0] = a
        t = imul(a ^ ((a & M32) >> 15), 1 | a)
        t = to_i32(to_i32(t + imul(t ^ ((t & M32) >> 7), 61 | t)) ^ t)
        return ((t ^ ((t & M32) >> 14)) & M32) / 4294967296.0
    return rnd


def normal(rnd):
    u1 = rnd(); u2 = rnd()
    return math.sqrt(-2 * math.log(1 - u1)) * math.cos(2 * math.pi * u2)


def occupied(day, h):
    return (day % 7) < 5 and 8 <= h < 18


def setpoint(day, h, setback):
    on = (day % 7) < 5 and W0["dayOn"] <= h < W0["dayOff"]
    return W0["tDay"] if on else (W0["tSetback"] if setback else W0["tNight"])


def heat(tset, tread):
    q = W0["kp"] * (tset - tread)
    return 0 if q < 0 else (W0["qMax"] if q > W0["qMax"] else q)


def params(f, kU, kC):
    end = W0["endFloorLoss"] if (f == 0 or f == W0["floors"] - 1) else 1
    return dict(Ci=W0["Ci"], Cm=W0["Cm"] * kC, Rim=W0["Rim"], Rio=W0["Rio"] / (kU * end), Rmo=W0["Rmo"] / (kU * end))


def step(p, x, to, q):
    dt = 1 / W0["sub"]; ti, tm = x[0], x[1]
    for _ in range(W0["sub"]):
        dti = ((tm - ti) / p["Rim"] + (to - ti) / p["Rio"] + q) / p["Ci"]
        dtm = ((ti - tm) / p["Rim"] + (to - tm) / p["Rmo"]) / p["Cm"]
        ti += dt * dti; tm += dt * dtm
    return [ti, tm]


def world(seed, brk=False, no_setback=False):
    rnd = mulberry32(seed); F = W0["floors"]; D = W0["days"]; B = W0["burnInDays"]
    kU, kC = [], []
    for f in range(F):
        kU.append(W0["kULo"] + (W0["kUHi"] - W0["kULo"]) * rnd())
        kC.append(W0["kCLo"] + (W0["kCHi"] - W0["kCLo"]) * rnd())
    tMean, cloud, occ, m = [], [], [], W0["tMean0"]
    for d in range(-B, D + 1):
        m += W0["tWalkSd"] * normal(rnd); tMean.append(m); cloud.append(0.2 + 0.8 * rnd())
    for d in range(-B, D + 1):
        occ.append([W0["occLo"] + (W0["occHi"] - W0["occLo"]) * rnd() for _ in range(F)])
    T = (D + B) * 24 + 1
    to, sol, occT = [], [], []
    for i in range(T):
        d = i // 24 - B; h = i % 24
        to.append(tMean[d + B] + W0["tSwing"] * math.sin(2 * math.pi * (h - 9) / 24))
        sol.append(W0["solarKw"] * cloud[d + B] * math.sin(math.pi * (h - 7) / 10) if 7 <= h < 17 else 0)
        occT.append([W0["occKw"] * occ[d + B][f] if occupied(d, h) else 0 for f in range(F)])
    x = [[W0["tNight"], W0["tNight"]] for _ in range(F)]
    truth = [[] for _ in range(F)]; meas = [[] for _ in range(F)]; qlog = [[] for _ in range(F)]
    start = B * 24
    for i in range(T):
        d = i // 24 - B; h = i % 24
        setback = d >= 7 and not no_setback
        for f in range(F):
            y = x[f][0] + W0["sensorSd"] * normal(rnd)
            if i >= start:
                truth[f].append(x[f][0]); meas[f].append(y)
            if i == T - 1:
                continue
            q = heat(setpoint(d, h, setback), y)
            if i >= start:
                qlog[f].append(q)
            ku = kU[f]
            if brk and f == W0["retrofitFloor"] and d >= 7:
                ku = ku * W0["retrofitKU"]
            x[f] = step(params(f, ku, kC[f]), x[f], to[i], q + sol[i] + occT[i][f])
            x[f][0] += W0["procSd"] * normal(rnd)
    toW = to[start:]; solW = sol[start:]
    occN = [W0["occKw"] * W0["occAssumed"] if occupied(i // 24, i % 24) else 0 for i in range(len(toW))]
    return dict(kU=kU, kC=kC, to=toW, sol=solW, occN=occN, truth=truth, meas=meas, qlog=qlog, n=D * 24 + 1)


def open_loop(W, f, p, n):
    x = [W["meas"][f][0], W["meas"][f][0]]; out = [x[0]]; xs = [x[:]]
    for i in range(n - 1):
        x = step(p, x, W["to"][i], W["qlog"][f][i] + W["sol"][i] + W["occN"][i])
        out.append(x[0]); xs.append(x[:])
    return dict(ti=out, x=xs)


def rmse(a, b, lo, hi):
    s = 0; n = 0
    for i in range(lo, hi):
        e = a[i] - b[i]; s += e * e; n += 1
    return math.sqrt(s / n)


def calibrate(W, f):
    best = dict(kU=1, kC=1, rmse=float("inf"))

    def try_one(ku, kc):
        r = rmse(open_loop(W, f, params(f, ku, kc), 169)["ti"], W["meas"][f], 24, 169)
        if r < best["rmse"]:
            best.update(kU=ku, kC=kc, rmse=r)
    for a in range(16):
        for b in range(13):
            try_one(0.5 + 0.1 * a, 0.4 + 0.1 * b)
    cu, cc = best["kU"], best["kC"]
    for a in range(-5, 6):
        for b in range(-5, 6):
            try_one(cu + 0.02 * a, cc + 0.02 * b)
    return dict(best)


def linear(p):
    z = step(p, [0, 0], 0, 0); c1 = step(p, [1, 0], 0, 0); c2 = step(p, [0, 1], 0, 0)
    bq = step(p, [0, 0], 0, 1)
    return dict(A=[[c1[0] - z[0], c2[0] - z[0]], [c1[1] - z[1], c2[1] - z[1]]], bq=bq)


def mm(A, B):
    return [[A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
            [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]]


def tr(A):
    return [[A[0][0], A[1][0]], [A[0][1], A[1][1]]]


def propagate(A, P, Q):
    M = mm(mm(A, P), tr(A))
    return [[M[0][0] + Q[0][0], M[0][1] + Q[0][1]], [M[1][0] + Q[1][0], M[1][1] + Q[1][1]]]


def update(x, P, y, r):
    S = P[0][0] + r; K = [P[0][0] / S, P[1][0] / S]; v = y - x[0]
    xn = [x[0] + 1 * K[0] * v, x[1] + 1 * K[1] * v]
    Pn = [[(1 - K[0]) * P[0][0], (1 - K[0]) * P[0][1]], [P[1][0] - K[1] * P[0][0], P[1][1] - K[1] * P[0][1]]]
    return xn, Pn, K, v


def kalman(W, f, p, o):
    r = o["sensorSdAssumed"] * o["sensorSdAssumed"]; Q = [[o["qi"] * o["qi"], 0], [0, o["qm"] * o["qm"]]]
    x = [W["meas"][f][0], W["meas"][f][0]]; P = [[r, 0], [0, 1.0]]
    post = [x[0]]; xs = [x[:]]; Ps = [P]; innov = [0]; gain = [0]
    L = linear(p)
    for i in range(W["n"] - 1):
        x = step(p, x, W["to"][i], W["qlog"][f][i] + W["sol"][i] + W["occN"][i])
        P = propagate(L["A"], P, Q)
        x, P, K, v = update(x, P, W["meas"][f][i + 1], r)
        post.append(x[0]); xs.append(x[:]); Ps.append(P); innov.append(v); gain.append(K[0])
    return dict(ti=post, x=xs, P=Ps, innov=innov, gain=gain)


def what_if(W, f, p, xs, Ps, o):
    r = o["sensorSdAssumed"] * o["sensorSdAssumed"]; Q = [[o["qi"] * o["qi"], 0], [0, o["qm"] * o["qm"]]]; L = linear(p)
    in_band = 0; n_band = 0; width = 0
    for d in range(7, 14):
        t0 = d * 24; x = xs[t0][:]; P = Ps[t0] if Ps else None
        for k in range(24):
            i = t0 + k; h = k
            q = heat(setpoint(d, h, True), x[0])
            x = step(p, x, W["to"][i], q + W["sol"][i] + W["occN"][i])
            if P is not None:
                A = L["A"]; Qe = Q
                if 0 < q < W0["qMax"]:
                    A = [[A[0][0] - L["bq"][0] * W0["kp"], A[0][1]], [A[1][0] - L["bq"][1] * W0["kp"], A[1][1]]]
                    g0 = L["bq"][0] * W0["kp"]; g1 = L["bq"][1] * W0["kp"]
                    Qe = [[Q[0][0] + g0 * g0 * r, g0 * g1 * r], [g0 * g1 * r, Q[1][1] + g1 * g1 * r]]
                P = propagate(A, P, Qe)
                sd = math.sqrt(P[0][0] + r); y = W["meas"][f][i + 1]
                if abs(y - x[0]) <= Z95 * sd:
                    in_band += 1
                n_band += 1; width += 2 * Z95 * sd
    e_true = 0
    for j in range(168, 336):
        e_true += W["qlog"][f][j]
    return dict(eTrue=e_true, inBand=in_band, nBand=n_band, width=(width / n_band if n_band else None))


def plan(W, p, x0, setback):
    x = x0[:]; e = 0
    for i in range(168, 336):
        d = i // 24; h = i % 24; q = heat(setpoint(d, h, setback), x[0])
        e += q
        x = step(p, x, W["to"][i], q + W["sol"][i] + W["occN"][i])
    return e


def shift(innov):
    def ms(lo, hi):
        s = 0; n = 0
        for i in range(lo, hi):
            s += innov[i]; n += 1
        m = s / n; v = 0
        for i in range(lo, hi):
            v += (innov[i] - m) * (innov[i] - m)
        return m, v / (n - 1), n
    am, av, an = ms(25, 168); bm, bv, bn = ms(168, 337)
    return dict(w1=am, w2=bm, z=(bm - am) / math.sqrt(av / an + bv / bn))


def run_rung(rid, W, o, cal, label_id=None):
    F = W0["floors"]; res = dict(id=label_id or rid, floors=[])
    sT = 0; nT = 0; E = 0; Et = 0; inB = 0; nB = 0; wid = 0; Eb = 0
    for f in range(F):
        p = params(f, 1, 1) if rid == "design" else params(f, cal[f]["kU"], cal[f]["kC"])
        Ps = None
        if rid == "kalman":
            run = kalman(W, f, p, o); Ps = run["P"]
        else:
            run = open_loop(W, f, p, W["n"])
        wi = what_if(W, f, p, run["x"], Ps, o)
        es = plan(W, p, run["x"][168], True); eb = plan(W, p, run["x"][168], False)
        row = dict(rmse=rmse(run["ti"], W["truth"][f], 168, W["n"]), eErr=(es - wi["eTrue"]) / wi["eTrue"])
        if rid == "kalman":
            sh = shift(run["innov"])
            g = 0
            for j in range(168, W["n"]):
                g += run["gain"][j]
            row.update(cover=wi["inBand"] / wi["nBand"], width=wi["width"], gain=g / (W["n"] - 168), z=sh["z"], w1=sh["w1"], w2=sh["w2"])
            inB += wi["inBand"]; nB += wi["nBand"]; wid += wi["width"]
        res["floors"].append(row)
        for t in range(168, W["n"]):
            e = run["ti"][t] - W["truth"][f][t]; sT += e * e; nT += 1
        E += es; Et += wi["eTrue"]; Eb += eb
    res.update(rmse=math.sqrt(sT / nT), energy=E, eTrue=Et, eErr=(E - Et) / Et, eBase=Eb, saving=(Eb - E) / Eb)
    if rid == "kalman":
        res.update(cover=inB / nB, width=wid / F, flagged=[i for i, r in enumerate(res["floors"]) if abs(r["z"]) > 4])
    return res


def sensor_rmse(W):
    s = 0; n = 0
    for f in range(W0["floors"]):
        for t in range(168, W["n"]):
            e = W["meas"][f][t] - W["truth"][f][t]; s += e * e; n += 1
    return math.sqrt(s / n)


def ladder_and_custom(seed):
    o = dict(DEFAULTS, seed=seed)
    W = world(seed); WB = world(seed, brk=True); WN = world(seed, no_setback=True)
    cal = [calibrate(W, f) for f in range(W0["floors"])]
    rungs = [run_rung(r, W, o, cal) for r in ("design", "calib", "kalman")]
    anti = run_rung("kalman", W, dict(o, sensorSdAssumed=0.01), cal, "anti")
    brk = run_rung("kalman", WB, o, cal, "break")
    eBase = 0; eSet = 0
    for f in range(W0["floors"]):
        for j in range(168, 336):
            eBase += WN["qlog"][f][j]; eSet += W["qlog"][f][j]
    custom = {}
    for sd in (0.4, 0.2, 0.1, 0.01):
        for b in (False, True):
            key = ("%g" % sd) + "_" + ("break" if b else "clean")
            custom[key] = run_rung("kalman", WB if b else W, dict(o, sensorSdAssumed=sd), cal, "custom")
    return dict(truthK=dict(kU=W["kU"], kC=W["kC"]), cal=cal, sensorRmse=sensor_rmse(W),
                trueSaving=dict(base=eBase, setback=eSet, saving=(eBase - eSet) / eBase),
                rungs=rungs, anti=anti, brk=brk, custom=custom)


def compare(a, b, path, bad, plant):
    if isinstance(a, dict):
        for k in a:
            if k not in b:
                bad.append(path + "/" + k + " missing in node")
            else:
                compare(a[k], b[k], path + "/" + k, bad, plant)
    elif isinstance(a, list):
        if len(a) != len(b):
            bad.append(path + " length")
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, path + "[%d]" % i, bad, plant)
    elif isinstance(a, bool) or isinstance(a, str):
        if a != b:
            bad.append(path)
    elif isinstance(a, int) and isinstance(b, int):
        if a != b:
            bad.append("%s %s != %s" % (path, a, b))
    else:
        x = float(a) * (1 + plant); y = float(b)
        if abs(x - y) > max(1e-12, 1e-9 * max(abs(x), abs(y))):
            bad.append("%s %r != %r" % (path, x, y))
    return bad


def count(a):
    if isinstance(a, dict):
        return sum(count(v) for v in a.values())
    if isinstance(a, list):
        return sum(count(v) for v in a)
    return 1


def main(argv):
    if "--compare" in argv:
        f = argv[argv.index("--compare") + 1]
        plant = float(argv[argv.index("--plant") + 1]) if "--plant" in argv else 0.0
        node = json.load(open(f))
        py = {str(s): ladder_and_custom(s) for s in (1124, 1, 7, 42)}
        bad = compare(py, node["settings"], "settings", [], plant)
        if bad:
            print("DISAGREE: %d values" % len(bad))
            for b in bad[:12]:
                print("  " + b)
            return 1
        print("AGREE: every setting (4 seeds, ladder + anti-lever + break + 8 custom runs each) matches node, %d values" % count(py))
        return 0
    L = ladder_and_custom(1124)
    print("truth kU " + " ".join("%.3f" % v for v in L["truthK"]["kU"]))
    print("calib kU " + " ".join("%.2f" % c["kU"] for c in L["cal"]) + "   kC " + " ".join("%.2f" % c["kC"] for c in L["cal"]))
    print("sensors alone: RMSE %.3f C" % L["sensorRmse"])
    for r in L["rungs"] + [L["anti"], L["brk"]]:
        extra = ""
        if "cover" in r:
            extra = " cover %.1f%% width %.2f C flagged %s" % (100 * r["cover"], r["width"], r["flagged"])
        print("%-7s RMSE %.3f C  energy %.0f vs %.0f kWh (%+.1f%%)  saving %.1f%%%s" % (
            r["id"], r["rmse"], r["energy"], r["eTrue"], 100 * r["eErr"], 100 * r["saving"], extra))
    ts = L["trueSaving"]
    print("true setback saving %.1f%% (%.0f -> %.0f kWh)" % (100 * ts["saving"], ts["base"], ts["setback"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

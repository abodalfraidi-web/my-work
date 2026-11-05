#!/usr/bin/env python3
"""Japanese candlestick + technical analysis for Tadawul stocks.

Usage:
  python3 chart.py 2223            # daily candles, last ~1 year
  python3 chart.py 2223 --weekly   # weekly candles, last ~3 years
  python3 chart.py 2223 --json
Data: Yahoo Finance daily OHLCV (unofficial, delayed). Standard library only.
"""
import json
import sys
import time
import urllib.request

UA = "Mozilla/5.0 (saudi-analyst skill)"
URL = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=%s"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["chart"]["result"][0]


def day(ts):
    return time.strftime("%Y-%m-%d", time.gmtime(ts + 3 * 3600))  # Riyadh, UTC+3


def fetch(sym, weekly):
    res = get(URL % (sym, "3y" if weekly else "1y", "1d"))
    q, meta = res["indicators"]["quote"][0], res["meta"]
    bars = []
    for i, ts in enumerate(res["timestamp"]):
        o, h, l, c, v = (q[k][i] for k in ("open", "high", "low", "close", "volume"))
        if None in (o, h, l, c):
            continue
        bars.append({"date": day(ts), "o": o, "h": h, "l": l, "c": c, "v": v or 0})
    # Yahoo's daily series often lags a day: rebuild today's candle from intraday + meta.
    today = day(meta["regularMarketTime"])
    if bars and bars[-1]["date"] < today:
        try:
            intra = get(URL % (sym, "1d", "5m"))
            opens = [x for x in intra["indicators"]["quote"][0]["open"] if x]
            if opens and day(intra["timestamp"][0]) == today:
                bars.append({"date": today, "o": opens[0], "h": meta["regularMarketDayHigh"],
                             "l": meta["regularMarketDayLow"], "c": meta["regularMarketPrice"],
                             "v": meta.get("regularMarketVolume") or 0})
        except Exception:
            pass
    if weekly:
        bars = to_saudi_weeks(bars)
    return bars, meta


def to_saudi_weeks(bars):
    """Tadawul trades Sunday-Thursday: group daily bars into Sun-Thu weeks."""
    import datetime as dt
    weeks = {}
    for b in bars:
        d = dt.date.fromisoformat(b["date"])
        key = (d - dt.timedelta(days=(d.weekday() + 1) % 7)).isoformat()
        w = weeks.get(key)
        if w is None:
            weeks[key] = dict(b, date=key)
        else:
            w["h"], w["l"] = max(w["h"], b["h"]), min(w["l"], b["l"])
            w["c"], w["v"] = b["c"], w["v"] + b["v"]
    return [weeks[k] for k in sorted(weeks)]


# ---------- indicators ----------
def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def ema_series(xs, n):
    k, out, e = 2 / (n + 1), [], None
    for x in xs:
        e = x if e is None else x * k + e * (1 - k)
        out.append(e)
    return out


def rsi(closes, n=14):
    if len(closes) <= n:
        return None
    gains = [max(b - a, 0) for a, b in zip(closes, closes[1:])]
    losses = [max(a - b, 0) for a, b in zip(closes, closes[1:])]
    ag, al = sum(gains[:n]) / n, sum(losses[:n]) / n
    for g, l in zip(gains[n:], losses[n:]):
        ag, al = (ag * (n - 1) + g) / n, (al * (n - 1) + l) / n
    return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)


def atr(bars, n=14):
    trs = [max(b["h"] - b["l"], abs(b["h"] - a["c"]), abs(b["l"] - a["c"]))
           for a, b in zip(bars, bars[1:])]
    return sum(trs[-n:]) / n if len(trs) >= n else None


def macd(closes):
    if len(closes) < 35:
        return None
    line = [a - b for a, b in zip(ema_series(closes, 12), ema_series(closes, 26))]
    sig = ema_series(line, 9)
    return {"macd": line[-1], "signal": sig[-1], "hist": line[-1] - sig[-1],
            "hist_prev": line[-2] - sig[-2]}


def swings(bars, k=3):
    """Pivot highs/lows: a bar higher/lower than k bars each side."""
    hi, lo = [], []
    for i in range(k, len(bars) - k):
        win = bars[i - k:i + k + 1]
        if bars[i]["h"] == max(b["h"] for b in win):
            hi.append((bars[i]["date"], bars[i]["h"]))
        if bars[i]["l"] == min(b["l"] for b in win):
            lo.append((bars[i]["date"], bars[i]["l"]))
    return hi, lo


def levels(bars, price, a):
    hi, lo = swings(bars)
    tol = (a or price * 0.02) * 0.6
    def cluster(pts):
        out = []
        for _, p in sorted(pts, key=lambda x: x[1]):
            if out and abs(p - out[-1][0]) <= tol:
                c, n = out[-1]
                out[-1] = ((c * n + p) / (n + 1), n + 1)
            else:
                out.append((p, 1))
        return out
    allp = cluster(hi + lo)
    res = sorted([x for x in allp if x[0] > price], key=lambda x: x[0])[:3]
    sup = sorted([x for x in allp if x[0] < price], key=lambda x: -x[0])[:3]
    return ([{"level": round(p, 2), "touches": n} for p, n in sup],
            [{"level": round(p, 2), "touches": n} for p, n in res])


# ---------- candlestick patterns ----------
def anatomy(b):
    rng = max(b["h"] - b["l"], 1e-9)
    body = abs(b["c"] - b["o"])
    return {"rng": rng, "body": body, "up": b["h"] - max(b["o"], b["c"]),
            "low": min(b["o"], b["c"]) - b["l"], "bull": b["c"] > b["o"],
            "bear": b["c"] < b["o"], "mid": (b["o"] + b["c"]) / 2}


def trend_before(bars, i, n=5):
    if i < n:
        return 0
    ch = bars[i - 1]["c"] / bars[i - n]["c"] - 1
    return 1 if ch > 0.02 else -1 if ch < -0.02 else 0


def patterns(bars, lookback=10, avg_body=None):
    """Classic Nison patterns on the last `lookback` bars, with trend context."""
    found = []
    start = max(2, len(bars) - lookback)
    for i in range(start, len(bars)):
        b, p, pp = bars[i], bars[i - 1], bars[i - 2]
        A, P, PP = anatomy(b), anatomy(p), anatomy(pp)
        t = trend_before(bars, i)
        big = lambda x: avg_body and x["body"] > avg_body * 1.2
        small = lambda x: x["body"] <= x["rng"] * 0.3
        add = lambda name, bias, ar: found.append(
            {"date": b["date"], "pattern": name, "bias": bias, "ar": ar,
             "in_trend": t})

        if A["body"] <= A["rng"] * 0.1:
            if A["up"] > A["rng"] * 0.6:
                add("Gravestone doji", "bearish" if t >= 0 else "neutral", "دوجي شاهد القبر")
            elif A["low"] > A["rng"] * 0.6:
                add("Dragonfly doji", "bullish" if t <= 0 else "neutral", "دوجي اليعسوب")
            else:
                add("Doji", "indecision", "دوجي (تردد)")
        elif A["low"] >= 2 * A["body"] and A["up"] <= A["body"] * 0.5:
            if t < 0:
                add("Hammer", "bullish", "المطرقة")
            elif t > 0:
                add("Hanging man", "bearish", "الرجل المشنوق")
        elif A["up"] >= 2 * A["body"] and A["low"] <= A["body"] * 0.5:
            if t > 0:
                add("Shooting star", "bearish", "الشهاب")
            elif t < 0:
                add("Inverted hammer", "bullish", "المطرقة المقلوبة")
        if A["body"] >= A["rng"] * 0.9 and big(A):
            add("Marubozu " + ("bull" if A["bull"] else "bear"),
                "bullish" if A["bull"] else "bearish",
                "ماروبوزو " + ("صاعد" if A["bull"] else "هابط"))

        # two-bar
        if A["bull"] and P["bear"] and b["c"] >= p["o"] and b["o"] <= p["c"] and A["body"] > P["body"]:
            add("Bullish engulfing", "bullish", "الابتلاع الشرائي")
        if A["bear"] and P["bull"] and b["o"] >= p["c"] and b["c"] <= p["o"] and A["body"] > P["body"]:
            add("Bearish engulfing", "bearish", "الابتلاع البيعي")
        if P["body"] > 0 and A["body"] < P["body"] * 0.5 and \
                max(b["o"], b["c"]) <= max(p["o"], p["c"]) and min(b["o"], b["c"]) >= min(p["o"], p["c"]):
            add("Harami", "bullish" if P["bear"] and t < 0 else "bearish" if P["bull"] and t > 0 else "indecision",
                "الحرامي (الحامل)")
        if P["bear"] and A["bull"] and b["o"] < p["l"] and b["c"] > P["mid"] and b["c"] < p["o"]:
            add("Piercing line", "bullish", "الخط الثاقب")
        if P["bull"] and A["bear"] and b["o"] > p["h"] and b["c"] < P["mid"] and b["c"] > p["o"]:
            add("Dark cloud cover", "bearish", "الغيمة السوداء")
        if abs(b["l"] - p["l"]) <= A["rng"] * 0.05 and P["bear"] and A["bull"] and t < 0:
            add("Tweezer bottom", "bullish", "قاع الملقط")
        if abs(b["h"] - p["h"]) <= A["rng"] * 0.05 and P["bull"] and A["bear"] and t > 0:
            add("Tweezer top", "bearish", "قمة الملقط")

        # three-bar
        if PP["bear"] and big(PP) and small(P) and A["bull"] and b["c"] > PP["mid"]:
            add("Morning star", "bullish", "نجمة الصباح")
        if PP["bull"] and big(PP) and small(P) and A["bear"] and b["c"] < PP["mid"]:
            add("Evening star", "bearish", "نجمة المساء")
        if all(x["bull"] for x in (PP, P, A)) and pp["c"] < p["c"] < b["c"] and \
                all(x["body"] > x["rng"] * 0.5 for x in (PP, P, A)):
            add("Three white soldiers", "bullish", "الجنود الثلاثة البيض")
        if all(x["bear"] for x in (PP, P, A)) and pp["c"] > p["c"] > b["c"] and \
                all(x["body"] > x["rng"] * 0.5 for x in (PP, P, A)):
            add("Three black crows", "bearish", "الغربان الثلاثة السود")
    bullish_rev = {"Bullish engulfing", "Piercing line", "Morning star", "Harami"}
    bearish_rev = {"Bearish engulfing", "Dark cloud cover", "Evening star"}
    return [p for p in found
            if not (p["pattern"] in bullish_rev and p["bias"] == "bullish" and p["in_trend"] >= 0)
            and not (p["pattern"] in bearish_rev and p["in_trend"] <= 0)]


def analyse(code, weekly=False):
    sym = code if "." in code else code + ".SR"
    bars, meta = fetch(sym, weekly)
    closes = [b["c"] for b in bars]
    vols = [b["v"] for b in bars]
    price = closes[-1]
    a = atr(bars)
    bodies = [abs(b["c"] - b["o"]) for b in bars[-30:]]
    sup, res = levels(bars[-130:] if not weekly else bars, price, a)
    m = macd(closes)
    s20, s50, s200 = sma(closes, 20), sma(closes, 50), sma(closes, 200)
    trend = None
    if s50 and s200:
        trend = "up" if price > s50 > s200 else "down" if price < s50 < s200 else "mixed"
    last = bars[-6:]
    return {
        "symbol": sym, "timeframe": "weekly" if weekly else "daily",
        "as_of": bars[-1]["date"] + (" (week starting)" if weekly else ""), "price": price,
        "sma20": s20, "sma50": s50, "sma200": s200, "trend": trend,
        "rsi14": rsi(closes), "macd": m, "atr14": a,
        "atr_pct": a / price * 100 if a else None,
        "volume_vs_20d": vols[-1] / (sum(vols[-21:-1]) / 20) if len(vols) > 21 and sum(vols[-21:-1]) else None,
        "change_5": (price / closes[-6] - 1) * 100 if len(closes) > 5 else None,
        "change_20": (price / closes[-21] - 1) * 100 if len(closes) > 20 else None,
        "high_period": max(b["h"] for b in bars), "low_period": min(b["l"] for b in bars),
        "support": sup, "resistance": res,
        "patterns": patterns(bars, 10, sum(bodies) / len(bodies)),
        "last_candles": last,
    }


def f(v, d=2):
    return "—" if v is None else ("%." + str(d) + "f") % v


def report(r):
    print("## %s %s candles, as of %s" % (r["symbol"], r["timeframe"], r["as_of"]))
    print("price %s | SMA20 %s | SMA50 %s | SMA200 %s | trend: %s" % (
        f(r["price"]), f(r["sma20"]), f(r["sma50"]), f(r["sma200"]), r["trend"]))
    m = r["macd"] or {}
    print("RSI14 %s | MACD %s signal %s hist %s (prev %s) | ATR14 %s (%s%%)" % (
        f(r["rsi14"], 1), f(m.get("macd")), f(m.get("signal")), f(m.get("hist")),
        f(m.get("hist_prev")), f(r["atr14"]), f(r["atr_pct"], 1)))
    print("change 5 bars %s%% | 20 bars %s%% | last volume vs 20-bar avg x%s | range %s–%s" % (
        f(r["change_5"], 1), f(r["change_20"], 1), f(r["volume_vs_20d"]),
        f(r["low_period"]), f(r["high_period"])))
    print("support:", ", ".join("%s (x%d)" % (s["level"], s["touches"]) for s in r["support"]) or "—")
    print("resistance:", ", ".join("%s (x%d)" % (s["level"], s["touches"]) for s in r["resistance"]) or "—")
    print("last candles (date O H L C vol):")
    for b in r["last_candles"]:
        print("  %s %s %s %s %s %d" % (b["date"], f(b["o"]), f(b["h"]), f(b["l"]), f(b["c"]), b["v"]))
    print("patterns in last 10 bars:")
    for p in r["patterns"] or [{"date": "", "pattern": "none", "ar": "لا يوجد", "bias": "", "in_trend": 0}]:
        print("  %s %s / %s -> %s (prior trend %+d)" % (p["date"], p["pattern"], p["ar"], p["bias"], p["in_trend"]))


if __name__ == "__main__":
    args = sys.argv[1:]
    codes = [a for a in args if not a.startswith("--")]
    if not codes:
        raise SystemExit(__doc__)
    out = [analyse(c, "--weekly" in args) for c in codes]
    if "--json" in args:
        json.dump(out, sys.stdout, indent=1)
    else:
        for r in out:
            report(r)
            print()

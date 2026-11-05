#!/usr/bin/env python3
"""Saudi stock analyst: price + reported financials for Tadawul stocks.

Data: Yahoo Finance public endpoints (unofficial, delayed, may miss quarters).
Usage:
  python3 saudi.py 2222              # one company
  python3 saudi.py 2222 1120 7010    # several, plus a comparison table
  python3 saudi.py 2222 --json       # machine-readable output
Codes are Tadawul numbers; ".SR" is added automatically.
No third-party packages. Python 3.8+.
"""
import json
import sys
import time
import urllib.error
import urllib.request

UA = "Mozilla/5.0 (saudi-analyst skill)"
CHART = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1y&interval=1d"
SERIES = ("https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/"
          "timeseries/%s?type=%s&period1=1500000000&period2=%d")
FIELDS = ["TotalRevenue", "GrossProfit", "OperatingIncome", "NetIncome",
          "DilutedEPS", "StockholdersEquity", "TotalDebt", "CashDividendsPaid"]

NAMES = {
    "2222": "أرامكو السعودية", "1120": "مصرف الراجحي", "1180": "البنك الأهلي السعودي",
    "2010": "سابك", "7010": "إس تي سي", "1211": "معادن", "2280": "المراعي",
    "1150": "مصرف الإنماء", "4190": "جرير", "2082": "أكوا باور",
    "1010": "بنك الرياض", "4013": "د. سليمان الحبيب",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 2:
                raise SystemExit("fetch failed: %s (%s)" % (url, exc))
            time.sleep(2 ** attempt)


def symbol(code):
    code = code.strip().upper()
    return code if "." in code else code + ".SR"


def price(sym):
    res = get(CHART % sym)["chart"]["result"][0]
    m = res["meta"]
    closes = [c for c in res["indicators"]["quote"][0]["close"] if c is not None]
    return {
        "name": m.get("longName") or m.get("shortName"),
        "currency": m.get("currency"),
        "price": m.get("regularMarketPrice"),
        "change_pct": m.get("regularMarketChangePercent"),
        "high_52w": m.get("fiftyTwoWeekHigh"),
        "low_52w": m.get("fiftyTwoWeekLow"),
        "return_1y_pct": (closes[-1] / closes[0] - 1) * 100 if len(closes) > 1 else None,
        "as_of": time.strftime("%Y-%m-%d %H:%M", time.gmtime(m.get("regularMarketTime", 0) + 3 * 3600)),
    }


def series(sym):
    types = ",".join(p + f for p in ("quarterly", "annual") for f in FIELDS)
    data = get(SERIES % (sym, types, int(time.time())))
    out = {"quarterly": {}, "annual": {}}
    for r in data["timeseries"]["result"]:
        t = r["meta"]["type"][0]
        period = "quarterly" if t.startswith("quarterly") else "annual"
        field = t[len(period):]
        for x in r.get(t) or []:
            if x and x.get("reportedValue"):
                out[period].setdefault(x["asOfDate"], {})[field] = x["reportedValue"]["raw"]
    return out


def pct(a, b):
    if a is None or b in (None, 0):
        return None
    return (a / b - 1) * 100 if b > 0 else None


def margin(row, f):
    r = row.get("TotalRevenue")
    return row[f] / r * 100 if r and row.get(f) is not None else None


def analyse(code):
    sym = symbol(code)
    p = price(sym)
    s = series(sym)
    q = s["quarterly"]
    dates = sorted(q)
    quarters = []
    for d in dates:
        row = q[d]
        y, rest = d[:4], d[4:]
        prev = q.get(str(int(y) - 1) + rest, {})
        quarters.append({
            "date": d,
            "revenue": row.get("TotalRevenue"),
            "net_income": row.get("NetIncome"),
            "eps": row.get("DilutedEPS"),
            "gross_margin": margin(row, "GrossProfit"),
            "operating_margin": margin(row, "OperatingIncome"),
            "net_margin": margin(row, "NetIncome"),
            "revenue_yoy": pct(row.get("TotalRevenue"), prev.get("TotalRevenue")),
            "net_income_yoy": pct(row.get("NetIncome"), prev.get("NetIncome")),
        })
    # TTM only if the last 4 quarters are consecutive (Yahoo sometimes skips one).
    ttm = None
    if len(dates) >= 4:
        last4 = dates[-4:]
        months = [int(d[:4]) * 12 + int(d[5:7]) for d in last4]
        keys = ("TotalRevenue", "NetIncome", "DilutedEPS")
        if all(b - a == 3 for a, b in zip(months, months[1:])) and \
                all(q[d].get(f) is not None for d in last4 for f in keys):
            ttm = {f: sum(q[d][f] for d in last4) for f in keys}
            ttm["period_end"] = last4[-1]
    annual = [dict(date=d, **s["annual"][d]) for d in sorted(s["annual"])]
    eps_ttm = ttm["DilutedEPS"] if ttm else None
    last_annual = annual[-1] if annual else {}
    equity = (q[dates[-1]].get("StockholdersEquity") if dates else None) or last_annual.get("StockholdersEquity")
    debt = (q[dates[-1]].get("TotalDebt") if dates else None) or last_annual.get("TotalDebt")
    return {
        "code": code, "symbol": sym, "arabic_name": NAMES.get(code.split(".")[0]),
        "price": p, "quarters": quarters[-8:], "ttm": ttm, "annual": annual[-4:],
        "pe_ttm": p["price"] / eps_ttm if eps_ttm and eps_ttm > 0 and p["price"] else None,
        "pe_last_year": p["price"] / last_annual["DilutedEPS"]
            if last_annual.get("DilutedEPS") and last_annual["DilutedEPS"] > 0 and p["price"] else None,
        "debt_to_equity": debt / equity if debt is not None and equity else None,
        "missing_quarter_note": None if ttm or len(dates) < 4 else
            "last 4 quarters incomplete in source; TTM P/E skipped (see P/E last year)",
    }


def n(v, kind="num"):
    if v is None:
        return "—"
    if kind == "pct":
        return "%+.1f%%" % v
    if kind == "m":
        return "%.1f%%" % v
    if abs(v) >= 1e9:
        return "%.2fB" % (v / 1e9)
    if abs(v) >= 1e6:
        return "%.1fM" % (v / 1e6)
    return "%.2f" % v


def report(a):
    p = a["price"]
    print("\n## %s %s (%s)" % (a["code"], a["arabic_name"] or "", p["name"]))
    print("price %s %s (%s today) as of %s Riyadh | 52w %s–%s | 1y %s" % (
        n(p["price"]), p["currency"], n(p["change_pct"], "pct"), p["as_of"],
        n(p["low_52w"]), n(p["high_52w"]), n(p["return_1y_pct"], "pct")))
    print("P/E TTM %s | P/E last full year %s | debt/equity %s" % (
        n(a["pe_ttm"]), n(a["pe_last_year"]), n(a["debt_to_equity"])))
    if a["missing_quarter_note"]:
        print("note:", a["missing_quarter_note"])
    print("| quarter | revenue | rev YoY | net income | NI YoY | EPS | gross m | op m | net m |")
    print("|---|---|---|---|---|---|---|---|---|")
    for x in a["quarters"]:
        print("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            x["date"], n(x["revenue"]), n(x["revenue_yoy"], "pct"), n(x["net_income"]),
            n(x["net_income_yoy"], "pct"), n(x["eps"]), n(x["gross_margin"], "m"),
            n(x["operating_margin"], "m"), n(x["net_margin"], "m")))
    if a["annual"]:
        print("annual:", "; ".join("%s rev %s NI %s EPS %s" % (
            r["date"][:4], n(r.get("TotalRevenue")), n(r.get("NetIncome")), n(r.get("DilutedEPS")))
            for r in a["annual"]))


def main(argv):
    as_json = "--json" in argv
    codes = [c for c in argv if not c.startswith("--")]
    if not codes:
        raise SystemExit(__doc__)
    results = []
    for c in codes:
        results.append(analyse(c))
        time.sleep(0.5)
    if as_json:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=1)
        return
    for a in results:
        report(a)
    if len(results) > 1:
        print("\n## comparison")
        print("| code | price | 1y | P/E | last rev YoY | last net margin | D/E |")
        print("|---|---|---|---|---|---|---|")
        for a in results:
            last = a["quarters"][-1] if a["quarters"] else {}
            print("| %s | %s | %s | %s | %s | %s | %s |" % (
                a["code"], n(a["price"]["price"]), n(a["price"]["return_1y_pct"], "pct"),
                n(a["pe_ttm"] or a["pe_last_year"]), n(last.get("revenue_yoy"), "pct"),
                n(last.get("net_margin"), "m"), n(a["debt_to_equity"])))
    print("\nsource: Yahoo Finance (unofficial, delayed). Verify on saudiexchange.sa / argaam.com.")


if __name__ == "__main__":
    main(sys.argv[1:])

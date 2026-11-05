#!/usr/bin/env python3
"""Read a company's public Argaam (argaam.com) pages: price block, latest
financial results with the company's stated reasons, key ratios, news and
dividends. Arabic text is printed as found.

Usage:
  python3 argaam.py 2223          # Tadawul code (needs an entry in argaam_ids.json)
  python3 argaam.py --id 4537     # Argaam company id directly
Argaam ids differ from Tadawul codes. To find one, web-search
"argaam.com companyoverview <company name>" and take the number after
/companyid/; then add it to argaam_ids.json.
Public pages only: paywalled articles show just the headline. Standard library only.
"""
import html
import json
import os
import re
import sys
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"
BASE = "https://www.argaam.com"
OVERVIEW = BASE + "/ar/company/companyoverview/marketid/3/companyid/%s"
IDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "argaam_ids.json")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "ignore")


def text(raw):
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", t.replace("﻿", "").replace("​", "")).strip()


def links(raw):
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', raw, flags=re.S):
        yield m.group(1), text(m.group(2))


def between(t, start, end, n=900):
    i = t.find(start)
    if i < 0:
        return None
    j = t.find(end, i + len(start)) if end else -1
    return t[i:j if 0 < j - i < n else i + n]


def overview(cid):
    url = OVERVIEW % cid
    raw = fetch(url)
    t = text(raw)
    out = {"url": url}
    out["price_block"] = between(t, "أداء السهم آخر سعر", "المزيد", 700)
    seen, results, news, reports = set(), [], [], []
    for href, label in links(raw):
        if not label or len(label) > 220 or (href, label) in seen:
            continue
        seen.add((href, label))
        full = href if href.startswith("http") else BASE + href
        if "/financial-reports/company-report/" in href:
            results.append({"title": label, "url": full})
        elif "/article/articledetail/" in href or "/reports/" in href:
            (reports if "أرقام - خاص" in label or "نظرة" in label or "توقعات" in label else news).append(
                {"title": label, "url": full})
    out["results"] = results[:4]
    out["articles"] = (reports + news)[:10]
    out["dividends"] = between(t, "أحدث التوزيعات النقدية", "المزيد", 400)
    out["upcoming"] = between(t, "إجراءات الشركة", "المزيد", 300) or None
    return out


def results_page(url):
    t = text(fetch(url))
    out = {"url": url}
    i = t.find("ملخص النتائج المالية")
    out["summary_tables"] = t[i:t.find("قالت الشركة", i)] if i >= 0 else None
    reasons = []
    for m in re.finditer(r"(قالت الشركة|أرجعت الشركة|عزت الشركة)[^:]*:", t):
        seg = t[m.start():m.start() + 900]
        cut = min([x for x in (seg.find("المقارنة"), seg.find("كما أرجعت", 10), seg.find("بينما عزت", 10),
                               seg.find("معلومات إضافية")) if x > 0] or [900])
        reasons.append(seg[:cut].strip())
    out["reasons"] = reasons
    q = t.find("المقارنة الربعية")
    out["quarter_tables"] = t[q:t.find("كما أرجعت", q)] if q >= 0 else None
    k = t.find("معلومات إضافية")
    out["extra"] = t[k:k + 500] if k >= 0 else None
    r = t.find("مكرر الربحية")
    if r < 0:
        r = t.find("(أخر 12 شهر)")
    out["ratios"] = t[max(0, r - 40):t.find("المزيد", r)] if r >= 0 else None
    return out


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    if argv[0] == "--id":
        cid = argv[1]
    else:
        ids = json.load(open(IDS, encoding="utf-8"))
        if argv[0] not in ids:
            raise SystemExit("no Argaam id for %s in argaam_ids.json; find it (see --help text) and add it"
                             % argv[0])
        cid = ids[argv[0]]["argaam_id"]
    ov = overview(cid)
    if ov["results"]:
        ov["latest_results"] = results_page(ov["results"][0]["url"])
    if "--json" in argv:
        json.dump(ov, sys.stdout, ensure_ascii=False, indent=1)
        return
    print("# Argaam:", ov["url"])
    print("\n## price block\n", ov["price_block"])
    print("\n## results")
    for r in ov["results"]:
        print("-", r["title"], "|", r["url"])
    lr = ov.get("latest_results")
    if lr:
        print("\n## latest results detail |", lr["url"])
        for k in ("summary_tables", "quarter_tables"):
            if lr[k]:
                print("\n[%s]\n%s" % (k, lr[k]))
        for x in lr["reasons"]:
            print("\n[reason]", x)
        if lr["extra"]:
            print("\n[extra]", lr["extra"])
        if lr["ratios"]:
            print("\n[ratios]", lr["ratios"])
    print("\n## articles (Argaam reports first; some are paywalled)")
    for a in ov["articles"]:
        print("-", a["title"], "|", a["url"])
    print("\n## dividends\n", ov["dividends"])
    print("\nsource: argaam.com (public pages)")


if __name__ == "__main__":
    main(sys.argv[1:])

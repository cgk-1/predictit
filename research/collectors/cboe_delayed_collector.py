#!/usr/bin/env python3
"""Prospective collector for Cboe's public delayed-quote JSON feeds.

Records REAL (15-minute delayed) SPX/SPY option chains and SPX 1-minute index bars
at a fixed cadence so the replay/validation harness has as-of data that never relies
on hindsight. Nothing here is simulated. Every file is named by the UTC time it was
received; the vendor's own generation timestamp is preserved inside the payload.

Usage:
  python3 cboe_delayed_collector.py --out DIR [--interval 60] [--until-utc 2026-11-06T21:30]

Output layout (all gzip JSON):
  DIR/YYYY-MM-DD/spx_intraday/<recv_utc>.json.gz    full 1-min SPX bars (small)
  DIR/YYYY-MM-DD/spx_chain_near/<recv_utc>.json.gz  SPX chain filtered to expiries <= 14d and |K/S-1| <= 5%
  DIR/YYYY-MM-DD/spy_chain_near/<recv_utc>.json.gz  SPY chain filtered likewise
  DIR/YYYY-MM-DD/spx_chain_full/<recv_utc>.json.gz  full SPX chain every --full-every seconds (default 900)

Terms: Cboe delayed data is published for personal, non-commercial use. Do not redistribute.
"""
import argparse, datetime as dt, gzip, json, os, re, sys, time, urllib.request

BASE = "https://cdn-api.cboe.com/api/global/delayed_quotes"
URLS = {
    "spx_chain": f"{BASE}/options/_SPX.json",
    "spy_chain": f"{BASE}/options/SPY.json",
    "spx_intraday": f"{BASE}/charts/intraday/_SPX.json",
}
OCC = re.compile(r"^([A-Z]+?)(\d{6})([CP])(\d{8})$")


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def filter_chain(payload, max_days=14, pct=0.05):
    data = payload["data"]
    spot = data.get("current_price") or 0
    today = dt.date.today()
    keep = []
    for o in data.get("options", []):
        m = OCC.match(o["option"])
        if not m:
            continue
        exp = dt.datetime.strptime(m.group(2), "%y%m%d").date()
        strike = int(m.group(4)) / 1000
        if (exp - today).days > max_days:
            continue
        if spot and abs(strike / spot - 1) > pct:
            continue
        keep.append(o)
    out = dict(payload)
    out["data"] = {k: v for k, v in data.items() if k != "options"}
    out["data"]["options"] = keep
    out["_filter"] = {"max_days": max_days, "pct": pct, "kept": len(keep), "total": len(data.get("options", []))}
    return out


def write_gz(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--interval", type=int, default=60)
    ap.add_argument("--full-every", type=int, default=900)
    ap.add_argument("--until-utc", default=None, help="ISO time (UTC) to stop, e.g. 2026-11-06T21:30")
    args = ap.parse_args()
    until = dt.datetime.fromisoformat(args.until_utc) if args.until_utc else None
    last_full = 0
    while True:
        now = dt.datetime.utcnow()
        if until and now >= until:
            print("done", now.isoformat(), flush=True)
            return
        recv = now.strftime("%Y%m%dT%H%M%SZ")
        day = now.strftime("%Y-%m-%d")
        t0 = time.time()
        for key, url in URLS.items():
            try:
                raw = fetch(url)
                payload = json.loads(raw)
                payload["_received_utc"] = now.isoformat() + "Z"
                payload["_source_url"] = url
                if key.endswith("_chain"):
                    write_gz(os.path.join(args.out, day, key + "_near", recv + ".json.gz"), filter_chain(payload))
                    if key == "spx_chain" and time.time() - last_full >= args.full_every:
                        write_gz(os.path.join(args.out, day, key + "_full", recv + ".json.gz"), payload)
                        last_full = time.time()
                else:
                    write_gz(os.path.join(args.out, day, key, recv + ".json.gz"), payload)
                print(recv, key, "ok", payload.get("timestamp"), flush=True)
            except Exception as e:  # keep going; record the failure
                print(recv, key, "ERROR", repr(e), flush=True)
        sleep_for = max(5, args.interval - (time.time() - t0))
        time.sleep(sleep_for)


if __name__ == "__main__":
    main()

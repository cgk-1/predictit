#!/usr/bin/env python3
"""Measure the gap between the last intraday SPX print and the official daily close (= SPXW PM settlement value).

Inputs: a Cboe intraday snapshot (gzip JSON from the collector, taken after 16:15 ET) and Cboe's daily SPX_History.csv.
Prints the 15:59 bar close, the final bar, and the official close for the date, plus the differences. Run daily and
append to research/results/settlement_gap.csv to build the prospective distribution used by `settlementNoisePts`.
Usage: python3 settlement_gap.py <spx_intraday_snapshot.json.gz> <SPX_History.csv> [--append research/results/settlement_gap.csv]
"""
import csv, datetime as dt, gzip, json, sys

def main():
    snap, hist = sys.argv[1], sys.argv[2]
    append = sys.argv[sys.argv.index("--append") + 1] if "--append" in sys.argv else None
    d = json.load(gzip.open(snap, "rt"))
    bars = d["data"]
    if not bars:
        print("no bars"); return
    date = bars[-1]["datetime"][:10]
    last = bars[-1]
    b1559 = next((b for b in reversed(bars) if b["datetime"].endswith("T15:59:00") or b["datetime"].endswith("T16:00:00")), None)
    closes = {}
    for r in csv.DictReader(open(hist)):
        closes[dt.datetime.strptime(r["DATE"], "%m/%d/%Y").date().isoformat()] = float(r["SPX"])
    official = closes.get(date)
    print(f"date {date}: final bar {last['datetime']} close {last['price']['close']}; 15:59/16:00 bar {b1559 and b1559['datetime']} close {b1559 and b1559['price']['close']}; official close {official}")
    if official is not None:
        gap_last = official - last["price"]["close"]
        gap_1559 = official - b1559["price"]["close"] if b1559 else None
        print(f"gap official − final bar: {gap_last:+.2f} pts; official − 15:59 bar: {gap_1559 if gap_1559 is None else f'{gap_1559:+.2f}'} pts")
        if append:
            with open(append, "a") as f:
                f.write(f"{date},{last['price']['close']},{b1559 and b1559['price']['close']},{official},{gap_last:.2f},{'' if gap_1559 is None else f'{gap_1559:.2f}'}\n")
    else:
        print("official close not yet in the CSV (published next day) — rerun tomorrow")

if __name__ == "__main__":
    main()

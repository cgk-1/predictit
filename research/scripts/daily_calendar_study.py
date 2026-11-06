#!/usr/bin/env python3
"""Daily-resolution calendar study on Cboe's free SPX daily-close history (close-to-close log returns).

This is an IN-SAMPLE descriptive study at the DAILY horizon; it is used only to seed low prior weights for
calendar indicators in the intraday ensemble. It is not evidence of an intraday edge after costs.
Usage: python3 daily_calendar_study.py research/data/SPX_History_cboe_2026-11-06.csv > research/results/daily_calendar_study.md
"""
import csv, datetime as dt, statistics as st, math, sys

def main(path):
    rows = []
    for r in csv.DictReader(open(path)):
        rows.append((dt.datetime.strptime(r["DATE"], "%m/%d/%Y").date(), float(r["SPX"])))
    rows.sort()
    rets = [(rows[i][0], math.log(rows[i][1] / rows[i - 1][1])) for i in range(1, len(rows))]
    out = ["# Daily calendar study (SPX close-to-close, Cboe free history)", "", f"Source file: {path}; rows: {len(rows)}; generated {dt.date.today()}.", "", "Columns: n, mean (bp/day), sd (bp), t-stat of mean, share of up days. Daily horizon, in-sample, no costs.", ""]
    def line(label, sub):
        if len(sub) < 30:
            return f"| {label} | {len(sub)} | – | – | – | – |"
        m = st.mean(sub); s = st.pstdev(sub); up = sum(1 for x in sub if x > 0) / len(sub); se = s / math.sqrt(len(sub))
        return f"| {label} | {len(sub)} | {m*1e4:.1f} | {s*1e4:.0f} | {m/se:.2f} | {up*100:.1f}% |"
    for period, (a, b) in {"1975-2026": (1975, 2027), "2010-2026": (2010, 2027), "2020-2026": (2020, 2027), "2023-2026 (daily 0DTE era)": (2023, 2027)}.items():
        sub = [x for x in rets if a <= x[0].year < b]
        out += [f"## {period}", "", "| subset | n | mean bp | sd bp | t | up |", "|---|---|---|---|---|---|", line("all days", [x[1] for x in sub])]
        for wd, name in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri"]):
            out.append(line(name, [x[1] for x in sub if x[0].weekday() == wd]))
        cond = {"prev day > +1%": [], "prev day < -1%": [], "prev day in [-1,+1]%": [], "prev day < -2%": []}
        for i in range(1, len(sub)):
            p = sub[i - 1][1]; r = sub[i][1]
            if p > 0.01: cond["prev day > +1%"].append(r)
            elif p < -0.01: cond["prev day < -1%"].append(r)
            else: cond["prev day in [-1,+1]%"].append(r)
            if p < -0.02: cond["prev day < -2%"].append(r)
        for k, v in cond.items():
            out.append(line(k, v))
        wk = {}
        for d, r in sub:
            y, w, _ = d.isocalendar(); wk.setdefault((y, w), []).append(r)
        keys = sorted(wk); wr = [sum(wk[k]) for k in keys]
        out.append(line("week after up-week (weekly ret)", [wr[i] for i in range(1, len(wr)) if wr[i - 1] > 0]))
        out.append(line("week after down-week (weekly ret)", [wr[i] for i in range(1, len(wr)) if wr[i - 1] <= 0]))
        out.append("")
    out += ["## Reading", "", "- Day-of-week means are small relative to daily sd (~1%); only Monday in 2023-2026 (n=181) has |t|>3 and that is a single short sample — treated as a weak prior, not a rule.", "- After a >1% day, the next day leans slightly negative since 2010 (t≈-1.9); after a <-1% day slightly positive (t≈1.9): mild daily mean reversion after large moves.", "- A down week is followed by a stronger-than-average week (t≈2.8 since 2010): weekly mean reversion.", "- None of this is an intraday statement; intraday direction base rate is ~50/50 and transaction costs dominate. These feed the ensemble with LOW initial weights and must earn weight prospectively."]
    print("\n".join(out))

if __name__ == "__main__":
    main(sys.argv[1])

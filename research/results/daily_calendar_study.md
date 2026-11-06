# Daily calendar study (SPX close-to-close, Cboe free history)

Source file: data/SPX_History_cboe_2026-11-06.csv; rows: 13071; generated 2026-11-06.

Columns: n, mean (bp/day), sd (bp), t-stat of mean, share of up days. Daily horizon, in-sample, no costs.

## 1975-2026

| subset | n | mean bp | sd bp | t | up |
|---|---|---|---|---|---|
| all days | 13070 | 3.6 | 110 | 3.71 | 53.3% |
| Mon | 2472 | 0.8 | 126 | 0.32 | 53.8% |
| Tue | 2679 | 5.4 | 107 | 2.62 | 50.8% |
| Wed | 2680 | 6.4 | 104 | 3.17 | 55.2% |
| Thu | 2627 | 1.4 | 108 | 0.65 | 52.7% |
| Fri | 2612 | 3.6 | 102 | 1.80 | 54.1% |
| prev day > +1% | 1673 | 4.0 | 123 | 1.33 | 52.6% |
| prev day < -1% | 1505 | 5.1 | 171 | 1.16 | 53.4% |
| prev day in [-1,+1]% | 9891 | 3.2 | 94 | 3.43 | 53.4% |
| prev day < -2% | 387 | 18.0 | 249 | 1.43 | 57.1% |
| week after up-week (weekly ret) | 1538 | 4.5 | 192 | 0.93 | 54.6% |
| week after down-week (weekly ret) | 1167 | 33.8 | 263 | 4.39 | 59.8% |

## 2010-2026

| subset | n | mean bp | sd bp | t | up |
|---|---|---|---|---|---|
| all days | 4237 | 4.5 | 108 | 2.67 | 54.5% |
| Mon | 793 | 4.2 | 115 | 1.02 | 55.7% |
| Tue | 872 | 6.9 | 101 | 2.03 | 52.8% |
| Wed | 869 | 6.2 | 107 | 1.71 | 54.8% |
| Thu | 854 | 1.3 | 113 | 0.35 | 53.7% |
| Fri | 849 | 3.5 | 106 | 0.96 | 55.7% |
| prev day > +1% | 552 | -10.5 | 132 | -1.87 | 50.0% |
| prev day < -1% | 474 | 14.9 | 172 | 1.88 | 55.3% |
| prev day in [-1,+1]% | 3210 | 5.4 | 90 | 3.43 | 55.2% |
| prev day < -2% | 139 | 25.7 | 231 | 1.31 | 56.8% |
| week after up-week (weekly ret) | 511 | 7.2 | 173 | 0.93 | 56.4% |
| week after down-week (weekly ret) | 367 | 40.7 | 279 | 2.80 | 60.5% |

## 2020-2026

| subset | n | mean bp | sd bp | t | up |
|---|---|---|---|---|---|
| all days | 1721 | 4.8 | 127 | 1.56 | 54.0% |
| Mon | 321 | 10.6 | 138 | 1.39 | 60.7% |
| Tue | 356 | 6.3 | 116 | 1.03 | 48.9% |
| Wed | 354 | 7.5 | 124 | 1.14 | 54.8% |
| Thu | 347 | -4.1 | 134 | -0.57 | 52.4% |
| Fri | 343 | 3.9 | 125 | 0.57 | 53.9% |
| prev day > +1% | 273 | -13.5 | 155 | -1.44 | 49.8% |
| prev day < -1% | 228 | 17.7 | 204 | 1.32 | 51.8% |
| prev day in [-1,+1]% | 1219 | 6.4 | 99 | 2.26 | 55.4% |
| prev day < -2% | 67 | 39.7 | 275 | 1.18 | 55.2% |
| week after up-week (weekly ret) | 201 | 10.7 | 189 | 0.80 | 54.7% |
| week after down-week (weekly ret) | 156 | 38.8 | 333 | 1.45 | 57.7% |

## 2023-2026 (daily 0DTE era)

| subset | n | mean bp | sd bp | t | up |
|---|---|---|---|---|---|
| all days | 965 | 6.7 | 93 | 2.25 | 55.3% |
| Mon | 181 | 19.0 | 76 | 3.35 | 65.7% |
| Tue | 200 | 2.2 | 79 | 0.39 | 50.5% |
| Wed | 198 | 8.2 | 104 | 1.11 | 53.5% |
| Thu | 193 | -1.9 | 100 | -0.27 | 51.8% |
| Fri | 193 | 7.1 | 99 | 0.99 | 56.0% |
| prev day > +1% | 117 | 5.7 | 92 | 0.67 | 55.6% |
| prev day < -1% | 98 | 20.9 | 145 | 1.42 | 53.1% |
| prev day in [-1,+1]% | 749 | 5.1 | 84 | 1.67 | 55.7% |
| prev day < -2% | 14 | – | – | – | – |
| week after up-week (weekly ret) | 117 | 21.1 | 157 | 1.45 | 58.1% |
| week after down-week (weekly ret) | 83 | 46.9 | 235 | 1.82 | 57.8% |

## Reading

- Day-of-week means are small relative to daily sd (~1%); only Monday in 2023-2026 (n=181) has |t|>3 and that is a single short sample — treated as a weak prior, not a rule.
- After a >1% day, the next day leans slightly negative since 2010 (t≈-1.9); after a <-1% day slightly positive (t≈1.9): mild daily mean reversion after large moves.
- A down week is followed by a stronger-than-average week (t≈2.8 since 2010): weekly mean reversion.
- None of this is an intraday statement; intraday direction base rate is ~50/50 and transaction costs dominate. These feed the ensemble with LOW initial weights and must earn weight prospectively.

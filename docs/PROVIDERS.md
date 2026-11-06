# Data providers — summary and recommendation

Full comparison with sources and prices (accessed 2026-11-06): `docs/research/providers.md`.

| Need | Zero-cost stack (now) | Upgrade |
|---|---|---|
| SPX index, real-time | Schwab `/quotes $SPX` (free with account; manual weekly re-login) | Databento DBIX.CORE $99/mo (SPX every 1 s + official SET/close), ThetaData Indices |
| SPX/SPXW/SPXO chains | Schwab `/chains` (real-time bid/ask/size/OI/greeks); Cboe delayed JSON (15 min; display-only terms) | Massive Options Advanced $199 (real-time OPRA + history 2022→); Databento OPRA Standard $199 (NBBO 2023→) |
| SPY | Schwab; Cboe delayed | same as above |
| Historical NBBO ≤1 s for closing-window backtests | none free | Databento OPRA CMBP-1 (usage-priced) or ThetaData Standard $80/mo (tick NBBO 2016→) |
| ES futures | not connected | tastytrade DXLink (free with account), Databento GLBX $199, Massive Futures $29–199 |
| Closing imbalances | not available | Massive NYSE imbalances $49/mo (NYSE-listed only); Nasdaq NOII via Databento XNAS.ITCH |
| Daily SPX closes / SET | Cboe free CSV (1975→) | — |

Minimum viable stack (recommended now): Schwab + Cboe delayed fallback + Cboe daily CSV. Cost $0. Upgraded
research stack when validation needs it: Databento OPRA Standard + DBIX.CORE (~$300/mo) or ThetaData Standard ($80).
No purchase has been made; nothing is required to run the platform as deployed.

Licensing notes: Cboe's website terms allow personal, non-commercial use and restrict storage of delayed data — the
platform defaults to not archiving Cboe snapshots (`archiveCboe=false`). Schwab's developer terms are login-walled;
the single-user, own-account interpretation is used. Yahoo/yfinance is excluded (terms prohibit automated collection).

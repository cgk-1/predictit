import type { RankedContract } from "@predictit/engine";
import { fmtContract, fmtDelta, fmtMs, fmtPct, fmtPremium, fmtPts, fmtRatio, fmtSignedPct, fmtUsd } from "../lib/format";

const BUDGET_REASON = /^premium \$\d+ > budget$/;

export function ContractsTable({ contracts, asOf, budgetUsd }: { contracts: RankedContract[]; asOf: number | null; budgetUsd?: number }) {
  if (!contracts.length) return <p className="muted small">n/a — contracts are ranked only when a setup is triggered and a chain is present.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Inst.</th>
            <th scope="col">Contract</th>
            <th scope="col">Budget</th>
            <th scope="col" className="num">
              delta
            </th>
            <th scope="col" className="num">
              bid / ask
            </th>
            <th scope="col" className="num">
              spread
            </th>
            <th scope="col" className="num">
              size
            </th>
            <th scope="col" className="num">
              age
            </th>
            <th scope="col" className="num">
              entry
            </th>
            <th scope="col" className="num">
              risk
            </th>
            <th scope="col" className="num">
              at target
            </th>
            <th scope="col" className="num">
              flat
            </th>
            <th scope="col" className="num">
              at invalidation
            </th>
            <th scope="col" className="num">
              reward:risk
            </th>
            <th scope="col" className="num">
              breakeven win rate
            </th>
            <th scope="col">eligible</th>
            <th scope="col">tradeoff</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => {
            const withinBudget = c.withinBudget ?? (budgetUsd !== undefined ? c.riskUsd <= budgetUsd : true);
            const budgetReason = c.reasons.find((r) => BUDGET_REASON.test(r)) ?? (withinBudget ? null : `premium ${fmtUsd(c.riskUsd)} > budget`);
            const otherReasons = c.reasons.filter((r) => !BUDGET_REASON.test(r));
            return (
              <tr key={c.osi} className={!withinBudget ? "row-dim" : c.eligible ? "" : "row-bad"}>
                <td className="num">{i + 1}</td>
                <td className="mono">{c.instrument ?? "SPX"}</td>
                <td className="mono" title={c.osi}>
                  {fmtContract(c.osi)}
                  {c.is0dte ? <span className="chip chip-quiet" style={{ marginLeft: 6 }}>0DTE</span> : null}
                </td>
                <td className="wrap small">{withinBudget ? <span className="chip chip-ok">within</span> : <span title={budgetReason ?? undefined}>over budget ({budgetReason})</span>}</td>
                <td className="num">{fmtDelta(c.delta)}</td>
                <td className="num">
                  {fmtPremium(c.bid)} / {fmtPremium(c.ask)}
                </td>
                <td className="num">
                  {fmtPremium(c.spread)} ({fmtPct(c.spreadPct, 1)})
                </td>
                <td className="num">
                  {c.bidSize}×{c.askSize}
                </td>
                <td className="num" title={asOf ? `age at ${new Date(asOf).toISOString()}` : undefined}>
                  {fmtMs(c.quoteAgeMs)}
                </td>
                <td className="num">{fmtPremium(c.entry)}</td>
                <td className="num">{fmtUsd(c.riskUsd)}</td>
                <td className={`num ${c.atTarget && c.atTarget.ret > 0 ? "pos" : ""}`}>{c.atTarget ? `${fmtPremium(c.atTarget.exit)} (${fmtSignedPct(c.atTarget.ret, 0)})` : "n/a"}</td>
                <td className="num">
                  {fmtPremium(c.atFlat.exit)} ({fmtSignedPct(c.atFlat.ret, 0)})
                </td>
                <td className="num neg">
                  {fmtPremium(c.atInvalidation.exit)} ({fmtSignedPct(c.atInvalidation.ret, 0)})
                </td>
                <td className="num">{fmtRatio(c.rewardRisk)}</td>
                <td className="num">{fmtPct(c.breakevenWinRate, 0)}</td>
                <td className="wrap">
                  {c.eligible ? (
                    <span className="chip chip-ok">eligible</span>
                  ) : otherReasons.length ? (
                    <span className="small" title={otherReasons.join("; ")}>
                      {otherReasons.join("; ")}
                    </span>
                  ) : (
                    <span className="small muted">over budget only</span>
                  )}
                </td>
                <td className="wrap small">
                  {c.tradeoff}
                  <div className="xs muted">
                    breakeven at expiry {fmtPts(c.breakevenAtExpiry, 2)}
                    {c.thetaPerMin !== null ? `; theta ${c.thetaPerMin.toFixed(4)}/min` : ""}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { fmtClock, fmtTime } from "../lib/format";

/** Countdown from `now` (server-corrected) to `target`. Shows the expired message when passed. */
export function Countdown({ target, now, expiredText = "EXPIRED — awaiting refresh", prefix = "expires in" }: { target: number; now: number; expiredText?: string; prefix?: string }) {
  const left = (target - now) / 1000;
  if (left <= 0) return <span className="decision-expired">{expiredText}</span>;
  return (
    <span>
      {prefix} <strong>{fmtClock(left)}</strong> <span className="faint">({fmtTime(target)} ET)</span>
    </span>
  );
}

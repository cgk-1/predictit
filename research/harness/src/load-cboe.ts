// Load collected Cboe snapshots (gzip JSON) into StoredSnapshot[] ordered by receipt time.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseCboeChain, parseCboeIntraday } from "@predictit/adapters";
import type { StoredSnapshot } from "@predictit/engine";

/**
 * Replay normalisation: a delayed snapshot observed at T would have been available LIVE at ~T (+ feed latency).
 * For research we therefore order and stamp by observedAt + latency and mark the data REPLAY, so the engine's
 * staleness logic behaves as it would have in real time. This never moves data earlier than it was observed.
 */
export function normalizeForReplay(s: StoredSnapshot, latencyMs = 2000): StoredSnapshot {
  const p: any = s.payload;
  const observed = p.stamp.observedAt;
  const receivedAt = observed + latencyMs;
  const stamp = { ...p.stamp, mode: "REPLAY", receivedAt };
  if (s.kind.endsWith("Chain")) {
    return { receivedAt, kind: s.kind, payload: { ...p, stamp, options: p.options.map((o: any) => ({ ...o, quoteTime: observed })) } };
  }
  if (s.kind.endsWith("Bars")) {
    // keep only bars completed by the observed time
    return { receivedAt, kind: s.kind, payload: { ...p, stamp, bars: p.bars.filter((b: any) => b.t + 60_000 <= observed) } };
  }
  return { receivedAt, kind: s.kind, payload: { ...p, stamp, quoteTime: Math.min(p.quoteTime, observed) } };
}

export function loadCboeDay(dir: string, opts: { maxDays?: number; strikePct?: number; every?: number; replay?: boolean } = {}): StoredSnapshot[] {
  const out: StoredSnapshot[] = [];
  const read = (sub: string) => {
    const p = join(dir, sub);
    if (!existsSync(p)) return [] as string[];
    return readdirSync(p).filter((f) => f.endsWith(".json.gz")).sort().map((f) => join(p, f));
  };
  const every = opts.every ?? 1;
  read("spx_chain_near").forEach((f, idx) => {
    if (idx % every) return;
    const raw = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8"));
    const receivedAt = Date.parse(raw._received_utc);
    out.push({ receivedAt, kind: "spxChain", payload: parseCboeChain(raw, receivedAt, { maxDays: opts.maxDays ?? 14, strikePct: opts.strikePct ?? 0.05 }) });
  });
  read("spx_intraday").forEach((f, idx) => {
    if (idx % every) return;
    const raw = JSON.parse(gunzipSync(readFileSync(f)).toString("utf8"));
    const receivedAt = Date.parse(raw._received_utc);
    out.push({ receivedAt, kind: "spxBars", payload: parseCboeIntraday(raw, receivedAt) });
  });
  const arr = opts.replay ? out.map((x) => normalizeForReplay(x)) : out;
  return arr.sort((a, b) => a.receivedAt - b.receivedAt);
}

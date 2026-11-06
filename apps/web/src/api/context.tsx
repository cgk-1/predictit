import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerState, type ServerConnection } from "./useServerState";
import type { Instrument, ServerState } from "./types";

const ServerContext = createContext<ServerConnection | null>(null);
const ClockContext = createContext<number>(Date.now());
const InstrumentContext = createContext<[Instrument, (i: Instrument) => void]>(["SPX", () => {}]);

const INSTRUMENT_KEY = "pi_instrument";

function readInstrument(): Instrument {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(INSTRUMENT_KEY) : null;
    return v === "SPY" ? "SPY" : "SPX";
  } catch {
    return "SPX";
  }
}

/** Project the selected instrument's native evaluation onto the top-level fields the views read. */
export function projectState(s: ServerState | null, inst: Instrument): ServerState | null {
  if (!s || !s.instruments || inst === "SPX") return s;
  const p = s.instruments[inst];
  if (!p) return s;
  return { ...s, mode: p.mode, decision: p.decision, decisionAgeMs: p.decisionAgeMs, regime: p.regime, levels: p.levels, bars: p.bars, chainFeatures: p.chainFeatures, gex: p.gex, closing: p.closing, notes: p.notes, evaluatedAt: p.evaluatedAt };
}

export function useInstrument(): [Instrument, (i: Instrument) => void] {
  return useContext(InstrumentContext);
}

/** Provides the single server connection plus a 1 Hz "server now" clock corrected for the client clock offset. */
export function ServerProvider({ children }: { children: ReactNode }) {
  const raw = useServerState();
  const [inst, setInstState] = useState<Instrument>(readInstrument);
  const setInst = (i: Instrument) => {
    setInstState(i);
    try {
      localStorage.setItem(INSTRUMENT_KEY, i);
    } catch {
      /* ignore */
    }
  };
  const conn = useMemo<ServerConnection>(() => ({ ...raw, state: projectState(raw.state, inst) }), [raw, inst]);
  const [now, setNow] = useState(() => Date.now() + conn.offsetMs);
  useEffect(() => {
    const tick = () => setNow(Date.now() + conn.offsetMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [conn.offsetMs]);
  return (
    <ServerContext.Provider value={conn}>
      <InstrumentContext.Provider value={[inst, setInst]}>
        <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
      </InstrumentContext.Provider>
    </ServerContext.Provider>
  );
}

/** Provides a fixed connection and clock (tests, fixtures). */
export function StaticServerProvider({ conn, now, children }: { conn: ServerConnection; now: number; children: ReactNode }) {
  return (
    <ServerContext.Provider value={conn}>
      <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
    </ServerContext.Provider>
  );
}

export function useServer(): ServerConnection {
  const c = useContext(ServerContext);
  if (!c) throw new Error("useServer must be used inside ServerProvider");
  return c;
}

/** Ticking estimate of the server's current time (ms), updated every second. */
export function useServerNow(): number {
  return useContext(ClockContext);
}

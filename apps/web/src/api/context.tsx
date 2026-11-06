import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerState, type ServerConnection } from "./useServerState";

const ServerContext = createContext<ServerConnection | null>(null);
const ClockContext = createContext<number>(Date.now());

/** Provides the single server connection plus a 1 Hz "server now" clock corrected for the client clock offset. */
export function ServerProvider({ children }: { children: ReactNode }) {
  const conn = useServerState();
  const [now, setNow] = useState(() => Date.now() + conn.offsetMs);
  useEffect(() => {
    const tick = () => setNow(Date.now() + conn.offsetMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [conn.offsetMs]);
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

import { useEffect, useMemo, useRef, useState } from "react";
import { ServerProvider, useServer, useServerNow } from "./api/context";
import type { ServerConnection } from "./api/useServerState";
import { setUnauthorizedHandler } from "./api/client";
import { Nav, type NavItem } from "./components/Nav";
import { StatusBar, isStale } from "./components/StatusBar";
import { useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import { fmtAgo, fmtMs, fmtTime } from "./lib/format";
import { backoffDelay, POLL_VISIBLE_MS } from "./api/useServerState";
import { TodayView } from "./views/Today";
import { SetupsView } from "./views/Setups";
import { GammaView } from "./views/Gamma";
import { ClosingView } from "./views/Closing";
import { PositionsView } from "./views/Positions";
import { ReplayView } from "./views/Replay";
import { PerformanceView } from "./views/Performance";
import { SettingsView } from "./views/Settings";
import { LeanView } from "./views/Lean";
import { DashView } from "./views/Dash";

const VIEWS: Array<{ path: string; label: string; title: string }> = [
  { path: "/", label: "Dash", title: "Dash" },
  { path: "/today", label: "Today", title: "Today" },
  { path: "/setups", label: "Setups", title: "Setups" },
  { path: "/lean", label: "Lean", title: "Market lean" },
  { path: "/gamma", label: "Gamma", title: "Gamma" },
  { path: "/closing", label: "Closing window", title: "Closing window" },
  { path: "/positions", label: "Positions", title: "Positions" },
  { path: "/replay", label: "Replay", title: "Replay" },
  { path: "/performance", label: "Performance", title: "Performance" },
  { path: "/settings", label: "Settings", title: "Settings" },
];

function Banners() {
  const conn = useServer();
  const now = useServerNow();
  const s = conn.state;
  const stale = s ? isStale(s, now) : null;
  return (
    <>
      {conn.consecutiveErrors > 0 && (
        <div className="banner banner-danger" role="alert">
          <strong>{s ? "Disconnected — reconnecting" : "Cannot reach the server"}</strong>
          <span>
            {conn.consecutiveErrors} failed {conn.consecutiveErrors === 1 ? "request" : "requests"}; next retry in {fmtMs(backoffDelay(conn.consecutiveErrors, POLL_VISIBLE_MS))}.
          </span>
          {conn.error ? <span className="muted">{conn.error}</span> : null}
          {conn.lastOkAt ? <span className="muted">Last good response {fmtAgo(Date.now() - conn.lastOkAt)}.</span> : null}
          <button type="button" className="btn btn-sm" onClick={conn.refresh}>
            Retry now
          </button>
        </div>
      )}
      {stale?.stale && (
        <div className="banner banner-warn" role="status">
          <strong>Stale</strong>
          <span>{stale.reason}. Numbers below are from the last evaluation; treat them as history, not a live view.</span>
        </div>
      )}
      {s?.mode === "REPLAY" && (
        <div className="banner banner-replay" role="status">
          <strong>REPLAY</strong>
          <span>The server is running on reconstructed data, not a live feed.</span>
        </div>
      )}
    </>
  );
}

/** Opt-in alerting on action changes: tab title prefix always; browser Notification and a short beep when enabled. */
function useAlerts(conn: ServerConnection, baseTitle: string) {
  const s = conn.state;
  const action = s?.decision?.summary?.action ?? null;
  const inst = s?.decision?.summary?.instrument ?? "SPX";
  const prev = useRef<string | null>(null);
  // the title is owned here so a tab change never drops the action prefix
  useEffect(() => {
    document.title = action === "BUY CALL" || action === "BUY PUT" || action === "MANAGE" ? `[${inst} ${action}] ${baseTitle}` : baseTitle;
  }, [action, inst, baseTitle]);
  useEffect(() => {
    if (!action) return;
    const key = `${inst}:${action}`;
    if (prev.current !== null && prev.current !== key) {
      let notify = false;
      let beep = false;
      try {
        notify = localStorage.getItem("pi_alert_notify") === "1";
        beep = localStorage.getItem("pi_alert_beep") === "1";
      } catch {
        /* ignore */
      }
      if (notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`predictit · ${inst}: ${action}`, { body: s?.decision?.summary?.actionText ?? "", tag: "predictit-action" });
        } catch {
          /* ignore */
        }
      }
      if (beep && typeof AudioContext !== "undefined") {
        try {
          const ac = new AudioContext();
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.frequency.value = action === "BUY CALL" ? 880 : action === "BUY PUT" ? 440 : 660;
          g.gain.value = 0.05;
          o.connect(g).connect(ac.destination);
          o.start();
          o.stop(ac.currentTime + 0.18);
        } catch {
          /* ignore */
        }
      }
    }
    prev.current = key;
  }, [action, inst, s?.decision?.summary?.actionText]);
}

function Shell() {
  const path = useRoute();
  const conn = useServer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const view = VIEWS.find((v) => v.path === path) ?? VIEWS[0]!;
  useAlerts(conn, view.path === "/" ? "predictit" : `${view.title} — predictit`);
  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  const s = conn.state;
  const items: NavItem[] = useMemo(
    () =>
      VIEWS.map((v) => ({
        path: v.path,
        label: v.label,
        dot: (v.path === "/closing" && !!s?.clock.inClosingWindow) || (v.path === "/positions" && !!s?.positions.some((p) => p.mark?.exitSignal)),
      })),
    [s],
  );

  let body: React.ReactNode;
  switch (path) {
    case "/setups":
      body = <SetupsView />;
      break;
    case "/lean":
      body = <LeanView />;
      break;
    case "/gamma":
      body = <GammaView />;
      break;
    case "/closing":
      body = <ClosingView />;
      break;
    case "/positions":
      body = <PositionsView />;
      break;
    case "/replay":
      body = <ReplayView />;
      break;
    case "/performance":
      body = <PerformanceView />;
      break;
    case "/settings":
      body = <SettingsView theme={theme} setTheme={setTheme} />;
      break;
    case "/today":
      body = <TodayView />;
      break;
    default:
      body = <DashView />;
  }

  return (
    <div className="shell">
      <aside id="rail" className={`rail${menuOpen ? " rail-open" : ""}`}>
        <div className="rail-brand">
          predictit <small>SPX/SPY intraday</small>
        </div>
        <Nav items={items} path={path} onNavigate={() => setMenuOpen(false)} />
        <div className="rail-foot">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          <p style={{ marginTop: 10 }}>
            Decision support only. Nothing here is validated out-of-sample.
            {s?.serverTime ? <br /> : null}
            {s?.serverTime ? `State ${fmtTime(s.serverTime)} ET` : null}
          </p>
        </div>
      </aside>
      <div className="main">
        <StatusBarBound menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((o) => !o)} />
        <main className="content" id="main">
          <Banners />
          {body}
        </main>
      </div>
    </div>
  );
}

function StatusBarBound({ menuOpen, onToggleMenu }: { menuOpen: boolean; onToggleMenu: () => void }) {
  const conn = useServer();
  const now = useServerNow();
  return <StatusBar conn={conn} now={now} menuOpen={menuOpen} onToggleMenu={onToggleMenu} />;
}

export default function App() {
  useEffect(() => {
    setUnauthorizedHandler(() => window.location.reload());
    return () => setUnauthorizedHandler(null);
  }, []);
  return (
    <ServerProvider>
      <Shell />
    </ServerProvider>
  );
}

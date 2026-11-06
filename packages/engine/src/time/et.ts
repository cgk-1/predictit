/**
 * America/New_York time helpers. All user-facing session logic is expressed in ET wall time;
 * all stored instants are ms since epoch (UTC). We rely on Intl (available in Node and Workers)
 * so DST transitions are handled by the platform's tz database, not by hand-written rules.
 */

export const ET = "America/New_York";

export interface EtParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** YYYY-MM-DD in ET */
  date: string;
  /** minutes since ET midnight, fractional seconds included */
  minuteOfDay: number;
  /** UTC offset in minutes (e.g. -300 for EST, -240 for EDT) */
  offsetMinutes: number;
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function etParts(ms: number): EtParts {
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const weekday = WD[get("weekday")] ?? 0;
  const date = `${year}-${pad2(month)}-${pad2(day)}`;
  // offset = (wall clock as if UTC) - actual instant
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  return { year, month, day, hour, minute, second, weekday, date, minuteOfDay: hour * 60 + minute + second / 60, offsetMinutes };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function etDate(ms: number): string {
  return etParts(ms).date;
}

/** Build the UTC instant for an ET wall-clock time. Handles DST by looking up the offset at the target. */
export function etToMs(date: string, hour: number, minute = 0, second = 0): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, hour, minute, second);
  // two iterations converge for all non-transition instants; on transition edges we accept the platform's resolution
  for (let i = 0; i < 2; i++) {
    const off = etParts(guess).offsetMinutes;
    guess = Date.UTC(y, m - 1, d, hour, minute, second) - off * 60000;
  }
  return guess;
}

/** Parse "YYYY-MM-DDTHH:MM:SS" (vendor local ET string, no zone) into ms. */
export function etLocalIsoToMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) throw new Error(`bad ET local iso: ${s}`);
  return etToMs(`${m[1]}-${m[2]}-${m[3]}`, Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/** Parse "YYYY-MM-DD HH:MM:SS" that is actually UTC (Cboe top-level timestamps) into ms. */
export function utcLocalIsoToMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) throw new Error(`bad UTC iso: ${s}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dd = new Date(t);
  return `${dd.getUTCFullYear()}-${pad2(dd.getUTCMonth() + 1)}-${pad2(dd.getUTCDate())}`;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtEtTime(ms: number, withSeconds = true): string {
  const p = etParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}${withSeconds ? ":" + pad2(p.second) : ""}`;
}

export function fmtEt(ms: number): string {
  const p = etParts(ms);
  return `${p.date} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ET`;
}

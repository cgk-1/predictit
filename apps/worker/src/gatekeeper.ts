/**
 * Durable Object that rate-limits fallback logins (per IP and globally) so the passphrase cannot be brute-forced.
 */
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

interface Bucket { fails: number; until: number }

export class Gatekeeper extends DurableObject<Env> {
  async check(ip: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
    const now = Date.now();
    const b = (await this.ctx.storage.get<Bucket>(`ip:${ip}`)) ?? { fails: 0, until: 0 };
    const g = (await this.ctx.storage.get<Bucket>("global")) ?? { fails: 0, until: 0 };
    if (b.until > now) return { allowed: false, retryAfterSec: Math.ceil((b.until - now) / 1000) };
    if (g.until > now) return { allowed: false, retryAfterSec: Math.ceil((g.until - now) / 1000) };
    return { allowed: true, retryAfterSec: 0 };
  }

  async fail(ip: string): Promise<void> {
    const now = Date.now();
    const b = (await this.ctx.storage.get<Bucket>(`ip:${ip}`)) ?? { fails: 0, until: 0 };
    const g = (await this.ctx.storage.get<Bucket>("global")) ?? { fails: 0, until: 0 };
    b.fails++;
    g.fails++;
    // exponential backoff per IP after 5 failures; global slowdown after 50 failures/hour
    if (b.fails >= 5) b.until = now + Math.min(3600_000, 2 ** (b.fails - 5) * 30_000);
    if (g.fails >= 50) g.until = now + 60_000;
    await this.ctx.storage.put(`ip:${ip}`, b);
    await this.ctx.storage.put("global", g);
    await this.ctx.storage.setAlarm(now + 3600_000);
  }

  async success(ip: string): Promise<void> {
    await this.ctx.storage.delete(`ip:${ip}`);
  }

  override async alarm(): Promise<void> {
    // decay counters hourly
    await this.ctx.storage.deleteAll();
  }
}

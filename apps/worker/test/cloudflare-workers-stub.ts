// Minimal stand-in for the `cloudflare:workers` module so Worker modules can be unit-tested in Node.
export class DurableObject<E = unknown> {
  constructor(public ctx: any, public env: E) {}
}

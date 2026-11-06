import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "cloudflare:workers": path.resolve(__dirname, "test/cloudflare-workers-stub.ts") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});

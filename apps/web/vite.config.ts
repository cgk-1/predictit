import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  resolve: { alias: { "@predictit/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts") } },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], environment: "node" },
} as any);

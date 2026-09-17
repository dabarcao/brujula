import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Story 1.1 (_bmad-output/implementation-artifacts/
// spec-1-1-characterization-tests-report-groups-baseline.md): minimal
// Node-environment Vitest config for characterization tests that hit a
// real LOCAL Supabase instance (`supabase start`) over RPC — no jsdom, no
// React plugin, nothing renders. `.env.test.local` (gitignored, separate
// from `.env.local`'s real dev credentials) supplies the local instance's
// URL/anon key; loaded by hand here rather than via `dotenv` so this
// story's only new dependency stays `vitest` itself, per its Tasks list.

function loadEnvTestLocal(): Record<string, string> {
  const envPath = path.join(__dirname, ".env.test.local");
  if (!existsSync(envPath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" without adding the
      // vite-tsconfig-paths dependency.
      "@": path.resolve(__dirname, "src"),
      // Story 1.3 (_bmad-output/implementation-artifacts/
      // spec-1-3-enforce-the-import-boundary.md): every src/server/db and
      // src/server/managers file now opens with `import "server-only";`.
      // Next.js's bundler resolves that package's "react-server" export
      // condition to its empty.js no-op for server-side code; Vitest's
      // plain Node resolution doesn't set that condition, so it would
      // otherwise hit index.js's unconditional throw. Alias it to the same
      // no-op Next.js uses so these server-only files stay importable in
      // this Node-environment test run.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: loadEnvTestLocal(),
    // Real RPC calls against a local Supabase instance + a best-effort
    // Anthropic call on close; give it more room than Vitest's 5s default.
    // beforeAll seeds a full demo company (~18 employees, one 360 cycle
    // each) over the REST API, which is the slowest part by far.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});

import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// API do vitest-pool-workers v0.13+ (vitest 4): plugin cloudflareTest().
// tsconfigPaths() resolve os aliases @/ (tsconfig paths) nos testes.
// Lê as migrations geradas pelo drizzle-kit e as expõe como binding TEST_MIGRATIONS,
// aplicado no D1 de teste pelo setup file (test/apply-migrations.ts).
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    cloudflareTest(async () => {
      const migrationsDir = fileURLToPath(new URL("./drizzle", import.meta.url));
      const migrations = await readD1Migrations(migrationsDir);
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

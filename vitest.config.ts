import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    cloudflareTest(async () => {
      const migrationsDir = fileURLToPath(new URL("./drizzle", import.meta.url));
      const migrations = await readD1Migrations(migrationsDir);
      return {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, DASHBOARD_SECRET: "test-secret" },
        },
      };
    }),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    exclude: [...configDefaults.exclude, "src/_parked/**"],
    testTimeout: 20000,
  },
});

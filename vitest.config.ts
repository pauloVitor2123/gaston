import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// API do vitest-pool-workers v0.13+ (vitest 4): plugin cloudflareTest()
// (substitui o antigo defineWorkersConfig de /config).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});

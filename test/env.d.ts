import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// `env` de cloudflare:test é tipado como Cloudflare.Env nesta versão do pool-workers.
// Adiciona o binding só-de-teste TEST_MIGRATIONS (injetado pelo vitest.config.ts).
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

import { applyD1Migrations, env } from "cloudflare:test";

// Aplica as migrations (geradas pelo drizzle-kit) no D1 de teste antes dos testes.
// Storage é isolado por arquivo de teste (vitest 4 pool-workers), então cada arquivo
// roda contra um banco limpo com o schema aplicado.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

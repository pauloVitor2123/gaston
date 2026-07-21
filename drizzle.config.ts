import { defineConfig } from "drizzle-kit";

// Config do drizzle-kit para GERAR migrations SQL a partir do schema.
// As migrations são APLICADAS via `wrangler d1 migrations apply` (não via drizzle-kit),
// então não precisamos de credenciais D1 aqui — só dialect + schema + out.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});

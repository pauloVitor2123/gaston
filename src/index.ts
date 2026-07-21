export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "gaston",
        time: new Date().toISOString(),
      });
    }

    return new Response(
      "Gaston 🤖 — assistente financeiro. Fase 0: scaffold no ar.",
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  },
} satisfies ExportedHandler<Env>;

import { Bot, webhookCallback } from "grammy";
import { buildMessageHandler } from "@/composition-root";
import type { LLMEnv } from "@/config";

type AppEnv = Env & LLMEnv & { TELEGRAM_BOT_TOKEN: string };

export default {
  async fetch(request: Request, env: AppEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "gaston", time: new Date().toISOString() });
    }

    const messageHandler = buildMessageHandler(env);
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    bot.on("message:text", async (ctx) => {
      const reply = await messageHandler.handle(
        ctx.chat.id,
        ctx.message.text,
        ctx.from?.first_name ?? "Usuário",
      );
      await ctx.reply(reply);
    });

    bot.on("message", async (ctx) => {
      await ctx.reply(
        'Por enquanto só entendo mensagens de texto 🙂. Me conte seu gasto ou recebimento escrevendo, por exemplo: "almoço 35 no nubank".',
      );
    });

    bot.catch((err) => {
      console.error("Bot handler error", err);
    });

    return webhookCallback(bot, "cloudflare-mod")(request);
  },
} satisfies ExportedHandler<AppEnv>;

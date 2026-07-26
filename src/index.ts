import { Bot, webhookCallback } from "grammy";
import { buildMessageHandler } from "@/composition-root";

type AppEnv = Env & {
  TELEGRAM_BOT_TOKEN: string;
  OPENROUTER_API_KEY: string;
  OPENAI_API_KEY: string;
};

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

    return webhookCallback(bot, "cloudflare-mod")(request);
  },
} satisfies ExportedHandler<AppEnv>;

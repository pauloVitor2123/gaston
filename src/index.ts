import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import type { BotReply } from "@/handlers/reply";
import { buildMessageHandler } from "@/composition-root";
import type { LLMEnv } from "@/config";
import { handleDashboardRoutes } from "@/services/dashboard/handler";
import { SystemClock } from "@/services/clock";

type AppEnv = Env & LLMEnv & { TELEGRAM_BOT_TOKEN: string };

export default {
  async fetch(request: Request, env: AppEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "gaston", time: new Date().toISOString() });
    }

    const dashboardResponse = await handleDashboardRoutes(request, {
      db: env.DB,
      secret: env.DASHBOARD_SECRET,
      now: new SystemClock().now(),
    });
    if (dashboardResponse) return dashboardResponse;

    const messageHandler = buildMessageHandler(env);
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

    bot.on("message:text", async (ctx) => {
      const reply = await messageHandler.handle(
        ctx.chat.id,
        ctx.message.text,
        ctx.from?.first_name ?? "Usuário",
        url.origin,
      );
      await ctx.reply(reply.text, { reply_markup: keyboardFor(reply) });
    });

    bot.on("callback_query:data", async (ctx) => {
      const chatId = ctx.chat?.id;
      const reply = chatId ? await messageHandler.handleCallback(chatId, ctx.callbackQuery.data) : null;
      await ctx.answerCallbackQuery();
      if (!reply) return;
      const original = ctx.callbackQuery.message?.text;
      await ctx.editMessageText(original ? `${original}\n\n${reply.text}` : reply.text, {
        reply_markup: keyboardFor(reply),
      });
    });

    bot.on("message", async (ctx) => {
      await ctx.reply(
        'Por enquanto só entendo mensagens de texto 🙂. Me conte seu gasto escrevendo, por exemplo: "gastei 20 na padaria".',
      );
    });

    bot.catch((err) => {
      console.error("Bot handler error", err);
    });

    return webhookCallback(bot, "cloudflare-mod")(request);
  },
} satisfies ExportedHandler<AppEnv>;

function keyboardFor(reply: BotReply): InlineKeyboard | undefined {
  if (!reply.actions?.length) return undefined;
  const keyboard = new InlineKeyboard();
  for (const action of reply.actions) keyboard.text(action.label, action.id);
  return keyboard;
}

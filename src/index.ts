import { Bot, webhookCallback } from "grammy";
import { buildMessageHandler } from "@/composition-root";
import type { LLMEnv } from "@/config";
import type { ReplyAction } from "@/handlers/reply";

type AppEnv = Env & LLMEnv & { TELEGRAM_BOT_TOKEN: string };

function toReplyMarkup(actions?: ReplyAction[]) {
  if (!actions || actions.length === 0) return undefined;
  return { inline_keyboard: [actions.map((a) => ({ text: a.label, callback_data: a.id }))] };
}

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
      await ctx.reply(reply.text, { reply_markup: toReplyMarkup(reply.actions) });
    });

    bot.on("callback_query:data", async (ctx) => {
      const reply = await messageHandler.handleCallback(
        ctx.chat?.id ?? ctx.from.id,
        ctx.callbackQuery.data,
        ctx.from.first_name ?? "Usuário",
      );
      await ctx.answerCallbackQuery();
      try {
        await ctx.editMessageText(reply.text, {
          reply_markup: toReplyMarkup(reply.actions) ?? { inline_keyboard: [] },
        });
      } catch {
        await ctx.reply(reply.text, { reply_markup: toReplyMarkup(reply.actions) });
      }
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

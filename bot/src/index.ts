import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import { createServer } from 'node:http';

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL ?? 'https://labframe-ai.vercel.app';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';
const PORT = Number(process.env.PORT ?? 3000);

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

const openAppKeyboard = new InlineKeyboard().webApp(
  'Открыть LabFrame AI ✨',
  MINI_APP_URL,
);

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Привет! LabFrame AI делает из обычного фото зуботехнической работы готовый пост для Instagram.\n\n' +
      'Жми кнопку ниже, чтобы открыть приложение и создать первый пост.',
    { reply_markup: openAppKeyboard },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    'Что я умею:\n' +
      '• /start — открыть приложение\n' +
      '• /app — открыть приложение\n' +
      '• /pricing — посмотреть тарифы\n\n' +
      'Внутри мини-аппа: загружаешь фото → выбираешь стиль и формат → получаешь готовое изображение и текст.',
    { reply_markup: openAppKeyboard },
  );
});

bot.command('app', (ctx) =>
  ctx.reply('Открываю приложение:', { reply_markup: openAppKeyboard }),
);

bot.command('pricing', (ctx) =>
  ctx.reply('Все тарифы и лимиты — в приложении:', { reply_markup: openAppKeyboard }),
);

// Когда пользователь шлёт фото в чат — подсказываем открыть мини-апп.
bot.on('message:photo', (ctx) =>
  ctx.reply(
    'Чтобы обработать фото, открой мини-апп и загрузи его там:',
    { reply_markup: openAppKeyboard },
  ),
);

// Данные, которые мини-апп отправляет через WebApp.sendData() (для будущих фич)
bot.on('message:web_app_data', async (ctx) => {
  const payload = ctx.message.web_app_data.data;
  console.log('web_app_data:', payload);
  await ctx.reply('Получили данные из мини-аппа ✅');
});

// Глобальный error-handler
bot.catch((err) => {
  console.error('Bot error:', err);
});

async function main() {
  if (WEBHOOK_URL) {
    // Production: webhook через HTTP-сервер (Railway)
    await bot.api.setWebhook(WEBHOOK_URL, {
      secret_token: WEBHOOK_SECRET || undefined,
      drop_pending_updates: true,
    });
    console.log('Webhook set to', WEBHOOK_URL);

    const handle = webhookCallback(bot, 'std/http', {
      secretToken: WEBHOOK_SECRET || undefined,
    });

    const server = createServer(async (req, res) => {
      if (req.url === '/webhook' && req.method === 'POST') {
        try {
          const response = await handle(
            new Request(`http://localhost${req.url}`, {
              method: req.method,
              headers: req.headers as HeadersInit,
              body: await streamToString(req),
            }),
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch (err) {
          console.error(err);
          res.writeHead(500);
          res.end('error');
        }
        return;
      }
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('ok');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(PORT, () => console.log(`Bot listening on :${PORT}`));
  } else {
    // Dev: long polling
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log('Long polling…');
    await bot.start();
  }
}

async function streamToString(req: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// bot/index.js
// Головний файл бота: авторизація адміна, реєстрація сцен (Stage) та
// обробників головного меню. Бот — це і є вся адмін-панель сервісу.

const { Telegraf, Scenes, session } = require('telegraf');
const { items, schedule } = require('../db/queries');
const { mainMenu, itemsListKeyboard } = require('./keyboards');

const addItemScene = require('./scenes/addItemScene');
const editItemScene = require('./scenes/editItemScene');
const deleteItemScene = require('./scenes/deleteItemScene');
const mediaScene = require('./scenes/mediaScene');
const scheduleScene = require('./scenes/scheduleScene');

function createBot(botToken, adminChatId) {
  const bot = new Telegraf(botToken);
  const stage = new Scenes.Stage([addItemScene, editItemScene, deleteItemScene, mediaScene, scheduleScene]);

  bot.use(session());

  // --- Жорстке обмеження доступу тільки для ADMIN_CHAT_ID ---
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (String(fromId) !== String(adminChatId)) {
      if (ctx.updateType === 'message') {
        await ctx.reply('⛔ Доступ заборонено. Цей бот приватний.');
      }
      return; // не пропускаємо запит далі
    }
    return next();
  });

  bot.use(stage.middleware());

  bot.start(async (ctx) => {
    await ctx.reply(
      '👋 Вітаю в адмін-панелі бронювання!\nОберіть дію:',
      mainMenu()
    );
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply('Головне меню:', mainMenu());
  });

  bot.command('cancel', async (ctx) => {
    if (ctx.scene?.current) await ctx.scene.leave();
    await ctx.reply('Скасовано. Головне меню:', mainMenu());
  });

  // --- Головне меню ---
  bot.action('menu_back', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.scene?.current) await ctx.scene.leave();
    await ctx.reply('Головне меню:', mainMenu());
  });

  bot.action('menu_list', async (ctx) => {
    await ctx.answerCbQuery();
    const list = items.getAll();
    if (list.length === 0) {
      await ctx.reply('Карток поки немає.', mainMenu());
      return;
    }
    const lines = list.map((i) =>
      `#${i.id} ${i.name_cz} / ${i.name_en} — ${i.is_active ? '🟢 активна' : '🔴 вимкнена'}`
    );
    await ctx.reply(lines.join('\n'), mainMenu());
  });

  bot.action('menu_add', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('addItem');
  });

  bot.action('menu_edit', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('editItem');
  });

  bot.action('menu_delete', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('deleteItem');
  });

  bot.action('menu_media', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('media');
  });

  bot.action('menu_schedule', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('schedule');
  });

  // --- Підтвердження / відхилення заявок клієнтів із сайту ---
  bot.action(/^confirm_booking_(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const entry = schedule.getById(id);
    if (!entry) {
      await ctx.answerCbQuery('Заявку не знайдено (можливо, вже оброблена).');
      return;
    }
    schedule.updateStatus(id, 'booked');
    await ctx.answerCbQuery('Підтверджено ✅');
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ ПІДТВЕРДЖЕНО`);
  });

  bot.action(/^reject_booking_(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const entry = schedule.getById(id);
    if (!entry) {
      await ctx.answerCbQuery('Заявку не знайдено (можливо, вже оброблена).');
      return;
    }
    schedule.delete(id); // звільняємо слот повністю
    await ctx.answerCbQuery('Відхилено ❌');
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ ВІДХИЛЕНО (час звільнено)`);
  });

  bot.catch((err, ctx) => {
    console.error(`Помилка бота для ${ctx.updateType}:`, err);
  });

  return bot;
}

module.exports = createBot;

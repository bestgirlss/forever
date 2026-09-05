// bot/scenes/scheduleScene.js
// Сцена керування графіком: заблокувати конкретний час, позначити вихідний
// день або переглянути й видалити наявні записи для картки.
// Реалізовано як BaseScene з ручним станом (ctx.scene.state), бо логіка
// розгалужується, а не йде лінійно крок-за-кроком.

const { Scenes, Markup } = require('telegraf');
const { items, schedule } = require('../../db/queries');
const { mainMenu } = require('../keyboards');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function actionMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⛔ Заблокувати конкретний час', 'sched_book')],
    [Markup.button.callback('🚫 Позначити вихідний день', 'sched_dayoff')],
    [Markup.button.callback('📋 Переглянути / видалити записи', 'sched_view')],
    [Markup.button.callback('⬅️ Назад у меню', 'menu_back')],
  ]);
}

function formatEntry(row) {
  if (row.status === 'day_off') return `🚫 ${row.date} — вихідний день`;
  const who = row.client_name ? ` (${row.client_name})` : ' (додано вручну)';
  const label = row.status === 'pending' ? '⏳ очікує' : '✅ заброньовано';
  return `${label} ${row.date} ${row.start_time} на ${row.duration_minutes} хв${who}`;
}

const scheduleScene = new Scenes.BaseScene('schedule');

scheduleScene.enter(async (ctx) => {
  const list = items.getAll();
  if (list.length === 0) {
    await ctx.reply('Наразі немає жодної картки. Спочатку додайте нову.', mainMenu());
    return ctx.scene.leave();
  }
  ctx.scene.state = {};
  const buttons = list.map((item) => [
    Markup.button.callback(`${item.name_cz} / ${item.name_en} (ID ${item.id})`, `schedpick_${item.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
  await ctx.reply('Оберіть картку для керування графіком:', Markup.inlineKeyboard(buttons));
});

scheduleScene.action('menu_back', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.leave();
});

scheduleScene.action(/^schedpick_(\d+)$/, async (ctx) => {
  const itemId = Number(ctx.match[1]);
  const item = items.getById(itemId);
  if (!item) {
    await ctx.answerCbQuery('Не знайдено');
    return ctx.scene.leave();
  }
  ctx.scene.state.itemId = itemId;
  ctx.scene.state.stage = null;
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `Картка: *${item.name_cz} / ${item.name_en}*\nЩо зробити?`,
    { parse_mode: 'Markdown', ...actionMenu() }
  );
});

scheduleScene.action('sched_book', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state.stage = 'book_date';
  await ctx.editMessageText('Введіть дату у форматі РРРР-ММ-ДД (наприклад 2026-09-15):');
});

scheduleScene.action('sched_dayoff', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.state.stage = 'dayoff_date';
  await ctx.editMessageText('Введіть дату вихідного дня у форматі РРРР-ММ-ДД:');
});

scheduleScene.action('sched_view', async (ctx) => {
  await ctx.answerCbQuery();
  const itemId = ctx.scene.state.itemId;
  const rows = schedule.getByItem(itemId).slice(0, 20);
  if (rows.length === 0) {
    await ctx.editMessageText('Записів немає.', actionMenu());
    return;
  }
  const buttons = rows.map((row) => [
    Markup.button.callback(`🗑 ${formatEntry(row)}`, `schedentry_del_${row.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Назад', `schedpick_${itemId}`)]);
  await ctx.editMessageText('Останні 20 записів (натисніть, щоб видалити):', Markup.inlineKeyboard(buttons));
});

scheduleScene.action(/^schedentry_del_(\d+)$/, async (ctx) => {
  const entryId = Number(ctx.match[1]);
  schedule.delete(entryId);
  await ctx.answerCbQuery('Видалено');
  const itemId = ctx.scene.state.itemId;
  const rows = schedule.getByItem(itemId).slice(0, 20);
  if (rows.length === 0) {
    await ctx.editMessageText('Записів більше немає.', actionMenu());
    return;
  }
  const buttons = rows.map((row) => [
    Markup.button.callback(`🗑 ${formatEntry(row)}`, `schedentry_del_${row.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Назад', `schedpick_${itemId}`)]);
  await ctx.editMessageText('Останні 20 записів (натисніть, щоб видалити):', Markup.inlineKeyboard(buttons));
});

scheduleScene.on('text', async (ctx) => {
  const state = ctx.scene.state || {};
  const itemId = state.itemId;
  if (!itemId) {
    await ctx.reply('Спочатку оберіть картку через меню.');
    return;
  }

  const text = ctx.message.text.trim();

  if (state.stage === 'dayoff_date') {
    if (!DATE_RE.test(text)) {
      await ctx.reply('⚠️ Невірний формат. Введіть дату як РРРР-ММ-ДД.');
      return;
    }
    schedule.create({ itemId, date: text, status: 'day_off' });
    await ctx.reply(`🚫 ${text} позначено як вихідний день.`, actionMenu());
    state.stage = null;
    return;
  }

  if (state.stage === 'book_date') {
    if (!DATE_RE.test(text)) {
      await ctx.reply('⚠️ Невірний формат. Введіть дату як РРРР-ММ-ДД.');
      return;
    }
    state.date = text;
    state.stage = 'book_time';
    await ctx.reply('Введіть час початку у форматі ГГ:ХХ (наприклад 14:30):');
    return;
  }

  if (state.stage === 'book_time') {
    if (!TIME_RE.test(text)) {
      await ctx.reply('⚠️ Невірний формат. Введіть час як ГГ:ХХ.');
      return;
    }
    state.time = text;
    state.stage = 'book_duration';
    await ctx.reply('Введіть тривалість у хвилинах (наприклад 60):');
    return;
  }

  if (state.stage === 'book_duration') {
    const duration = parseInt(text, 10);
    if (isNaN(duration) || duration <= 0) {
      await ctx.reply('⚠️ Введіть додатне число хвилин.');
      return;
    }
    if (!schedule.isSlotAvailable(itemId, state.date, state.time, duration)) {
      await ctx.reply('⚠️ Цей час перетинається з уже існуючим записом. Спробуйте інший.');
      state.stage = null;
      return;
    }
    schedule.create({
      itemId, date: state.date, startTime: state.time, durationMinutes: duration, status: 'booked',
    });
    await ctx.reply(
      `✅ Заблоковано ${state.date} ${state.time} на ${duration} хв.`,
      actionMenu()
    );
    state.stage = null;
    return;
  }

  await ctx.reply('Оберіть дію через кнопки вище.');
});

module.exports = scheduleScene;

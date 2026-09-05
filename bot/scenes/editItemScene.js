// bot/scenes/editItemScene.js
// Сцена редагування картки: вибір картки -> вибір поля -> нове значення.

const { Scenes, Markup } = require('telegraf');
const { items } = require('../../db/queries');
const { mainMenu } = require('../keyboards');

const FIELD_LABELS = {
  name_cz: 'Назва (CZ)',
  name_en: 'Назва (EN)',
  description_cz: 'Опис (CZ)',
  description_en: 'Опис (EN)',
  services_cz: 'Послуги (CZ)',
  services_en: 'Послуги (EN)',
  whatsapp_number: 'WhatsApp номер',
  default_duration_minutes: 'Тривалість за замовч. (хв)',
};

function fieldsKeyboard(itemId) {
  const rows = Object.entries(FIELD_LABELS).map(([key, label]) => [
    Markup.button.callback(label, `editfield_${itemId}_${key}`),
  ]);
  rows.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
  return Markup.inlineKeyboard(rows);
}

const editItemScene = new Scenes.WizardScene(
  'editItem',
  // Крок 0: показуємо список карток для вибору
  async (ctx) => {
    const list = items.getAll();
    if (list.length === 0) {
      await ctx.reply('Наразі немає жодної картки. Спочатку додайте нову.', mainMenu());
      return ctx.scene.leave();
    }
    const buttons = list.map((item) => [
      Markup.button.callback(`${item.name_cz} / ${item.name_en} (ID ${item.id})`, `pickitem_${item.id}`),
    ]);
    buttons.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
    await ctx.reply('Оберіть картку для редагування:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  // Крок 1: обробляємо вибір картки, показуємо поля
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    if (data === 'menu_back') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }
    const itemId = Number(data.replace('pickitem_', ''));
    const item = items.getById(itemId);
    if (!item) {
      await ctx.answerCbQuery('Картку не знайдено');
      return ctx.scene.leave();
    }
    ctx.wizard.state.itemId = itemId;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Редагування: *${item.name_cz} / ${item.name_en}*\n\nЯке поле змінити?`,
      { parse_mode: 'Markdown', ...fieldsKeyboard(itemId) }
    );
    return ctx.wizard.next();
  },
  // Крок 2: обробляємо вибір поля, просимо нове значення
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    if (data === 'menu_back') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }
    const [, itemIdStr, field] = data.match(/^editfield_(\d+)_(.+)$/) || [];
    if (!field) {
      await ctx.answerCbQuery('Помилка');
      return;
    }
    ctx.wizard.state.field = field;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `Введіть нове значення для «${FIELD_LABELS[field]}»:\n` +
      (field.startsWith('services_') ? '(перелік через кому)' : '')
    );
    return ctx.wizard.next();
  },
  // Крок 3: зберігаємо нове значення
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Будь ласка, надішліть текстове значення.');
      return;
    }
    const { itemId, field } = ctx.wizard.state;
    let value = ctx.message.text.trim();

    if (field === 'services_cz' || field === 'services_en') {
      value = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'default_duration_minutes') {
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) {
        await ctx.reply('⚠️ Введіть додатне число хвилин.');
        return;
      }
      value = num;
    }

    const updated = items.updateField(itemId, field, value);
    await ctx.reply(
      `✅ Оновлено «${FIELD_LABELS[field]}» для *${updated.name_cz} / ${updated.name_en}*`,
      { parse_mode: 'Markdown', ...mainMenu() }
    );
    return ctx.scene.leave();
  }
);

module.exports = editItemScene;

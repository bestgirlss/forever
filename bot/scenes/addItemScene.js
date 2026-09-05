// bot/scenes/addItemScene.js
// Покроковий wizard додавання нової картки (фахівця/об'єкта).
// На кожному кроці можна ввести "-", щоб залишити поле порожнім.

const { Scenes, Markup } = require('telegraf');
const { items } = require('../../db/queries');
const { mainMenu } = require('../keyboards');

const STEP_PROMPTS = [
  '📝 Введіть *назву картки чеською*:',
  '📝 Введіть *назву картки англійською*:',
  '📄 Введіть *опис чеською* (або "-" щоб пропустити):',
  '📄 Введіть *опис англійською* (або "-" щоб пропустити):',
  '🛠 Введіть *список послуг чеською* через кому (наприклад: Стрижка, Манікюр):',
  '🛠 Введіть *список послуг англійською* через кому:',
  '📱 Введіть *номер WhatsApp* у форматі міжнародного номера без "+" (наприклад: 420123456789):',
  '⏱ Введіть *тривалість одного бронювання за замовчуванням* у хвилинах (наприклад: 60):',
];

const FIELD_KEYS = [
  'name_cz', 'name_en', 'description_cz', 'description_en',
  'services_cz', 'services_en', 'whatsapp_number', 'default_duration_minutes',
];

function clean(text) {
  return text.trim() === '-' ? '' : text.trim();
}

const addItemScene = new Scenes.WizardScene(
  'addItem',
  async (ctx) => {
    ctx.wizard.state.data = {};
    await ctx.reply(STEP_PROMPTS[0], { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },
  ...FIELD_KEYS.map((fieldKey, index) => async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('Будь ласка, надішліть текстове повідомлення.');
      return;
    }
    if (ctx.message.text === '/cancel') {
      await ctx.reply('Скасовано.', mainMenu());
      return ctx.scene.leave();
    }

    const value = clean(ctx.message.text);

    if (fieldKey === 'default_duration_minutes') {
      const num = parseInt(value, 10);
      if (!value || isNaN(num) || num <= 0) {
        await ctx.reply('⚠️ Введіть додатне число хвилин, наприклад 60.');
        return;
      }
      ctx.wizard.state.data[fieldKey] = num;
    } else if (fieldKey === 'services_cz' || fieldKey === 'services_en') {
      ctx.wizard.state.data[fieldKey] = value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    } else {
      ctx.wizard.state.data[fieldKey] = value;
    }

    const nextIndex = index + 1;
    if (nextIndex < STEP_PROMPTS.length) {
      await ctx.reply(STEP_PROMPTS[nextIndex], { parse_mode: 'Markdown' });
      return ctx.wizard.next();
    }

    // Останній крок — зберігаємо в БД
    const created = items.create(ctx.wizard.state.data);
    await ctx.reply(
      `✅ Картку створено!\n\n*${created.name_cz} / ${created.name_en}*\nID: ${created.id}\n\n` +
      `Тепер можете додати фото/відео через меню «🖼 Керувати медіа».`,
      { parse_mode: 'Markdown', ...mainMenu() }
    );
    return ctx.scene.leave();
  })
);

module.exports = addItemScene;

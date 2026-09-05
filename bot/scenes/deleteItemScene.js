// bot/scenes/deleteItemScene.js
// Сцена видалення картки з підтвердженням (каскадно чистить медіа й графік).

const { Scenes, Markup } = require('telegraf');
const { items } = require('../../db/queries');
const { mainMenu } = require('../keyboards');

const deleteItemScene = new Scenes.WizardScene(
  'deleteItem',
  async (ctx) => {
    const list = items.getAll();
    if (list.length === 0) {
      await ctx.reply('Наразі немає жодної картки для видалення.', mainMenu());
      return ctx.scene.leave();
    }
    const buttons = list.map((item) => [
      Markup.button.callback(`${item.name_cz} / ${item.name_en} (ID ${item.id})`, `delpick_${item.id}`),
    ]);
    buttons.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
    await ctx.reply('Оберіть картку для видалення:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    if (data === 'menu_back') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }
    const itemId = Number(data.replace('delpick_', ''));
    const item = items.getById(itemId);
    if (!item) {
      await ctx.answerCbQuery('Не знайдено');
      return ctx.scene.leave();
    }
    ctx.wizard.state.itemId = itemId;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `⚠️ Ви впевнені, що хочете видалити *${item.name_cz} / ${item.name_en}*?\n` +
      `Це також видалить усі його фото/відео та записи графіку. Дію не можна скасувати.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[
          Markup.button.callback('✅ Так, видалити', 'delconfirm_yes'),
          Markup.button.callback('❌ Скасувати', 'delconfirm_no'),
        ]]),
      }
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    await ctx.answerCbQuery();
    if (ctx.callbackQuery.data === 'delconfirm_yes') {
      items.delete(ctx.wizard.state.itemId);
      await ctx.editMessageText('🗑 Картку видалено.');
      await ctx.reply('Готово.', mainMenu());
    } else {
      await ctx.editMessageText('Скасовано.');
      await ctx.reply('Ок, картку не видалено.', mainMenu());
    }
    return ctx.scene.leave();
  }
);

module.exports = deleteItemScene;

// bot/scenes/mediaScene.js
// Сцена керування медіа: адмін обирає картку, потім просто надсилає боту
// фото/відео одне за одним — кожне автоматично зберігається у public/uploads
// і прив'язується до картки. Кнопка "Готово" завершує сцену.

const fs = require('fs');
const path = require('path');
const { Scenes, Markup } = require('telegraf');
const { items, media } = require('../../db/queries');
const { mainMenu } = require('../keyboards');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

function doneKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', 'media_done')]]);
}

async function downloadTelegramFile(ctx, fileId, destPath) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href || fileLink);
  if (!response.ok) throw new Error(`Не вдалося завантажити файл: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}

const mediaScene = new Scenes.WizardScene(
  'media',
  // Крок 0: вибір картки
  async (ctx) => {
    const list = items.getAll();
    if (list.length === 0) {
      await ctx.reply('Наразі немає жодної картки. Спочатку додайте нову.', mainMenu());
      return ctx.scene.leave();
    }
    const buttons = list.map((item) => [
      Markup.button.callback(`${item.name_cz} / ${item.name_en} (ID ${item.id})`, `mediapick_${item.id}`),
    ]);
    buttons.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
    await ctx.reply('Оберіть картку, до якої додати медіа:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  // Крок 1: очікуємо фото/відео, поки адмін не натисне "Готово"
  async (ctx) => {
    // Вибір картки (перший заход у цей крок)
    if (ctx.callbackQuery && ctx.callbackQuery.data.startsWith('mediapick_')) {
      const itemId = Number(ctx.callbackQuery.data.replace('mediapick_', ''));
      const item = items.getById(itemId);
      if (!item) {
        await ctx.answerCbQuery('Не знайдено');
        return ctx.scene.leave();
      }
      ctx.wizard.state.itemId = itemId;
      fs.mkdirSync(path.join(UPLOADS_ROOT, String(itemId)), { recursive: true });
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `Надсилайте фото або відео для *${item.name_cz} / ${item.name_en}*.\n` +
        `Кожне надіслане медіа автоматично додається до каруселі. Натисніть «Готово», коли завершите.`,
        { parse_mode: 'Markdown', ...doneKeyboard() }
      );
      return; // залишаємось на цьому ж кроці
    }

    // Натиснуто "Готово"
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'media_done') {
      await ctx.answerCbQuery();
      await ctx.editMessageText('✅ Медіа збережено.');
      await ctx.reply('Готово.', mainMenu());
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery && ctx.callbackQuery.data === 'menu_back') {
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }

    const itemId = ctx.wizard.state.itemId;
    if (!itemId) return; // ще не обрали картку

    // Обробка фото
    if (ctx.message?.photo) {
      try {
        const largest = ctx.message.photo[ctx.message.photo.length - 1];
        const fileName = `${Date.now()}_${largest.file_unique_id}.jpg`;
        const destPath = path.join(UPLOADS_ROOT, String(itemId), fileName);
        await downloadTelegramFile(ctx, largest.file_id, destPath);
        media.add(itemId, 'photo', `uploads/${itemId}/${fileName}`);
        await ctx.reply('📷 Фото додано. Надсилайте ще або натисніть «Готово».', doneKeyboard());
      } catch (err) {
        console.error(err);
        await ctx.reply('⚠️ Не вдалося зберегти фото. Спробуйте ще раз.');
      }
      return;
    }

    // Обробка відео
    if (ctx.message?.video) {
      try {
        const video = ctx.message.video;
        const ext = path.extname(video.file_name || '') || '.mp4';
        const fileName = `${Date.now()}_${video.file_unique_id}${ext}`;
        const destPath = path.join(UPLOADS_ROOT, String(itemId), fileName);
        await downloadTelegramFile(ctx, video.file_id, destPath);
        media.add(itemId, 'video', `uploads/${itemId}/${fileName}`);
        await ctx.reply('🎥 Відео додано. Надсилайте ще або натисніть «Готово».', doneKeyboard());
      } catch (err) {
        console.error(err);
        await ctx.reply('⚠️ Не вдалося зберегти відео. Спробуйте ще раз.');
      }
      return;
    }

    await ctx.reply('Надішліть фото або відео, або натисніть «Готово».', doneKeyboard());
  }
);

module.exports = mediaScene;

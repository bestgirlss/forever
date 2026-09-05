// bot/keyboards.js
// Побудовники inline-клавіатур, використовуються і в головному меню, і в сценах.

const { Markup } = require('telegraf');

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Список карток', 'menu_list')],
    [Markup.button.callback('➕ Додати картку', 'menu_add')],
    [Markup.button.callback('✏️ Редагувати картку', 'menu_edit')],
    [Markup.button.callback('🗑 Видалити картку', 'menu_delete')],
    [Markup.button.callback('🖼 Керувати медіа', 'menu_media')],
    [Markup.button.callback('📅 Керувати графіком', 'menu_schedule')],
  ]);
}

function itemsListKeyboard(items, actionPrefix) {
  const buttons = items.map((item) => [
    Markup.button.callback(`${item.name_cz} / ${item.name_en}`, `${actionPrefix}_${item.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Назад у меню', 'menu_back')]);
  return Markup.inlineKeyboard(buttons);
}

function confirmKeyboard(yesAction, noAction) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Так', yesAction),
      Markup.button.callback('❌ Ні', noAction),
    ],
  ]);
}

function backKeyboard(action = 'menu_back') {
  return Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад у меню', action)]]);
}

module.exports = { mainMenu, itemsListKeyboard, confirmKeyboard, backKeyboard };

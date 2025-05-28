import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const mainBotToken = process.env.MAIN_BOT_TOKEN;
const clientBotToken = process.env.CLIENT_BOT_TOKEN;
const clientChatIds = process.env.CLIENT_CHAT_IDS.split(',').map(id => id.trim());

const mainBot = new TelegramBot(mainBotToken, { polling: true });
const clientBot = new TelegramBot(clientBotToken);

const SERVICES = [
  'Telegram-боты',
  'Веб-сайты',
  'Веб-приложения',
  'Мобильные приложения',
  'Продвижение'
];

const users = new Map();

mainBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users.set(chatId, {});
  mainBot.sendMessage(chatId, 'Добро пожаловать! Введите ваше имя и фамилию:');
});

mainBot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = users.get(chatId);
  const text = msg.text;

  if (!user || msg.text.startsWith('/start')) return;

  if (!user.name) {
    user.name = text;
    mainBot.sendMessage(chatId, 'Введите номер телефона:');
  } else if (!user.phone) {
    user.phone = text;
    mainBot.sendMessage(chatId, 'Введите адрес электронной почты:');
  } else if (!user.email) {
    user.email = text;

    const buttons = SERVICES.map(service => ([{
      text: service,
      callback_data: `service:${service}`
    }]));
    buttons.push([{ text: 'Другая услуга', callback_data: 'otherService' }]);

    mainBot.sendMessage(chatId, 'Выберите тип сервиса:', {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  } else if (user.awaitingManualService) {
    user.service = text;
    user.awaitingManualService = false;
    mainBot.sendMessage(chatId, 'Напишите краткое описание проекта (TZ), если хотите.\nИли нажмите «Объясню по звонку».', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Объясню по звонку', callback_data: 'callInstead' }
        ]]
      }
    });
  } else if (user.service && !user.tz) {
    user.tz = text;
    sendToClientBot(chatId, user);
  }
});

mainBot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const user = users.get(chatId);
  const data = query.data;

  if (!user) return;

  if (data.startsWith('service:')) {
    user.service = data.split(':')[1];
    mainBot.sendMessage(chatId, 'Напишите краткое описание проекта (TZ), если хотите.\nИли нажмите «Объясню по звонку».', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Объясню по звонку', callback_data: 'callInstead' }
        ]]
      }
    });
  } else if (data === 'otherService') {
    user.awaitingManualService = true;
    mainBot.sendMessage(chatId, 'Пожалуйста, напишите ваш тип сервиса вручную:');
  } else if (data === 'callInstead') {
    user.tz = '[Клиент объяснит по звонку]';
    sendToClientBot(chatId, user);
  }
});

function sendToClientBot(chatId, user) {
  const message = `
📥 Новая заявка от клиента:

👤 Имя: ${user.name}
📞 Телефон: ${user.phone}
📧 Email: ${user.email}
🛠️ Сервис: ${user.service}
📄 TZ: ${user.tz || 'не указано'}
  `;

  mainBot.sendMessage(chatId, 'Спасибо! Ваша заявка принята. Мы скоро с вами свяжемся.');

  // Bir nechta chat_id ga yuborish
  clientChatIds.forEach(id => {
    clientBot.sendMessage(id, message);
  });

  users.delete(chatId);
}

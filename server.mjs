import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const mainBotToken = process.env.MAIN_BOT_TOKEN;
const clientBotToken = process.env.CLIENT_BOT_TOKEN;
const clientChatIds = process.env.CLIENT_CHAT_IDS.split(',').map(id => id.trim());

const mainBot = new TelegramBot(mainBotToken, { polling: true });
const clientBot = new TelegramBot(clientBotToken);

const SERVICE_KEYS = {
  bots: 'Telegram-боты',
  websites: 'Веб-сайты',
  webapps: 'Веб-приложения',
  mobileapps: 'Мобильные приложения',
  marketing: 'Продвижение',
  tg_subs: 'Сбор живых подписчиков в Telegram-канал'
};

const SERVICE_DETAILS = {
  'Telegram-боты': [
    { question: 'Какую задачу должен выполнять бот?', options: ['Регистрация клиентов', 'Заказ услуг', 'FAQ', 'Другое'] },
    { question: 'Нужна ли интеграция с базой данных?', options: ['Да', 'Нет'] },
    { question: 'Нужно ли подключение оплаты в боте?', options: ['Да', 'Нет'] }
  ],
  'Веб-сайты': [
    { question: 'Какой тип сайта вам нужен?', options: ['Лендинг', 'Корпоративный', 'Блог', 'Другое'] },
    { question: 'Нужна ли CMS?', options: ['Да', 'Нет'] }
  ],
  'Веб-приложения': [
    { question: 'Какую задачу должно решать приложение?', options: ['CRM', 'ERP', 'LMS', 'Другое'] },
    { question: 'Какие технологии планируются?', options: ['API', 'WebSocket', 'AI', 'Другое'] }
  ],
  'Мобильные приложения': [
    { question: 'Для каких платформ?', options: ['iOS', 'Android', 'Обе'] },
    { question: 'Нужны ли push-уведомления?', options: ['Да', 'Нет'] }
  ],
  'Продвижение': [
    { question: 'Какие каналы интересуют?', options: ['SEO', 'SMM', 'Контекст', 'Все'] },
    { question: 'Целевая аудитория?', options: ['B2B', 'B2C', 'Не знаю'] }
  ],
  'Сбор живых подписчиков в Telegram-канал': [
    { question: 'Сколько подписчиков нужно собрать?', options: ['До 500', '500-1000', '1000+'] },
    { question: 'Целевая аудитория?', options: ['Бизнес', 'Развлечение', 'IT', 'Другое'] },
    { question: 'Методы продвижения?', options: ['Таргет', 'Взаимопиар', 'Боты', 'Все'] }
  ]
};

const users = new Map();

mainBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users.set(chatId, { step: 'name' });
  mainBot.sendMessage(chatId, 'Здравствуйте! Введите ваше имя и фамилию:');
});

mainBot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = users.get(chatId);
  const text = msg.text;

  if (!user || msg.text.startsWith('/start')) return;

  switch (user.step) {
    case 'name':
      user.name = text;
      user.step = 'phone';
      mainBot.sendMessage(chatId, 'Введите номер телефона:');
      break;
    case 'phone':
      user.phone = text;
      user.step = 'email';
      mainBot.sendMessage(chatId, 'Введите адрес электронной почты:');
      break;
    case 'email':
      user.email = text;
      user.step = 'service';
      const buttons = Object.keys(SERVICE_KEYS).map(key => ([{
        text: SERVICE_KEYS[key],
        callback_data: `service:${key}`
      }]));
      buttons.push([{ text: 'Другая услуга', callback_data: 'otherService' }]);
      mainBot.sendMessage(chatId, 'Выберите тип сервиса:', {
        reply_markup: {
          inline_keyboard: buttons
        }
      });
      break;
    case 'awaitingManualService':
      user.service = text;
      user.step = 'tz';
      askServiceDetails(chatId, user);
      break;
    case 'finalTZ':
      user.tz += `\nДоп. описание: ${text}`;
      sendToClientBot(chatId, user);
      break;
  }
});

mainBot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const user = users.get(chatId);
  const data = query.data;

  if (!user) return;

  if (data.startsWith('service:')) {
    const key = data.split(':')[1];
    user.service = SERVICE_KEYS[key];
    user.step = 'tz';
    askServiceDetails(chatId, user);
  } else if (data === 'otherService') {
    user.step = 'awaitingManualService';
    mainBot.sendMessage(chatId, 'Пожалуйста, напишите ваш тип сервиса вручную:');
  } else if (data === 'callInstead') {
    user.tz += '\n[Клиент объяснит по звонку]';
    sendToClientBot(chatId, user);
  } else if (data.startsWith('detail:')) {
    const answer = data.replace('detail:', '');
    user.tz = user.tz || '';
    user.tz += `\nОтвет: ${answer}`;
    const questions = SERVICE_DETAILS[user.service];
    if (user.tzStep < questions.length - 1) {
      user.tzStep++;
      sendDetailQuestion(chatId, user);
    } else {
      user.step = 'finalTZ';
      mainBot.sendMessage(chatId, 'Если хотите, опишите ваш проект подробнее. Это необязательно.', {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Объясню по звонку', callback_data: 'callInstead' }
          ]]
        }
      });
    }
  }
});

function askServiceDetails(chatId, user) {
  const questions = SERVICE_DETAILS[user.service];
  if (questions && questions.length > 0) {
    user.tzStep = 0;
    sendDetailQuestion(chatId, user);
  } else {
    mainBot.sendMessage(chatId, 'Напишите краткое описание проекта (TZ), если хотите.\nИли нажмите «Объясню по звонку».', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Объясню по звонку', callback_data: 'callInstead' }
        ]]
      }
    });
  }
}

function sendDetailQuestion(chatId, user) {
  const step = user.tzStep;
  const questions = SERVICE_DETAILS[user.service];
  const q = questions[step];
  const options = q.options.map(option => [{ text: option, callback_data: `detail:${option}` }]);
  mainBot.sendMessage(chatId, q.question, {
    reply_markup: {
      inline_keyboard: options
    }
  });
}

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

  clientChatIds.forEach(id => {
    clientBot.sendMessage(id, message).catch(err => {
      console.error(`Ошибка отправки клиенту (${id}):`, err.message);
    });
  });

  users.delete(chatId);
}
import type { WaitForOptions } from 'puppeteer';
export type Channels = 'CORE' | 'BROWSER' | 'CALC';

// конфиг mts
export const MTS_PORT: number = 5001;
export const MTS_PAY: string[] = ['BXSOp1iH56', 'G5XHNNpNKB', 'YdPDo4dzh5'];
export const MTS_PERC_MIN: number = -1;
export const MTS_PERC_MAX: number = 5;

// адрес на службы (mts, qiwi, yandex, payeer)
export const PAID_URL: string = 'http://198.244.148.197';
export const PAID_SECRET: string = 'm0nEy$ecrET';

// паника служба
export const PANIK_URL: string = 'http://198.244.148.197';
export const PANIK_PORT_BTC: number = 8012;
export const PANIK_PORT_USDT: number = 8022;

// ид тг куда отправлять уведомления
export const TG_ID: number = 6120899453;

// порт запуска на сервере (запросы по этому порту отправлять)
export const PORT: number = 8001;

// майл и пороль для входа в sky
export const EMAIL: string = 'bigboxspam@mail.ru';
export const PASSWORD: string = 'ytNQ7QcvX8';

// конфиг сделки
export const IS_VERIFIED: boolean = false;

// автоматическая отмена или открытие спора по истечению времени телефона
export const TIMER_PHONE: boolean = true;
export const TIME_DISPUTE_TIMER_PHONE: number = 900000;
export const DELAY_TIMER_PHONE: number = 1000;

// конфиг браузера
export const WAIT_TIMEOUT: WaitForOptions['timeout'] = 30000; // ожидание ответа страницы или других загрузок
export const WAIT_UNTIL: WaitForOptions['waitUntil'] = 'domcontentloaded'; // тип ожидания (см. в waitUntil puppeteer)
export const URL_MAIN: string = 'https://skycrypto.me/deals'; // ссылка проверка (если он находится тут значит надо авторизация), также ссылка начала авторизации
export const CNT_EVALUTE: number = 3;
export const DELAY_CNT: number = 5000;

// конфиг обновлений циклов
export const POLLING_DEALS: boolean = false;
export const POLLING_DEALS_BTC: boolean = true;
export const POLLING_DEALS_USDT: boolean = true;
export const DELAY_POLLING_DEALS: number = 10000;
export const POLLING_DEALS_LIMIT_BTC: number = 20;
export const POLLING_DEALS_LIMIT_USDT: number = 20;
export const DELAY_POLLING_DEALS_UPDATE: number = 5000;

// конфиг который меняется только от сюда и после перезагрузки (вы можете изменить через запрос, но данные будут браться от сюда)
export const DATA_PATH_REDIS_CONFIG: string = `sky-new:configs`;
export const DATA_PATH_REDIS_DEALS_CACHE: string = `sky-new:deals:cache`;
export const DATA_PATH_REDIS_PHONE: string = `sky-new:phone`;
export const URL_REDIS: string = 'redis://127.0.0.1:6379';
export const DB_REDIS: number = 0;

// данные для ввода в чат
export const PRE_PAY_MESSAGES_URL: string = `Здвравствуйте.через 1-2 минуты выдам реквезиты. Перевод только по выданным реквезитам . других реквезитов нет.`;
export const PRE_PAY_MESSAGES_CARD: string = `Здвравствуйте.через 1-2 минуты выдам реквезиты. Перевод только по выданным реквезитам . других реквезитов нет.`;
export const PRE_PAY_MESSAGES_LOGIN: string = `Здвравствуйте.через 1-2 минуты выдам реквезиты. Перевод только по выданным реквезитам . других реквезитов нет.`;
export const PRE_PAY_MESSAGES_QIWI: string = `Здвравствуйте.через 1-2 минуты выдам реквезиты. Перевод только по выданным реквезитам . других реквезитов нет.`;
export const PRE_PAY_MESSAGES_YANDEX: string = `Здвравствуйте.через 1-2 минуты выдам реквезиты. Перевод только по выданным реквезитам . других реквезитов нет.`;
export const PRE_PAY_MESSAGES_MTS: string = `Перевод только по выданным реквизитам. Других реквизитов нет.Пополнение через терминал только до 4000руб.`;
export const PRE_PAY_MESSAGES_OTHER: string = `Перевод только по выданным реквизитам. Других реквизитов нет.  !!автоплатежи не обрабатываем!! от ВТБ не принимаем оплату !!`;

// данные для ввода в реквизиты
export const PAY_MESSAGES_URL: string = `0000000. Оплата по счету. Ссылка для оплаты: {url}`;
export const PAY_MESSAGES_CARD: string = `Карта QIWI (без комиссии): {card} \r\nФорма оплаты: qiwi.com/payment/form/31873`;
export const PAY_MESSAGES_LOGIN: string = `Реквизиты: 0000000. Перевод по Никнейму:  {login}`;
export const PAY_MESSAGES_QIWI: string = `+7{number} только Qiwi, Без комментария.`;
export const PAY_MESSAGES_YANDEX: string = `https://yoomoney.ru/oplata/popolnenie-koshelka-qiwi?rapida_param1=+7{number}&netSum={amount}`;
export const PAY_MESSAGES_MTS: string = `ПОПОЛНЕНИЕ НОМЕРА ТЕЛЕФОНА. МТС: +7{number} пополнение с терминала запрещены`;
export const PAY_MESSAGES_OTHER: string = `+7{number} пополнять только с Qiwi`;

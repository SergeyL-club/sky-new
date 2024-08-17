import type { WaitForOptions } from 'puppeteer';
export type Channels = 'CORE' | 'BROWSER' | 'CALC';

// конфиг mts
export const MTS_PORT: number = 29980;
export const MTS_PAY: string = 'Bz8uYqXyPk';

// адрес на службы (mts, qiwi, yandex, payeer)
export const PAID_URL: string = 'http://145.239.95.220';
export const PAID_SECRET: string = 'm0nEy$ecrET';

// ид тг куда отправлять уведомления
export const TG_ID: number = 974047084;

// порт запуска на сервере (запросы по этому порту отправлять)
export const PORT: number = 13004;

// майл и пороль для входа в sky
export const EMAIL: string = 'nipici9440@acpeak.com';
export const PASSWORD: string = 'Myipad132';

// конфиг сделки
export const IS_VERIFIED: boolean = true;

// автоматическая отмена или открытие спора по истечению времени телефона
export const TIMER_PHONE: boolean = true;
export const TIME_DISPUTE_TIMER_PHONE: number = 1200000;
export const TIME_CANCEL_TIMER_PHONE: number = 1200000;
export const DELAY_TIMER_PHONE: number = 1000;

// конфиг браузера
export const WAIT_TIMEOUT: WaitForOptions['timeout'] = 60000; // ожидание ответа страницы или других загрузок
export const WAIT_UNTIL: WaitForOptions['waitUntil'] = 'networkidle2'; // тип ожидания (см. в waitUntil puppeteer)
export const URL_MAIN_AUTH: string = 'https://skycrypto.me'; // ссылка проверка (если он находится тут значит надо авторизация), также ссылка начала авторизации
export const URL_DEALS: string = 'https://skycrypto.me/deals'; // ссылка где находятся сделки
export const DELAY_EVENT_MIN: number = 50; // минимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_EVENT_MAX: number = 100; // максимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_AUTH: number = 10000; // ожидание автоматического перехода сайтом, переключение формы с поролем

// селекторы для авторизации (если список - 0:ru 1:en)
export const SELECTOR_INPUT_EMAIL: string = '::-p-xpath(//input[@name="email"])';
export const SELECTOR_INPUT_PASSWORD: string = '::-p-xpath(//input[@name="password"])';
export const SELECTOR_ERROR: [string, string] = ['::-p-xpath(//span[text()="Ошибка 404"])', '::-p-xpath(//span[text()="Error 404"])']; // селектор на ошибку 404
export const SELECTOR_AUTH_FORM: [string, string] = ['::-p-xpath(//button[text()="Вход"])', '::-p-xpath(//button[text()="Enter"])']; // селектор на вход в форму авторизации
export const SELECTOR_URL_AUTH: [string, string] = ['::-p-xpath(//a[text()="Войти"])', '::-p-xpath(//a[text()="Enter"])']; // селекторы на ссылку для открытия пароля в форме
export const SELECTOR_BTN_AUTH: [string, string] = ['::-p-xpath(//button[text()="Войти"])', '::-p-xpath(//button[text()="Enter"])']; // селекторы на кнопку входа уже в форме

// конфиг обновлений циклов
export const POLLING_DEALS: boolean = true;
export const POLLING_DEALS_BTC: boolean = true;
export const POLLING_DEALS_USDT: boolean = true;
export const DELAY_POLLING_DEALS: number = 10000;
export const POLLING_DEALS_LIMIT_BTC: number = 20;
export const POLLING_DEALS_LIMIT_USDT: number = 20;

// конфиг который меняется только от сюда и после перезагрузки (вы можете изменить через запрос, но данные будут браться от сюда)
export const DATA_PATH_REDIS_CONFIG: string = `sky:configs`;
export const DATA_PATH_REDIS_DEALS_CACHE: string = `sky:deals:cache`;
export const DATA_PATH_REDIS_PHONE: string = `sky:phone`;
export const URL_REDIS: string = 'redis://127.0.0.1:6379';
export const DB_REDIS: number = 0;

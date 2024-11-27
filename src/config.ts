import type { WaitForOptions } from 'puppeteer';
export type Channels = 'CORE' | 'BROWSER' | 'CALC';

// конфиг mts
export const MTS_PORT: number = 29980;
export const MTS_PAY: string[] = ['pcnOGGmbT', 'M7wEYcWleG'];

// конфиг alfa
export const ALFA_PORT: number = 29980;
export const ALFA_PAY: string[] = ['Dj1SxsLr8z', 'GGRIUPOQxf'];

// адрес на службы (mts, qiwi, yandex, payeer)
export const MTS_PAID_URL: string = 'http://145.239.95.220';
export const MTS_PAID_SECRET: string = 'm0nEy$ecrET';

// адрес на службы (mts, qiwi, yandex, payeer)
export const ALFA_PAID_URL: string = 'http://145.239.95.220';
export const ALFA_PAID_SECRET: string = 'm0nEy$ecrET';

// паника служба
export const PANIK_URL: string = 'http://145.239.95.220';
export const PANIK_PORT_BTC: number = 8014;
export const PANIK_PORT_USDT: number = 8014;

// ид тг куда отправлять уведомления
export const TG_ID: number = 280212417;

// порт запуска на сервере (запросы по этому порту отправлять)
export const PORT: number = 13004;

// майл и пороль для входа в sky
export const EMAIL: string = 'support@bizoninvest.com';
export const PASSWORD: string = 'fMwbh7XeXdTYNci';

// конфиг сделки
export const IS_VERIFIED: boolean = false;
export const TARGET_VERIFIED: string = "fd";
export const BLOCK_URL: string = "http://51.68.137.132:8014"

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

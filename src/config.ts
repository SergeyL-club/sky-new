import type { WaitForOptions } from 'puppeteer';

export type Channels = 'CORE' | 'BROWSER' | 'CALC';

// порт запуска на сервере (запросы по этому порту отправлять)
export const PORT: number = 13004;

// майл и пороль для входа в sky
export const EMAIL: string = 'support@bizoninvest.com';
export const PASSWORD: string = 'fMwbh7XeXdTYNci';

// конфиг главного потока

// конфиг браузера
export const WAIT_TIMEOUT: WaitForOptions['timeout'] = 60000; // ожидание ответа страницы или других загрузок
export const WAIT_UNTIL: WaitForOptions['waitUntil'] = 'networkidle2'; // тип ожидания (см. в waitUntil puppeteer)
export const URL_MAIN_AUTH: string = 'https://skycrypto.me'; // ссылка проверка (если он находится тут значит надо авторизация), также ссылка начала авторизации
export const URL_DEALS: string = 'https://skycrypto.me/deals'; // ссылка где находятся сделки
export const DELAY_EVENT_MIN: number = 50; // минимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_EVENT_MAX: number = 100; // максимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_AUTH: number = 2000; // ожидание автоматического перехода сайтом, переключение формы с поролем

// селекторы для авторизации (если список - 0:ru 1:en)
export const SELECTOR_INPUT_EMAIL: string = '::-p-xpath(//input[@name="email"])';
export const SELECTOR_INPUT_PASSWORD: string = '::-p-xpath(//input[@name="password"])';
export const SELECTOR_ERROR: [string, string] = ['::-p-xpath(//span[text()="Ошибка 404"])', '::-p-xpath(//span[text()="Error 404"])']; // селектор на ошибку 404
export const SELECTOR_AUTH_FORM: [string, string] = ['::-p-xpath(//button[text()="Вход"])', '::-p-xpath(//button[text()="Enter"])']; // селектор на вход в форму авторизации
export const SELECTOR_URL_AUTH: [string, string] = ['::-p-xpath(//a[text()="Войти"])', '::-p-xpath(//a[text()="Enter"])']; // селекторы на ссылку для открытия пароля в форме
export const SELECTOR_BTN_AUTH: [string, string] = ['::-p-xpath(//button[text()="Войти"])', '::-p-xpath(//button[text()="Enter"])']; // селекторы на кнопку входа уже в форме

// конфиг цикла deals
export const DELAY_UPDATE_DEALS: number = 10000; // начальная задержка цикла deals
export const IS_WHILE_DEALS: boolean = true; // начальное значение запуска цикла deals (true - работает, false - не работает)

// конфиг цикла keys
export const DELAY_UPDATE_KEYS: number = 1000; // начальная задержка цикла keys (сокет который дает значения для генерации auth key)
export const IS_WHILE_KEYS: boolean = true; // начальное значение запуска цикла keys (true - работает, false - не работает)

// конфиг цикла loop calc
export const DELAY_LOOP_CALC: number = 1000; // периодичность loop
export const IS_LOOP_CALC: boolean = true; // начальное значение запуска loop calc

// конфиг цикла loop browser
export const DELAY_LOOP_BROWSER: number = 1000; // периодичность loop
export const IS_LOOP_BROWSER: boolean = true; // начальное значение запуска loop browser

// конфиг цикла loop core (main)
export const DELAY_LOOP_CORE: number = 1000; // периодичность loop
export const IS_LOOP_CORE: boolean = true; // начальное значение запуска loop core

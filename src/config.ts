import type { WaitForOptions } from 'puppeteer';

// порт запуска на сервере (запросы по этому порту отправлять)
export const PORT = 13004;

// майл и пороль для входа в sky
export const EMAIL = 'support@bizoninvest.com';
export const PASSWORD = 'fMwbh7XeXdTYNci';

// конфиг браузера
export const WAIT_TIMEOUT: WaitForOptions['timeout'] = 60000; // ожидание ответа страницы или других загрузок
export const WAIT_UNTIL: WaitForOptions['waitUntil'] = 'networkidle2'; // тип ожидания (см. в waitUntil puppeteer)
export const URL_MAIN_AUTH = 'https://skycrypto.me'; // ссылка проверка (если он находится тут значит надо авторизация), также ссылка начала авторизации
export const URL_DEALS = 'https://skycrypto.me/deals';
export const DELAY_EVENT_MIN = 50; // минимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_EVENT_MAX = 100; // максимальная задержка действия (пример: клик, ожидание после действия)
export const DELAY_AUTH = 5000;

// селекторы для авторизации (если список - 0:ru 1:en)
export const SELECTOR_INPUT_EMAIL = '::-p-xpath(//input[@name="email"])';
export const SELECTOR_INPUT_PASSWORD = '::-p-xpath(//input[@name="password"])';
export const SELECTOR_ERROR = ['::-p-xpath(//span[text()="Ошибка 404"])', '::-p-xpath(//span[text()="Error 404"])']; // селектор на ошибку 404
export const SELECTOR_AUTH_FORM = ['::-p-xpath(//button[text()="Вход"])', '::-p-xpath(//button[text()="Enter"])']; // селектор на вход в форму авторизации
export const SELECTOR_URL_AUTH = ['::-p-xpath(//a[text()="Войти"])', '::-p-xpath(//a[text()="Enter"])']; // селекторы на ссылку для открытия пароля в форме
export const SELECTOR_BTN_AUTH = ['::-p-xpath(//button[text()="Войти"])', '::-p-xpath(//button[text()="Enter"])']; // селекторы на кнопку входа уже в форме

import type { Browser, ElementHandle, Page } from 'puppeteer';
import type { VanillaPuppeteer } from 'puppeteer-extra';
// import type { Remote } from 'comlink';
// import type WorkerServer from './server.js';
// import type WorkerRedis from './redis.js';

import stealsPlugin from 'puppeteer-extra-plugin-stealth';
import { delay, random } from '../utils/dateTime.js';
import { loggerBrowser } from '../utils/logger.js';
import { parentPort } from 'node:worker_threads';
import { PuppeteerExtra } from 'puppeteer-extra';
import * as CONFIG from '../config.js';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { expose } from 'comlink';
import md5 from 'md5';

type ServerCommands = 'server' | 'redis' | 'exit' | 'connect';
type WindowCustom = {
  keysSocketUpdate: (date: string) => void;
};

export type Keys = {
  [key: string]: string;
};

export type Params = {
  headless: boolean;
  args: string[];
  defaultViewport: {
    width: number;
    height: number;
  };
  ignoreDefaultArgs: string[];
  userDataDir: string;
};

export type ProxyData = {
  url: string;
  user: string;
  pass: string;
};

export type InputSet = {
  input: ElementHandle;
  text: string;
  page?: Page;
};

export type DetailsDeal = {
  amount: number;
  amount_currency: number;
  buyer: {
    currency: 'rub' | string;
    deals: {
      amount_currency: number;
      deals: number;
      dislikes: number;
      likes: number;
    };
    nickname: string;
    rating: number;
    verified: boolean;
  };
  lot: {
    id: string;
  };
  buyer_commission: number;
  confirmed_at: string;
  created_at: string;
  deal_id: number;
  dispute: {} | null;
  end_time: null;
  id: string;
  rate: number;
  requisite: string;
  state: 'proposed' | 'deleted' | 'paid';
  symbol: 'btc' | 'usdt';
  type: number;
  voted: boolean;
};

// local config in worker
const LOCAL_CONFIG = { ...CONFIG };

// channels
// let redis: Remote<WorkerRedis> | null = null;
// let server: Remote<WorkerServer> | null = null;

class WorkerBrowser {
  private static instance: WorkerBrowser;

  // init data
  private proxyParams: ProxyData | string;

  // local params
  private isReAuth: boolean;

  // browser data
  private keys: Keys;
  private authKey: string;
  private deals: Page | null;
  private browser: Browser | null;

  constructor() {
    this.proxyParams = '';
    this.isReAuth = false;
    this.browser = null;
    this.deals = null;
    this.authKey = '';
    this.keys = {};
    if (WorkerBrowser.instance) return WorkerBrowser.instance;
    WorkerBrowser.instance = this;
  }

  loop = () => {
    loggerBrowser.log('loop browser worker');
  };

  generateAuthKey = (keys?: Keys) => {
    const localKeys = keys ?? this.keys;
    const t = 'e' === localKeys['aKM'];
    let r = Object.keys(localKeys).sort();
    if (t) r = r.reverse();
    const o =
      r
        .map(function (t) {
          return localKeys[t];
        })
        .join('') + 'l';
    return md5(o);
  };

  initProxy = (proxy: string = '') => {
    if (proxy != '') {
      const info = new URL(proxy);
      this.proxyParams = {
        url: info.origin,
        user: info.username,
        pass: info.password,
      };
    }
  };

  initParams = () => {
    const params = {} as Params;
    if (process.argv.includes('--headless')) params['headless'] = true;
    else params['headless'] = !true;
    params['args'] = ['--no-sandbox', '--no-default-browser-check', ...(this.proxyParams && [`--proxy-server=${(<ProxyData>this.proxyParams).url}`])];
    params['defaultViewport'] = { width: 1100, height: 600 };
    params['ignoreDefaultArgs'] = ['--enable-automation'];
    params['userDataDir'] = `./user_data`;
    return params;
  };

  incPage = async (page: Page, url: string) => {
    loggerBrowser.info('Установка конфигурации страницы', `(${url})`);
    await page.setBypassCSP(true);
    if (typeof this.proxyParams != 'string')
      await page.authenticate({
        username: this.proxyParams.user,
        password: this.proxyParams.pass,
      });

    await page.evaluateOnNewDocument(`
			navigator.webkitGetUserMedia =
			navigator.mozGetUserMedia =
			navigator.getUserMedia =
			webkitRTCPeerConnection =
			RTCPeerConnection =
			MediaStreamTrack = undefined;
			if (navigator.mediaDevices)
				navigator.mediaDevices.getUserMedia = undefined;`);
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36');
  };

  injectStatic = async (page: Page) => {
    // await page.waitForNavigation({ timeout: LOCAL_CONFIG['WAIT_TIMEOUT'], waitUntil: LOCAL_CONFIG['WAIT_UNTIL'] });
    const files: string[] = readdirSync(resolve(import.meta.dirname, `../../statics`));

    for (let index = 0; index < files.length; index++) {
      const fileName = files[index];
      await page.addScriptTag({ path: resolve(import.meta.dirname, `../../statics/${fileName}`) });
    }
  };

  initPage = async (url: string) => {
    let page: Page | null = null;
    if (!this.browser) {
      loggerBrowser.warn('При создание page необходим browser, но он является null');
      return null;
    }
    page = await this.browser.newPage();
    await this.incPage(page, url);
    await this.reload(url, page);
    return page;
  };

  initBrowser = async () => {
    try {
      loggerBrowser.info('Установка конфигурации браузера');
      const params = this.initParams();

      // close old browser
      if (this.browser) await this.browser.close();
      const puppeteerExtra = new PuppeteerExtra(puppeteer as unknown as VanillaPuppeteer);
      puppeteerExtra.use(stealsPlugin());

      this.browser = await puppeteerExtra.launch(params);

      // set page deals
      const url = 'https://skycrypto.me/deals';
      let page = await this.initPage(url);
      if (!page) {
        loggerBrowser.error(new Error('Ошибка создания page'), 'Не удалось создать page deals');
        return false;
      }

      // check auth
      page = await this.checkAuth(page, url);
      if (!page) {
        loggerBrowser.error(new Error('Ошибка авторизации page'), 'Не удалось провести авторизацию page deals');
        return false;
      }

      // close 0 page
      loggerBrowser.log('Удаляем ненужную страницу');
      const pageNull = (await this.browser.pages())[0];
      await pageNull.close();

      // save page
      loggerBrowser.log('Сохранияем адрес ссылки на сделки');
      this.deals = page;

      // end
      loggerBrowser.info('Установка базовой конфигурации завершена');
      return true;
    } catch (error: unknown) {
      loggerBrowser.error(error, 'Ошибка без обработки (init browser)');
      return false;
    }
  };

  waitReAuth = (): Promise<boolean> =>
    new Promise((res) => {
      let cnt = 0;
      let isDelay = false;

      while (cnt < 250) {
        isDelay = true;
        delay(100).then(() => (isDelay = false));
        if (!this.isReAuth) {
          res(true);
          return;
        }
        if (!isDelay) cnt++;
      }
      res(false);
    });

  reload = async (url: string, page: Page, count = 1): Promise<void> => {
    try {
      await this.goto(page, 'about:blank');
      await this.goto(page, url);
    } catch (error: unknown) {
      if (count < 4) {
        loggerBrowser.warn({ err: error }, `Не удачная перезагрузка страницы (reload)`);
        return await this.reload(url, page, count + 1);
      }
      loggerBrowser.error(error, 'Окончательная ошибка перезагрузки страницы (reload)');
    }
  };

  goto = async (page: Page, url: string) => {
    await page.goto(url, { timeout: LOCAL_CONFIG['WAIT_TIMEOUT'], waitUntil: LOCAL_CONFIG['WAIT_UNTIL'] });
  };

  inputSet = async ({ input, page, text }: InputSet) => {
    try {
      input.focus();
      if (page) {
        await input.click({ clickCount: 3, delay: random(50, 100) });
        await delay(random(150, 200));
        await page.keyboard.press('Backspace');
      }

      if (text.length <= 25) await input.type(text, { delay: random(100, 150) });
      else await input.type(text);

      loggerBrowser.log(`Запись в input завершёна, text: ${text}`);
      return true;
    } catch (error: unknown) {
      loggerBrowser.warn({ err: error }, 'Ошибка при печати input');
      return false;
    }
  };

  checkAuth = async (page: Page, url = 'https://skycrypto.me/wallet') => {
    loggerBrowser.log(`Проверка авторизации (${url})`);
    let localPage: Page | null = page;

    if (this.isReAuth) {
      loggerBrowser.log('Ждём авторизации');
      await localPage.close();

      if (!(await this.waitReAuth())) {
        loggerBrowser.warn('Не должался авторизации (check auth)');
        return null;
      }
      localPage = await this.initPage(url);
      if (localPage) await this.goto(localPage, url);
      else {
        loggerBrowser.warn('Пустой page (check auth)');
        return null;
      }
    }

    const error = (await localPage.$(LOCAL_CONFIG['SELECTOR_ERROR'][0])) || (await localPage.$(LOCAL_CONFIG['SELECTOR_ERROR'][1])) || null;
    const checkMain = localPage.url() == LOCAL_CONFIG['URL_MAIN_AUTH'] || localPage.url() == `${LOCAL_CONFIG['URL_MAIN_AUTH']}/`;

    if (error || checkMain || localPage.url() != url) {
      this.isReAuth = true;
      loggerBrowser.log('Не авторизирован, попытка авторизироваться');
      await delay(random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']));
      if (!(await this.auth(localPage))) return null;
      loggerBrowser.log('Переходит на нужную ссылку');
      await this.goto(localPage, url);
      this.isReAuth = false;
    }

    loggerBrowser.log('Завершили проверку авторизации');

    await delay(random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']));
    return page;
  };

  auth = async (page: Page) => {
    loggerBrowser.log('Переход на главную страницу');
    await this.goto(page, LOCAL_CONFIG['URL_MAIN_AUTH']);

    const btnAuth = (await page.$(LOCAL_CONFIG['SELECTOR_AUTH_FORM'][0])) || (await page.$(LOCAL_CONFIG['SELECTOR_AUTH_FORM'][1])) || null;
    if (!btnAuth) {
      loggerBrowser.warn('Неудалось найти кнопку входа (главная страница)');
      return false;
    }
    await btnAuth.click({ delay: random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']) });

    let inputEmail = (await page.$(LOCAL_CONFIG['SELECTOR_INPUT_EMAIL'])) || null;
    let inputPassword = (await page.$(LOCAL_CONFIG['SELECTOR_INPUT_PASSWORD'])) || null;
    if (!inputEmail || !inputPassword) {
      const uriAuth = (await page.$(LOCAL_CONFIG['SELECTOR_URL_AUTH'][0])) || (await page.$(LOCAL_CONFIG['SELECTOR_URL_AUTH'][1])) || null;
      if (!uriAuth) {
        loggerBrowser.warn('Не было найдена "a" для открытия input password');
        return false;
      }
      await uriAuth.click({ delay: random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']) });
    }

    await delay(LOCAL_CONFIG['DELAY_AUTH']);
    inputEmail = (await page.$(LOCAL_CONFIG['SELECTOR_INPUT_EMAIL'])) || null;
    inputPassword = (await page.$(LOCAL_CONFIG['SELECTOR_INPUT_PASSWORD'])) || null;
    if (!inputEmail || !inputPassword) {
      loggerBrowser.warn('Даже после нажатия на "a" для открытия input password он так и не появлися');
      return false;
    }
    await delay(random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']));
    await this.inputSet({ input: inputEmail, text: LOCAL_CONFIG['EMAIL'], page });
    await delay(random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']));
    await this.inputSet({ input: inputPassword, text: LOCAL_CONFIG['PASSWORD'], page });

    const btnAuthForm = (await page.$(LOCAL_CONFIG['SELECTOR_BTN_AUTH'][0])) || (await page.$(LOCAL_CONFIG['SELECTOR_BTN_AUTH'][1])) || null;
    if (!btnAuthForm) {
      loggerBrowser.warn('Неудалось найти кнопку входа (форма)');
      return false;
    }
    await btnAuthForm.click({ delay: random(LOCAL_CONFIG['DELAY_EVENT_MIN'], LOCAL_CONFIG['DELAY_EVENT_MAX']) });
    await delay(LOCAL_CONFIG['DELAY_AUTH']);

    return true;
  };

  closeBrowser = async () => {
    await this.browser?.close();
  };

  updateKeys = async (page?: Page) =>
    new Promise((resolve) => {
      loggerBrowser.log('Запуск сокета для обновления keys и auth key');
      const localPage = page ?? this.deals;
      if (!localPage) {
        loggerBrowser.warn('Не удалось запустить socket для обновления keys (auth key), т.к. нету page');
        return;
      }

      this.injectStatic(localPage).then(() => {
        let first = true;
        localPage
          .exposeFunction('keysSocketUpdate', (data: string) => {
            this.keys = JSON.parse(data);
            loggerBrowser.log(`Обновление keys: ${data}`);
            this.authKey = this.generateAuthKey();
            loggerBrowser.log(`Обновление authKeys: ${this.authKey}`);
            if (first) {
              first = false;
              resolve(true);
            }
          })
          .then(() => {
            localPage.evaluate(() => {
              const socket = io('wss://ws.skycrypto.net', {
                transports: ['websocket'],
                path: '/sky-socket',
              });

              socket.on('update codedata', (data: string) => {
                (window as unknown as WindowCustom).keysSocketUpdate(data);
              });

              socket.on('connect', () => {
                socket.emit('2probe');
              });
            });
          });
      });
    });

  evalute = async <Type>({ page, code }: { page?: Page; code: string }) => {
    loggerBrowser.log(`Запрос на browser, код: ${code}`);
    // проверяем page
    if (page) this.injectStatic(page);
    const localPage = page ?? this.deals;
    if (!localPage) {
      loggerBrowser.warn('Не удалось сделать запрос, т.к. отсутсвует page');
      return null;
    }

    // проверка регулярок
    let localCode = `${code}`;
    loggerBrowser.log('Поиск регулярок и их замена');
    if (localCode.includes('[authKey]')) localCode = localCode.split('[authKey]').join(`${this.authKey}`);

    // делаем запрос и отдаем ответ
    loggerBrowser.log('Производим запрос');
    const result = await localPage.evaluate(localCode);
    loggerBrowser.log('Запрос прошёл успешно, отправляем ответ');
    return result as Type;
  };
}

const worker = new WorkerBrowser();

parentPort?.on('message', async (message) => {
  if ('command' in message)
    switch (message.command as ServerCommands) {
      case 'redis':
        // redis = wrap<WorkerRedis>(message['port']);
        break;
      case 'server':
        // server = wrap<WorkerServer>(message['port']);
        break;
      case 'connect':
        expose(worker, message['port']);
        break;
      case 'exit':
        process.exit(message['code']);
    }
});

export default WorkerBrowser;

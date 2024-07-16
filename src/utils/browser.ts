import * as CONFIG from '../config.js';
import type { Browser, ElementHandle, Page } from 'puppeteer';
import logger from './logger.js';
import { PuppeteerExtra } from 'puppeteer-extra';
import puppeteer from 'puppeteer';
import stealsPlugin from 'puppeteer-extra-plugin-stealth';
import { delay, random } from './dateTime.js';
import path from 'path';
import { readdirSync } from 'fs';
import md5 from 'md5';

interface ProxyData {
  url: string;
  user: string;
  pass: string;
}

interface InputSet {
  input: ElementHandle;
  text: string;
  page?: Page;
}

class BrowserManager {
  private static instance: BrowserManager;

  // init data
  private proxyParams: ProxyData | string = '';

  // local params
  public isReAuth: boolean = false;

  // browser data
  private browser: Browser | null = null;
  private deals: Page | null = null;

  constructor() {
    if (BrowserManager.instance) return BrowserManager.instance;
    BrowserManager.instance = this;
  }

  generateAuthKey = (keys: any) => {
    let t = 'e' === keys['aKM'];
    let r = Object.keys(keys).sort();
    if (t) r = r.reverse();
    let o =
      r
        .map(function (t) {
          return keys[t];
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
    let params: any = {};
    if (process.argv.includes('--headless')) params['headless'] = true;
    else params['headless'] = !true;
    params['args'] = ['--no-sandbox', '--no-default-browser-check', ...(this.proxyParams && [`--proxy-server=${(<ProxyData>this.proxyParams).url}`])];
    params['defaultViewport'] = { width: 1100, height: 600 };
    params['ignoreDefaultArgs'] = ['--enable-automation'];
    params['userDataDir'] = `./user_data`;
    return params;
  };

  incPage = async (page: Page, url: string) => {
    logger.info('Установка конфигурации страницы', `(${url})`);
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
    // await page.waitForNavigation({ timeout: CONFIG['WAIT_TIMEOUT'], waitUntil: CONFIG['WAIT_UNTIL'] });
    const files: string[] = readdirSync(path.resolve(import.meta.dirname, `../../statics`));

    for (let index = 0; index < files.length; index++) {
      const fileName = files[index];
      await page.addScriptTag({ path: path.resolve(import.meta.dirname, `../../statics/${fileName}`) });
    }
  };

  initPage = async (url: string) => {
    let page: Page;
    if (!this.browser) {
      logger.warn('При создание page необходим browser, но он является null');
      return null;
    }
    page = await this.browser.newPage();
    await this.incPage(page, url);
    await this.reload(url, page);
    return page;
  };

  initBrowser = async () => {
    try {
      logger.info('Установка конфигурации браузера');
      const params = this.initParams();

      // close old browser
      if (this.browser) await this.browser.close();
      const puppeteerExtra = new PuppeteerExtra(puppeteer as any);
      puppeteerExtra.use(stealsPlugin());

      this.browser = await puppeteerExtra.launch(params);

      // set page deals
      let url = 'https://skycrypto.me/deals';
      let page = await this.initPage(url);
      if (!page) {
        logger.error(new Error('Ошибка создания page'), 'Не удалось создать page deals');
        return false;
      }

      // check auth
      page = await this.checkAuth(page, url);
      if (!page) {
        logger.error(new Error('Ошибка авторизации page'), 'Не удалось провести авторизацию page deals');
        return false;
      }

      // close 0 page
      logger.log('Удаляем ненужную страницу');
      const pageNull = (await this.browser.pages())[0];
      await pageNull.close();

      // save page
      logger.log('Сохранияем адрес ссылки на сделки');
      this.deals = page;

      // end
      logger.info('Установка базовой конфигурации завершена');
      return true;
    } catch (e: any) {
      logger.error(e, 'Ошибка без обработки (init browser)');
      return false;
    }
  };

  waitReAuth = (): Promise<boolean> =>
    new Promise(async (res) => {
      let cnt = 0;
      while (cnt < 250) {
        await delay(100);
        if (!this.isReAuth) {
          res(true);
          return;
        }
        cnt++;
      }
      res(false);
    });

  reload = async (url: string, page: Page, count = 1): Promise<void> => {
    try {
      await this.goto(page, 'about:blank');
      await this.goto(page, url);
    } catch (error: unknown) {
      if (count < 4) {
        logger.warn({ err: error }, `Не удачная перезагрузка страницы (reload)`);
        return await this.reload(url, page, count + 1);
      }
      logger.error(error, 'Окончательная ошибка перезагрузки страницы (reload)');
    }
  };

  goto = async (page: Page, url: string) => {
    await page.goto(url, { timeout: CONFIG['WAIT_TIMEOUT'], waitUntil: CONFIG['WAIT_UNTIL'] });
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

      logger.log(`Запись в input завершёна, text: ${text}`);
      return true;
    } catch (error: unknown) {
      logger.warn({ err: error }, 'Ошибка при печати input');
      return false;
    }
  };

  getAuthKey = async (page: Page) => {
    let keys: any | null = null;
    keys = await page.evaluate('new Promise((resolve) => (refresh().then(resolve).catch(null)))');
    if (!keys) {
      logger.warn('Не удалось получить ключи для создания auth key');
      return false;
    }

    let authKey = '';
    try {
      authKey = this.generateAuthKey(keys);
    } catch (error: unknown) {
      logger.error(error, 'Не удалось создать auth key');
      return false;
    }
    logger.log(`Создан auth key: ${authKey}`);
  };

  checkAuth = async (page: Page, url = 'https://skycrypto.me/wallet') => {
    logger.log(`Проверка авторизации (${url})`);
    let localPage: Page | null = page;

    if (this.isReAuth) {
      logger.log('Ждём авторизации');
      await localPage.close();

      if (!(await this.waitReAuth())) {
        logger.warn('Не должался авторизации (check auth)');
        return null;
      }
      localPage = await this.initPage(url);
      if (localPage) await this.goto(localPage, url);
      else {
        logger.warn('Пустой page (check auth)');
        return null;
      }
    }

    let error = (await localPage.$(CONFIG['SELECTOR_ERROR'][0])) || (await localPage.$(CONFIG['SELECTOR_ERROR'][1])) || null;
    let checkMain = localPage.url() == CONFIG['URL_MAIN_AUTH'] || localPage.url() == `${CONFIG['URL_MAIN_AUTH']}/`;

    if (error || checkMain || localPage.url() != url) {
      this.isReAuth = true;
      logger.log('Не авторизирован, попытка авторизироваться');
      await delay(random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']));
      if (!(await this.auth(localPage))) return null;
      logger.log('Переходит на нужную ссылку');
      await this.goto(localPage, url);
      this.isReAuth = false;
    }

    logger.log('Завершили проверку авторизации');

    await delay(random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']));
    return page;
  };

  auth = async (page: Page) => {
    logger.log('Переход на главную страницу');
    await this.goto(page, CONFIG['URL_MAIN_AUTH']);

    const btnAuth = (await page.$(CONFIG['SELECTOR_AUTH_FORM'][0])) || (await page.$(CONFIG['SELECTOR_AUTH_FORM'][1])) || null;
    if (!btnAuth) {
      logger.warn('Неудалось найти кнопку входа (главная страница)');
      return false;
    }
    await btnAuth.click({ delay: random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']) });

    let inputEmail = (await page.$(CONFIG['SELECTOR_INPUT_EMAIL'])) || null;
    let inputPassword = (await page.$(CONFIG['SELECTOR_INPUT_PASSWORD'])) || null;
    if (!inputEmail || !inputPassword) {
      const uriAuth = (await page.$(CONFIG['SELECTOR_URL_AUTH'][0])) || (await page.$(CONFIG['SELECTOR_URL_AUTH'][1])) || null;
      if (!uriAuth) {
        logger.warn('Не было найдена "a" для открытия input password');
        return false;
      }
      await uriAuth.click({ delay: random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']) });
    }

    await delay(random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']));
    inputEmail = (await page.$(CONFIG['SELECTOR_INPUT_EMAIL'])) || null;
    inputPassword = (await page.$(CONFIG['SELECTOR_INPUT_PASSWORD'])) || null;
    if (!inputEmail || !inputPassword) {
      logger.warn('Даже после нажатия на "a" для открытия input password он так и не появлися');
      return false;
    }
    await delay(random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']));
    await this.inputSet({ input: inputEmail, text: CONFIG['EMAIL'], page });
    await delay(random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']));
    await this.inputSet({ input: inputPassword, text: CONFIG['PASSWORD'], page });

    const btnAuthForm = (await page.$(CONFIG['SELECTOR_BTN_AUTH'][0])) || (await page.$(CONFIG['SELECTOR_BTN_AUTH'][1])) || null;
    if (!btnAuthForm) {
      logger.warn('Неудалось найти кнопку входа (форма)');
      return false;
    }
    await btnAuthForm.click({ delay: random(CONFIG['DELAY_EVENT_MIN'], CONFIG['DELAY_EVENT_MAX']) });
    await delay(CONFIG['DELAY_AUTH']);

    return true;
  };
}

export default new BrowserManager();

import type { TransferListItem } from 'node:worker_threads';
import type WorkerRedis from './workers/redis.js';
import type WorkerBrowser from './workers/browser.js';
import type WorkerServer from './workers/server.js';
import type { Remote } from 'comlink';
import type { CacheDeal, PhoneServiceData } from './workers/redis.js';
import type { DetailsDeal } from './workers/browser.js';

import path from 'path';
import { wrap } from 'comlink';
import logger, { loggerBrowser } from './utils/logger.js';
import { Worker } from 'node:worker_threads';
import { pollingDeals, pollingPhone } from './utils/timer.js';
import { get_method_id, get_method_str, getNumber, sendTgNotify, unlockNumber } from './utils/paidMethod.js';

async function getDeals(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>) {
  logger.info(`Получение списка сделок`);
  const params = (symbol: 'btc' | 'usdt', currency: 'rub', offset: number, limit: number) => ({ symbol, currency, offset, limit });
  const code = (data: ReturnType<typeof params>) => `new Promise((resolve) => getDeals('[authKey]', ${JSON.stringify(data)}).then(resolve).catch(() => resolve([])))`;

  const btcLimit = await redis.getConfig('POLLING_DEALS_LIMIT_BTC');
  const usdtLimit = await redis.getConfig('POLLING_DEALS_LIMIT_USDT');
  const btcParams = params('btc', 'rub', 0, btcLimit as number);
  const usdtParams = params('usdt', 'rub', 0, usdtLimit as number);

  const btcIs = await redis.getConfig('POLLING_DEALS_BTC');
  let btcDeals = [] as CacheDeal[];
  if (btcIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(btcParams)}`);
    btcDeals = ((await browser.evalute({ code: code(btcParams) })) as CacheDeal[]).map((el) => ({ id: el.id, state: el.state }));
    logger.log(`Получено ${btcDeals.length}`);
  }

  const usdtIs = await redis.getConfig('POLLING_DEALS_USDT');
  let usdtDeals = [] as CacheDeal[];
  if (usdtIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(usdtParams)}`);
    usdtDeals = ((await browser.evalute({ code: code(usdtParams) })) as CacheDeal[]).map((el) => ({ id: el.id, state: el.state }));
    logger.log(`Получено ${usdtDeals.length}`);
  }

  const getNewDeals = async (deals: CacheDeal[]) => {
    const oldDeals = await redis.getCacheDeals();

    const findNewDeals = deals.filter((now) => {
      const oldIndex = oldDeals.findIndex((old) => now.id === old.id);
      return oldIndex === -1 || oldDeals[oldIndex].state !== now.state;
    });
    const findCancelDeals = oldDeals.filter((old) => deals.findIndex((now) => now.id === old.id) === -1 && old.state !== 'closed').map((el) => ({ ...el, state: 'cancel' }));

    return findNewDeals.concat(findCancelDeals);
  };

  let newDeals = [] as CacheDeal[];
  const allDeals = btcDeals.concat(usdtDeals);
  newDeals = newDeals.concat(await getNewDeals(allDeals));

  logger.info(`Общее количество сделок ${allDeals.length}`);
  logger.info(`Количество новых сделок ${newDeals.length}`);
  logger.log(`Обновление списка в памяти`);
  await redis.setCacheDeal(allDeals);

  if (newDeals.length > 0) logger.log(`Отправляем на обработку новые сделки`);
  for (let indexNewDeal = 0; indexNewDeal < newDeals.length; indexNewDeal++) {
    const deal = newDeals[indexNewDeal];
    Promise.resolve(transDeal(redis, browser, deal));
  }
}

async function transDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, cacheDeal: CacheDeal) {
  try {
    logger.info(`Изменение сделки ${cacheDeal.id} (${cacheDeal.state})`);
    const evaluateFunc = `new Promise((resolve) => getDeal('[authKey]', '${cacheDeal.id}').then(resolve).catch(() => resolve({})))`;
    const data: DetailsDeal = (await browser.evalute({ code: evaluateFunc })) as DetailsDeal;
    logger.info(`Получены актуальные данные сделки ${data.id} (${data.state})`);
    switch (data.state) {
      case 'proposed':
        return await proposedDeal(redis, browser, data);
      case 'paid':
        return await paidDeal(redis, data);
      // TODO: сделать спор
    }
  } catch (error: unknown) {
    logger.error(error);
  }
}

async function cancelDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal) {
  // TODO: добавить освобождение телефона если он есть
  const phone = await redis.getPhoneDeal(deal.id);
  if (phone) {
    logger.log(`Сделка ${deal.id} найден телефон в базе, особождаем`);
    await redis.delPhoneDeal(deal.id);
  }

  const evaluateFunc = `new Promise((resolve) => cancelDeal('[authKey]', '${deal.id}').then(() => resolve(true)).catch(() => resolve(false)))`;
  const result = await browser.evalute({ code: evaluateFunc });
  if (result) {
    logger.info(`Успешная отмена сделки (${deal.id})`);
  } else logger.warn(`Не удалось отменить сделку (${deal.id}, ${result})`);
}

async function cancelDealPhone(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, phone: PhoneServiceData) {
  // TODO: добавить освобождение телефона если он есть
  logger.log(`Сделка ${phone.deal_id} найден телефон в базе, особождаем`);
  await redis.delPhoneDeal(phone.deal_id);

  const evaluateFunc = `new Promise((resolve) => cancelDeal('[authKey]', '${phone.deal_id}').then(() => resolve(true)).catch(() => resolve(false)))`;
  const result = await browser.evalute({ code: evaluateFunc });
  if (result) {
    logger.info(`Успешная отмена сделки (${phone.deal_id})`);
  } else logger.warn(`Не удалось отменить сделку (${phone.deal_id}, ${result})`);
}

async function proposedDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal) {
  const isVerified = (await redis.getConfig('IS_VERIFIED')) as unknown as boolean;
  logger.info(`Проверка пользователя (${deal.buyer.nickname}) по верификации (${isVerified}, ${deal.id})`);
  if (deal.buyer.verified === isVerified || isVerified === false) {
    // check pay
    const lotPay = (await redis.getsConfig(['MTS_PAY'])) as string[];
    const lotIndex = lotPay.findIndex((el) => el === deal.lot.id);
    if (lotIndex === -1) {
      logger.warn(`Сделка ${deal.id} не найден нужный порт для обработки (${deal.lot.id}, ${JSON.stringify(lotPay)})`);
      return await cancelDeal(redis, browser, deal);
    }

    // get port
    const ports = (await redis.getsConfig(['MTS_PORT'])) as number[];
    const port = ports[lotIndex];

    // check pre phone
    const methodStr = await get_method_str(port, redis);
    const methodId = await get_method_id(methodStr);

    const amount = `${deal.amount_currency}`;

    logger.log(`Поиск предворительного телефона (${deal.id}, ${deal.lot.id}, ${methodStr})`);
    const [paidUrl, mainPort] = await redis.getsConfig(['PAID_URL', 'PORT']);
    const prePhone = await getNumber(`${paidUrl}:${mainPort}/`, Number(amount), methodId, deal.deal_id, false, true);
    if (Number(prePhone['result']) != 1) {
      logger.error(new Error(`Сделка ${deal.id} не найдены предварительные реквизиты (${methodStr})`));
      const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
      return await sendTgNotify(`(sky) Сделка ${deal.id} не найдены предварительные реквизиты`, tgId, mainPort);
    }
    logger.log({ obj: prePhone }, `Предворительный телефон найден (${deal.id}) ->`);

    logger.log(`Пользователь (${deal.buyer.nickname}) прошёл верификацию, подтверждение сделки (${deal.id})`);
    const evaluateFunc = `new Promise((resolve) => statesNextDeal('[authKey]', '${deal.id}').then(() => resolve(true)).catch(() => resolve(false)))`;
    const result = await browser.evalute({ code: evaluateFunc });
    if (result) {
      logger.info(`Успешное подтверждение принятия сделки (${deal.id})`);
      return await requisiteDeal(redis, browser, deal, port);
    } else logger.warn(`Не удалось подтвердить принятие сделки (${deal.id}, ${result})`);
  } else {
    logger.log(`Пользователь (${deal.buyer.nickname}) не прошёл верификацию, отмена сделки (${deal.id})`);
    await cancelDeal(redis, browser, deal);
  }
}

async function requisiteDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal, port: number) {
  const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
  const methodStr = await get_method_str(port, redis);
  const methodId = await get_method_id(methodStr);

  const amount = `${deal.amount_currency}`;

  logger.log(`Поиск телефона (${deal.id}, ${deal.lot.id}, ${methodStr})`);
  const paidUrl = await redis.getConfig('PAID_URL');
  const phone = await getNumber(`${paidUrl}:${mainPort}/`, Number(amount), methodId, deal.deal_id);
  if (Number(phone['result']) != 1) {
    logger.error(new Error(`Сделка ${deal.id} не найдены реквизиты (${methodStr})`));
    return await sendTgNotify(`(sky) Сделка ${deal.id} не найдены реквизиты`, tgId, mainPort);
  }
  logger.info({ obj: phone }, `Телефон найден (${deal.id}) ->`);

  // send chat
  logger.log(`Отправка сообщения в чат (${deal.id}): ${phone.requisite.chat_text}`);
  const evaluateFuncChat = `new Promise((resolve) => messageDeal('[authKey]', '${phone.requisite.chat_text}', '${deal.buyer.nickname}', '${deal.symbol}').then(() => resolve(true)).catch(() => resolve(false)))`;
  const resultChat = await browser.evalute({ code: evaluateFuncChat });
  if (!resultChat) return await sendTgNotify(`(sky) Неудалось отправить сообщение в чат сделки ${deal.id} (${phone.requisite.text}, ${amount})`, tgId, mainPort);

  // send requisite
  logger.log(`Отправка реквизитов (${deal.id}): ${phone.requisite.requisite_text}`);
  const evaluateFuncRequisite = `new Promise((resolve) => requisiteDeal('[authKey]', '${deal.id}', '${phone.requisite.requisite_text}').then(() => resolve(true)).catch(() => resolve(false)))`;
  const resultRequisite = await browser.evalute({ code: evaluateFuncRequisite });
  if (!resultRequisite) return await sendTgNotify(`(sky) Неудалось отправить реквизиты сделки ${deal.id} (${phone.requisite.text}, ${amount})`, tgId, mainPort);

  // save redis phone
  logger.log(`Сохраняем сделку и телефон (${deal.id}, ${phone.requisite.text}, ${amount})`);
  const now = Date.now();
  redis.setPhone({
    create_at: now,
    unlock_at: now,
    id: deal.deal_id,
    deal_id: deal.id,
    requisite: {
      chat_text: phone.requisite.chat_text,
      requisite_text: phone.requisite.requisite_text,
      text: phone.requisite.text,
      max_payment_sum: Number(phone.requisite.max_payment_sum),
      min_payment_sum: Number(phone.requisite.min_payment_sum),
    },
  });
  logger.info(`Ожидание подтверждения от покупателя пополнение на телефон`);
}

async function paidDeal(redis: Remote<WorkerRedis>, deal: DetailsDeal) {
  const phone = await redis.getPhoneDeal(deal.id);
  if (!phone) return logger.warn(`Сделка ${deal.id} была в состоянии paid, но не имеет телефона`);
  const now = Date.now();
  const [paidUrl, mainPort] = await redis.getsConfig(['PAID_URL', 'PORT']);
  const response = await unlockNumber(`${paidUrl}:${mainPort}/`, String(phone.id));
  if (!response) return logger.warn(`Сделка ${deal.id} не удалось unlock number для проверки телефона`);
  logger.info(`Сделка ${deal.id} успешно отправлена на проверку телефона`);
}

// TODO: обработка полученного телефона
async function balance(phone: PhoneServiceData) {}

const main = () =>
  new Promise<number>(() => {
    // workers
    logger.log(`Запуск потоков`);
    const workerRedis = new Worker(path.resolve(import.meta.dirname, './workers/redis.js'));
    const workerBrowser = new Worker(path.resolve(import.meta.dirname, './workers/browser.js'));
    const workerServer = new Worker(path.resolve(import.meta.dirname, './workers/server.js'));

    // adapters main
    logger.log(`Создание адаптеров`);
    const workerRedisAdapter = new MessageChannel();
    const workerBrowserAdapter = new MessageChannel();
    const workerServerAdapter = new MessageChannel();

    // adapters other
    const workerRedisBrowserAdapter = new MessageChannel();
    const workerBrowserRedisAdapter = new MessageChannel();

    const workerRedisServerAdapter = new MessageChannel();
    const workerServerRedisAdapter = new MessageChannel();

    const workerBrowserServerAdapter = new MessageChannel();
    const workerServerBrowserAdapter = new MessageChannel();

    // connects main
    logger.log(`Подключение адаптеров (основные)`);
    workerRedis.postMessage({ command: 'connect', port: workerRedisAdapter.port2 }, [workerRedisAdapter.port2 as unknown as TransferListItem]);
    workerBrowser.postMessage({ command: 'connect', port: workerBrowserAdapter.port2 }, [workerBrowserAdapter.port2 as unknown as TransferListItem]);
    workerServer.postMessage({ command: 'connect', port: workerServerAdapter.port2 }, [workerServerAdapter.port2 as unknown as TransferListItem]);

    // connects other
    logger.log(`Подключение адаптеров (redis - browser)`);
    workerRedis.postMessage({ command: 'connect', port: workerRedisBrowserAdapter.port2 }, [workerRedisBrowserAdapter.port2 as unknown as TransferListItem]);
    workerBrowser.postMessage({ command: 'connect', port: workerBrowserRedisAdapter.port2 }, [workerBrowserRedisAdapter.port2 as unknown as TransferListItem]);

    logger.log(`Подключение адаптеров (redis - server)`);
    workerRedis.postMessage({ command: 'connect', port: workerRedisServerAdapter.port2 }, [workerRedisServerAdapter.port2 as unknown as TransferListItem]);
    workerServer.postMessage({ command: 'connect', port: workerServerRedisAdapter.port2 }, [workerServerRedisAdapter.port2 as unknown as TransferListItem]);

    logger.log(`Подключение адаптеров (server - browser)`);
    workerBrowser.postMessage({ command: 'connect', port: workerBrowserServerAdapter.port2 }, [workerBrowserServerAdapter.port2 as unknown as TransferListItem]);
    workerServer.postMessage({ command: 'connect', port: workerServerBrowserAdapter.port2 }, [workerServerBrowserAdapter.port2 as unknown as TransferListItem]);

    // exposes main
    logger.log(`Создание роутеров (основные)`);
    const redis = wrap<WorkerRedis>(workerRedisAdapter.port1);
    const browser = wrap<WorkerBrowser>(workerBrowserAdapter.port1);
    const server = wrap<WorkerServer>(workerServerAdapter.port1);

    // exposes other
    logger.log(`Создание роутеров (redis - browser)`);
    workerRedis.postMessage({ command: 'browser', port: workerBrowserRedisAdapter.port1 }, [workerBrowserRedisAdapter.port1 as unknown as TransferListItem]);
    workerBrowser.postMessage({ command: 'redis', port: workerRedisBrowserAdapter.port1 }, [workerRedisBrowserAdapter.port1 as unknown as TransferListItem]);

    logger.log(`Создание роутеров (redis - server)`);
    workerRedis.postMessage({ command: 'server', port: workerServerRedisAdapter.port1 }, [workerServerRedisAdapter.port1 as unknown as TransferListItem]);
    workerServer.postMessage({ command: 'redis', port: workerRedisServerAdapter.port1 }, [workerRedisServerAdapter.port1 as unknown as TransferListItem]);

    logger.log(`Создание роутеров (server - browser)`);
    workerBrowser.postMessage({ command: 'server', port: workerServerBrowserAdapter.port1 }, [workerServerBrowserAdapter.port1 as unknown as TransferListItem]);
    workerServer.postMessage({ command: 'borwser', port: workerBrowserServerAdapter.port1 }, [workerBrowserServerAdapter.port1 as unknown as TransferListItem]);

    // exit workers
    logger.log(`Создание callback для отключения потоков при выходе процесса`);
    process.on('exit', () => {
      workerBrowser.postMessage({ command: 'exit', code: 1 });
      workerServer.postMessage({ command: 'exit', code: 1 });
      workerRedis.postMessage({ command: 'exit', code: 1 });
    });

    // timer phone
    const timerPhone = async (redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>) => {
      const { phonesCancel } = await redis.timerPhone();
      for (let indexCancel = 0; indexCancel < phonesCancel.length; indexCancel++) {
        const phone = phonesCancel[indexCancel];
        Promise.resolve(cancelDealPhone(redis, browser, phone));
      }
    };

    try {
      redis.initClient().then(() => {
        server.init();
      });
      browser.initBrowser().then(() => {
        browser.updateKeys().then(() => {
          loggerBrowser.info(`Успешное обновление ключей (первое), старт итераций`);
          pollingDeals(redis, getDeals.bind(null, redis, browser));
          pollingPhone(redis, timerPhone.bind(null, redis, browser));
          workerServer.on('message', (data) => {
            if ('command' in data && data.command === 'balance') balance(data.phone);
          });
        });
      });
    } catch (error: unknown) {
      logger.error(error);
    }
  });

main().catch((error: unknown) => {
  logger.error(error);
  process.exit(1);
});

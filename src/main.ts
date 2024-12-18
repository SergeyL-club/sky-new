import type { TransferListItem } from 'node:worker_threads';
import type WorkerRedis from './workers/redis.js';
import type WorkerBrowser from './workers/browser.js';
import type WorkerServer from './workers/server.js';
import type { Remote } from 'comlink';
import type { CacheDeal, DealGet, KeyOfConfig, PhoneServiceData } from './workers/redis.js';
import type { DetailsDeal } from './workers/browser.js';

import path, { dirname } from 'path';
import { wrap } from 'comlink';
import logger from './utils/logger.js';
import { Worker } from 'node:worker_threads';
import { pollingDeals, pollingPhone } from './utils/timer.js';
import { blockUser, get_method_id, getNumber, sendGet, sendTgNotify, unlockNumber } from './utils/paidMethod.js';
import { fileURLToPath } from 'node:url';
import { delay } from './utils/dateTime.js';

const ignoreList = [] as string[];

async function findMethod(redis: Remote<WorkerRedis>, deal: DetailsDeal) {
  // check pay
  const lotPay = (await redis.getsConfig(['MTS_PAY', 'ALFA_PAY'])) as string[][];
  const lotIndex = lotPay.findIndex((el) => el.find((lotId) => lotId === deal.lot.id));
  if (lotIndex === -1) {
    await ignoreDeal(redis, deal);
    logger.warn(`Сделка ${deal.id} (${deal.deal_id}) не найден нужный порт для обработки (${deal.lot.id}, ${JSON.stringify(lotPay)})`);
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не удалось найти порт для отправки сервиса, обработайте сами`, tgId, mainPort);
  }

  // get port
  const ports = (await redis.getsConfig(['MTS_PORT', 'ALFA_PORT'])) as number[];
  const port = ports[lotIndex];

  // method str
  const methodStr = ['mts', 'alfa', 'qiwi', 'payeer'][lotIndex];

  return { port, methodStr };
}

async function getDeals(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>) {
  logger.info(`Получение списка сделок`);
  const params = (symbol: 'btc' | 'usdt', currency: 'rub', offset: number, limit: number) => ({ symbol, currency, offset, limit, lot_type: 'sell' });
  const code = (data: ReturnType<typeof params>) => `getDeals('[accessKey]','[authKey]', ${JSON.stringify(data)})`;

  const btcLimit = await redis.getConfig('POLLING_DEALS_LIMIT_BTC');
  const usdtLimit = await redis.getConfig('POLLING_DEALS_LIMIT_USDT');
  const btcParams = params('btc', 'rub', 0, btcLimit as number);
  const usdtParams = params('usdt', 'rub', 0, usdtLimit as number);

  const btcIs = await redis.getConfig('POLLING_DEALS_BTC');
  let btcDeals = [] as DealGet[];
  if (btcIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(btcParams)}`);
    const btcDealsPre = (await browser.evalute({ code: code(btcParams) })) as DealGet[] | null;
    if (!Array.isArray(btcDealsPre)) return logger.warn(`Запрос на сделки btc не успешный, отмена итерации`);
    btcDeals = btcDealsPre;
    logger.log(`Получено ${btcDeals.length}`);
    const limit = (await redis.getConfig('POLLING_DEALS_LIMIT_BTC')) as number;
    if (btcDeals.length !== limit) {
      logger.warn(`Список btc не равен лимиту (${btcDeals.length}, ${limit})`);
      return;
    }
  }

  const usdtIs = await redis.getConfig('POLLING_DEALS_USDT');
  let usdtDeals = [] as DealGet[];
  if (usdtIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(usdtParams)}`);
    const usdtDealsPre = (await browser.evalute({ code: code(usdtParams) })) as DealGet[] | null;
    if (!Array.isArray(usdtDealsPre)) return logger.warn(`Запрос на сделки usdt не успешный, отмена итерации`);
    usdtDeals = usdtDealsPre;
    logger.log(`Получено ${usdtDeals.length}`);
    const limit = (await redis.getConfig('POLLING_DEALS_LIMIT_USDT')) as number;
    if (usdtDeals.length !== limit) {
      logger.warn(`Список usdt не равен лимиту (${usdtDeals.length}, ${limit})`);
      return;
    }
  }

  const getNewDeals = async (deals: DealGet[]) => {
    const oldDeals = await redis.getCacheDeals();
    // logger.log({ obj: oldDeals }, `Данные списка из памяти`);

    const findNewDeals = deals
      .filter((now) => {
        const candidate = oldDeals.find((old) => now.id === old.id);
        const actualState = ['paid', 'proposed'];
        const index = ignoreList.indexOf(now.id);
        if (index !== -1) {
          if (now.state === 'closed') ignoreList.splice(index, 1);
          return false;
        }
        const isNow = candidate === undefined;
        const isState = actualState.includes(now.state);
        const isNowState = !isNow && now.state !== candidate.state && isState;
        const isDispute = now.dispute && now.state !== 'closed';
        // logger.log(`Сделка ${now.id} (${isNow}, ${isNowState}, ${isDispute})`);
        return (isNow && isState) || isNowState || isDispute;
      })
      .map((now) => ({ id: now.id, state: now.state }));
    const findCancelDeals = oldDeals
      .filter((old) => deals.find((now) => now.id === old.id) === undefined)
      .filter((old) => old.state !== 'closed')
      .map((old) => ({ id: old.id, state: 'cancel' }));

    return findNewDeals.concat(findCancelDeals);
  };

  let newDeals = [] as CacheDeal[];
  // const btcNewDeals = await getNewDeals(btcDeals);
  // logger.log({ obj: btcDeals }, `Данные btc`);
  // logger.log({ obj: btcNewDeals }, `Данные btc (new)`);
  // const usdtNewDeals = await getNewDeals(usdtDeals);
  // logger.log({ obj: usdtDeals }, `Данные usdt`);
  // logger.log({ obj: usdtNewDeals }, `Данные usdt (new)`);

  const allDeals = btcDeals.concat(usdtDeals);
  newDeals = await getNewDeals(allDeals);
  // logger.log({ obj: newDeals }, `Данные new deals`);

  logger.info(`Общее количество сделок ${allDeals.length}`);
  logger.info(`Количество новых сделок ${newDeals.length}`);
  logger.log(`Обновление списка в памяти`);
  await redis.setCacheDeal(allDeals);

  if (newDeals.length > 0) logger.log(`Отправляем на обработку новые сделки`);
  const delayUpdate = (await redis.getConfig('DELAY_POLLING_DEALS_UPDATE')) as number;
  for (let indexNewDeal = 0; indexNewDeal < newDeals.length; indexNewDeal++) {
    const deal = newDeals[indexNewDeal];
    if (indexNewDeal > 0) await delay(delayUpdate);
    Promise.resolve(transDeal(redis, browser, deal));
  }
}

async function transDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, cacheDeal: CacheDeal) {
  try {
    if (cacheDeal.state === 'cancel') {
      logger.info(`Сделка ${cacheDeal.id} ушла из списка (cancel), очищаем её`);
      return await redis.delPhoneDeal(cacheDeal.id);
    }

    if (ignoreList.includes(cacheDeal.id)) return;

    logger.info(`Изменение сделки ${cacheDeal.id} (${cacheDeal.state})`);
    const evaluateFunc = `getDeal('[accessKey]', '[authKey]', '${cacheDeal.id}')`;
    const data: DetailsDeal | null = (await browser.evalute({ code: evaluateFunc })) as DetailsDeal | null;
    if (data === null) {
      logger.warn(`Сделка ${cacheDeal.id} (${cacheDeal.state}) не удалось получить доп информацию, отправляем в игнор и уведомляем`);
      const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
      await ignoreDeal(redis, cacheDeal);
      return await sendTgNotify(`(sky) Сделка ${cacheDeal.id} (${cacheDeal.state}) не удалось получить доп информацию, обработайте сами`, tgId, mainPort);
    }
    logger.info(`Получены актуальные данные сделки ${data.id} (${data.state})`);

    if (data.state === 'proposed') {
      const [panikUrl, panikBtcPort, panikUsdtPort] = (await redis.getsConfig(['PANIK_URL', 'PANIK_PORT_BTC', 'PANIK_PORT_USDT'])) as [string, number, number];
      const answer = await sendGet(panikUrl + ':' + (data.symbol === 'btc' ? panikBtcPort : panikUsdtPort) + '/?deal_process=' + data.id);
      logger.log(`Ответ от подтвержения на сделку ${data.id}: ${answer}`);
      if (answer) logger.log(`Отправили сделку ${data.id} (${data.deal_id}) на подтверждение`);
      else logger.warn(`Не удалось отправить сделку ${data.id} (${data.deal_id}) на подтверждение`);
    }

    if (data.dispute !== null) return await disputDeal(redis, data);

    switch (data.state) {
      case 'proposed':
        return await proposedDeal(redis, browser, data);
      case 'paid':
        return await paidDeal(redis, data);
    }
  } catch (error: unknown) {
    logger.error(error);
  }
}

async function ignoreDeal(redis: Remote<WorkerRedis>, deal: DetailsDeal | CacheDeal) {
  logger.warn(`Сделка ${deal.id} (${'deal_id' in deal ? deal.deal_id : 'cache'}) ушла в ошибку, делаем игнор`);
  await redis.delPhoneDeal(deal.id);
  ignoreList.push(deal.id);
  // const phone = await redis.getPhoneDeal(deal.id);
  // const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
  // await sendTgNotify(`(sky) Сделка ${deal.id} ушла в ошибку, обработайте сами (${phone?.id}, ${phone?.requisite.text})`, tgId, mainPort);
}

async function disputePhone(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, phone: PhoneServiceData) {
  logger.log(`Сделка ${phone.deal_id} (${phone.id}) найден телефон в базе, особождаем`);
  await redis.delPhoneDeal(phone.deal_id);

  const evaluateFunc = `disputeDeal('[accessKey]', '[authKey]', '${phone.deal_id}')`;
  const result = await browser.evalute({ code: evaluateFunc });
  if (result) {
    logger.info(`Успешно отправили в спор сделку ${phone.deal_id}, телефон: ${phone.requisite.text}`);
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    await sendTgNotify(`(sky) Сделка ${phone.deal_id} (${phone.id}) отправлена в спор, нужно проверить сделку`, tgId, mainPort);
  } else {
    logger.warn(`Не удалось отправить сделку (${phone.deal_id}, ${phone.id}) в спор`);
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    await sendTgNotify(`(sky) Не удалось отправить сделку (${phone.deal_id}, ${phone.id}) в спор, нужно проверить сделку`, tgId, mainPort);
  }

  const evaluateFuncChat = `messageDeal('[accessKey]', '[authKey]', 'Денег не поступало', '${phone.buyer}', '${phone.type}')`;
  const resultChat = await browser.evalute({ code: evaluateFuncChat });
  if (!resultChat) {
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    await ignoreDeal(redis, { id: phone.deal_id, state: 'paid' });
    return await sendTgNotify(`(sky) Неудалось отправить сообщение в чат сделки ${phone.deal_id} (${phone.id}) ('Денег не поступало', ${phone.amount}), нужно обработать самому`, tgId, mainPort);
  }

  // отключение сделок
  const evaluateFuncTradingStatus = `tradingStatus('[accessKey]', '[authKey]', false)`;
  const resultTradingStatus = await browser.evalute({ code: evaluateFuncTradingStatus });
  if (!resultTradingStatus) {
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    await ignoreDeal(redis, { id: phone.deal_id, state: 'paid' });
    return await sendTgNotify(`(sky) Неудалось отключить сделки из-за спора, проверьте сами`, tgId, mainPort);
  }
}

async function cancelDeal(browser: Remote<WorkerBrowser>, deal: DetailsDeal) {
  logger.info(`Отменяем сделку ${deal.id}`);
  const evaluateFunc = `cancelDeal('[accessKey]', '[authKey]', '${deal.id}')`;
  try {
    await browser.evalute({ code: evaluateFunc });
    return true;
  } catch (e: unknown) {
    return false;
  }
} 

async function disputDeal(redis: Remote<WorkerRedis>, deal: DetailsDeal) {
  logger.info(`Сделка ${deal.id} (${deal.deal_id}) находится в споре, освобождение и отправка уведомления`);

  const phone = await redis.getPhoneDeal(deal.id);
  if (phone) {
    logger.log(`Сделка ${deal.id} (${deal.deal_id}) найден телефон в базе, особождаем`);
    await redis.delPhoneDeal(deal.id);
  } else logger.log(`Сделка ${deal.id} (${deal.deal_id}) не найден телефон`);

  logger.log(`Ставим игнор на сделку ${deal.id}`);
  await ignoreDeal(redis, deal);

  logger.log(`Отправляем уведомление о споре сделки ${deal.id} (${deal.deal_id})`);
  const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
  await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) была открыта в споре`, tgId, mainPort);
}

async function closedDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal) {
  logger.info(`Сделка ${deal.id} (${deal.deal_id}) завершена, очищаем телефон и ставим лайк`);
  logger.log(`Сделка ${deal.id} (${deal.deal_id}) очищаем телефон`);
  const phone = await redis.getPhoneDeal(deal.id);
  await redis.delPhoneDeal(deal.id);
  logger.log(`Сделка (${deal.id}, ${deal.deal_id}) отправляем лайк пользователю`);
  const evaluateFunc = `likeDeal('[accessKey]', '[authKey]', '${deal.id}', '${deal.buyer.nickname}')`;
  const response = await browser.evalute({ code: evaluateFunc });
  if (!response) logger.warn(`Сделка ${deal.id} (${deal.deal_id}) не удалось поставить лайк`);
  else logger.info(`Сделка ${deal.id} (${deal.deal_id}) отправили лайк пользователю ${deal.buyer.nickname}`);
  logger.log(`Отправляем сделку ${deal.id} (${deal.deal_id}) в уведомление тг`);
  const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
  return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) была завершена, сумма ${deal.amount_currency}, телефон: ${phone?.requisite.text}`, tgId, mainPort);
}

async function proposedDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal) {
  const [isVerified, target_verif] = (await redis.getsConfig(['IS_VERIFIED', 'TARGET_VERIFIED'])) as [boolean, string];
  logger.info(`Проверка пользователя (${deal.buyer.nickname}) по верификации (${isVerified}, ${deal.id}, ${deal.deal_id})`);
  if (deal.buyer.nickname.slice(0, 2) === target_verif || isVerified === false) {
    const dataMethod = await findMethod(redis, deal);
    if (!dataMethod) return;

    // check pre phone
    const methodId = await get_method_id(dataMethod.methodStr);

    const amount = `${deal.amount_currency}`;

    logger.log(`Поиск предворительного телефона (${deal.id}, ${deal.deal_id}, ${deal.lot.id}, ${dataMethod.methodStr})`);
    const [paidUrl, servicePort] = await redis.getsConfig([`${dataMethod.methodStr.toUpperCase()}_PAID_URL` as KeyOfConfig, `${dataMethod.methodStr.toUpperCase()}_PORT` as KeyOfConfig]);
    const prePhone = await getNumber<{}>(`${paidUrl}:${servicePort}/`, Number(amount), methodId, deal.deal_id, true);
    if (!prePhone || ('result' in prePhone && prePhone.result === 0)) {
      logger.error(new Error(`Сделка ${deal.id} (${deal.deal_id}) не найдены предварительные реквизиты (${dataMethod.methodStr})`));
      const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
      await ignoreDeal(redis, deal);
      return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не найдены предварительные реквизиты, нужно проверить`, tgId, mainPort);
    }
    logger.log({ obj: prePhone }, `Предворительный телефон найден (${deal.id}, ${deal.deal_id}) ->`);

    logger.log(`Пользователь (${deal.buyer.nickname}) прошёл верификацию, подтверждение сделки (${deal.id}, ${deal.deal_id})`);
    const evaluateFunc = `statesNextDeal('[accessKey]', '[authKey]', '${deal.id}')`;
    const result = await browser.evalute({ code: evaluateFunc });
    if (result) {
      logger.info(`Успешное подтверждение принятия сделки (${deal.id}, ${deal.deal_id})`);
      return await requisiteDeal(redis, browser, deal, dataMethod);
    } else {
      logger.warn(`Не удалось подтвердить принятие сделки (${deal.id}, ${deal.deal_id}, ${result})`);
      const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
      return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не удалось подтвердить, обработайте сами`, tgId, mainPort);
    }
  } else {
    await ignoreDeal(redis, deal);
    logger.log(`Пользователь (${deal.buyer.nickname}) не прошёл верификацию, уведомление (${deal.id}, ${deal.deal_id})`);
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
    let isCancel = await cancelDeal(browser, deal);
    if (!isCancel) 
      return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не прошла верификацию пользователя, но не смогли отменить, обработайте сами`, tgId, mainPort)
    const url = await redis.getConfig('BLOCK_URL') as string;
    logger.log(`Отправляем запрос на блокировку (${url})`);
    const isBlock = await blockUser<{ status: boolean }>(url, deal.buyer.nickname, deal.symbol);
    if (!isBlock || !isBlock.status)
      return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не прошла верификацию пользователя, но не смогли заблокировать, обработайте сами`, tgId, mainPort)
    return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не прошла верификацию пользователя, отправили в бан`, tgId, mainPort);
  }
}

async function requisiteDeal(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, deal: DetailsDeal, dataMethod: Awaited<ReturnType<typeof findMethod>>) {
  if (!dataMethod) return;
  const methodId = await get_method_id(dataMethod.methodStr);

  const [tgId, mainPort, servicePort] = (await redis.getsConfig(['TG_ID', 'PORT', `${dataMethod.methodStr.toUpperCase()}_PORT` as KeyOfConfig])) as number[];

  const amount = `${deal.amount_currency}`;

  logger.log(`Поиск телефона (${deal.id}, ${deal.deal_id}, ${deal.lot.id}, ${dataMethod.methodStr})`);
  const paidUrl = await redis.getConfig(`${dataMethod.methodStr.toUpperCase()}_PAID_URL` as KeyOfConfig);
  const phone = await getNumber<PhoneServiceData>(`${paidUrl}:${servicePort}/`, Number(amount), methodId, deal.deal_id);
  if (!phone || ('result' in phone && phone.result === 0)) {
    logger.error(new Error(`Сделка ${deal.id} (${deal.deal_id}) не найдены реквизиты (${dataMethod.methodStr})`));
    await ignoreDeal(redis, deal);
    return await sendTgNotify(`(sky) Сделка ${deal.id} (${deal.deal_id}) не найдены реквизиты, нужно проверить`, tgId, mainPort);
  }
  logger.info({ obj: phone }, `Телефон найден (${deal.id}, ${deal.deal_id}) ->`);

  // send requisite
  logger.log(`Отправка реквизитов (${deal.id}, ${deal.deal_id}): ${phone.requisite.requisite_text}`);
  const evaluateFuncRequisite = `requisiteDeal('[accessKey]', '[authKey]', '${deal.id}', '${phone.requisite.requisite_text}')`;
  const resultRequisite = await browser.evalute({ code: evaluateFuncRequisite });
  if (!resultRequisite) {
    await ignoreDeal(redis, deal);
    return await sendTgNotify(
      `(sky) Неудалось отправить реквизиты сделки ${deal.id} (${deal.deal_id}) (${phone.requisite.text}, ${amount}), нужно обработать самому (поставить в игнор, очистить сделку в скае)`,
      tgId,
      mainPort,
    );
  }

  // send chat
  logger.log(`Отправка сообщения в чат (${deal.id}, ${deal.deal_id}): ${phone.requisite.chat_text}`);
  const evaluateFuncChat = `messageDeal('[accessKey]', '[authKey]', '${phone.requisite.chat_text}', '${deal.buyer.nickname}', '${deal.symbol}')`;
  const resultChat = await browser.evalute({ code: evaluateFuncChat });
  if (!resultChat) {
    await ignoreDeal(redis, deal);
    return await sendTgNotify(`(sky) Неудалось отправить сообщение в чат сделки ${deal.id} (${deal.deal_id}) (${phone.requisite.text}, ${amount}), нужно обработать самому`, tgId, mainPort);
  }

  // save redis phone
  logger.log(`Сохраняем сделку и телефон (${deal.id}, ${deal.deal_id}, ${deal.deal_id}, ${phone.requisite.text}, ${amount})`);
  const now = Date.now();
  redis.setPhone({
    method: dataMethod.methodStr,
    create_at: now,
    unlock_at: now,
    id: deal.deal_id,
    deal_id: deal.id,
    type: deal.symbol,
    amount: deal.amount_currency,
    buyer: deal.buyer.nickname,
    amount_type: deal.amount,
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
  const dataMethod = await findMethod(redis, deal);
  if (!dataMethod) return;

  const phone = await redis.getPhoneDeal(deal.id);
  if (!phone) return logger.warn(`Сделка ${deal.id} (${deal.deal_id}) была в состоянии paid, но не имеет телефона`);
  const [paidUrl, servicePort] = await redis.getsConfig([`${dataMethod.methodStr.toUpperCase()}_PAID_URL` as KeyOfConfig, `${dataMethod.methodStr.toUpperCase()}_PORT` as KeyOfConfig]);
  const response = await unlockNumber(`${paidUrl}:${servicePort}/`, String(phone.id));
  if (!response) return logger.warn(`Сделка ${deal.id} (${deal.deal_id}) не удалось unlock number для проверки телефона`);
  const now = Date.now();
  await redis.setPhone({ ...phone, unlock_at: now });
  logger.info(`Сделка ${deal.id} (${deal.deal_id}) успешно отправлена на проверку телефона`);
}

async function balance(redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>, phone: PhoneServiceData) {
  const isLimit = phone.amount <= phone.requisite.max_payment_sum && phone.amount >= phone.requisite.min_payment_sum;
  if (!isLimit) {
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
    await ignoreDeal(redis, { id: phone.deal_id } as DetailsDeal);
    return await sendTgNotify(
      `(sky) Сделка ${phone.deal_id} (${phone.id}) не подходит по лимитам (${phone.requisite.min_payment_sum}, ${phone.amount}, ${phone.requisite.max_payment_sum})`,
      tgId,
      mainPort,
    );
  }

  // освобождаем телефон
  // logger.log(`Освобождаем телефон сделки ${phone.deal_id}`);
  // await redis.delPhoneDeal(phone.deal_id);

  // откуп
  const val = phone.amount_type;
  const cur = phone.type;
  const market = cur === 'btc' ? 'btcrub' : 'usdtrub';
  const val_perc = val * 1.005;
  const otk = await sendGet('http://51.68.137.132:20000/?cmd=order&volume=' + val_perc + '&market=' + market);
  logger.info(`Откуп (${phone.deal_id}, val=${val_perc}, ${market}, Откуп результат:${otk})`);

  logger.log(`Отправка на завершение сделки ${phone.deal_id}`);
  const evaluateFunc = `statesNextDeal('[accessKey]', '[authKey]', '${phone.deal_id}')`;
  const result = await browser.evalute({ code: evaluateFunc });
  if (result) {
    logger.info(`Успешно отправили на завершение сделку ${phone.deal_id}`);
    const evaluateFunc = `getDeal('[accessKey]', '[authKey]', '${phone.deal_id}')`;
    const data: DetailsDeal | null = (await browser.evalute({ code: evaluateFunc })) as DetailsDeal | null;
    if (!data) {
      const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
      logger.warn(`Сделка ${phone.deal_id} (${phone.id}) не удалось отправить на завершение`);
      await ignoreDeal(redis, { id: phone.deal_id, state: 'paid' });
      return await sendTgNotify(`(sky) Сделка ${phone.deal_id} (${phone.id}) не удалось отправить за завершение, отправте на завершения сами (лайк тоже сами)`, tgId, mainPort);
    }
    return await closedDeal(redis, browser, data);
  } else {
    const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as number[];
    logger.warn(`Сделка ${phone.deal_id} (${phone.id}) не удалось отправить на завершение`);
    await ignoreDeal(redis, { id: phone.deal_id, state: 'paid' });
    return await sendTgNotify(`(sky) Сделка ${phone.deal_id} (${phone.id}) не удалось отправить за завершение, отправте на завершения сами (лайк тоже сами)`, tgId, mainPort);
  }
}

const main = () =>
  new Promise<number>(() => {
    // workers
    logger.log(`Запуск потоков`);
    const workerRedis = new Worker(path.resolve(dirname(fileURLToPath(import.meta.url)), './workers/redis.js'));
    const workerBrowser = new Worker(path.resolve(dirname(fileURLToPath(import.meta.url)), './workers/browser.js'));
    const workerServer = new Worker(path.resolve(dirname(fileURLToPath(import.meta.url)), './workers/server.js'));

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
    const timerPhone = async (redis: Remote<WorkerRedis>) => {
      const { phonesDispute } = await redis.timerPhone();
      for (let indexDispute = 0; indexDispute < phonesDispute.length; indexDispute++) {
        const phone = phonesDispute[indexDispute];
        // await redis.delPhoneDeal(phone.deal_id);
        // const [tgId, mainPort] = (await redis.getsConfig(['TG_ID', 'PORT'])) as [number, number];
        // await sendTgNotify(`(sky) Сделка ${phone.deal_id} ушла в таймоут, проверьте её (${phone.id}, ${phone.requisite.text})`, tgId, mainPort);
        Promise.resolve(disputePhone(redis, browser, phone));
      }
    };

    const next = async () => {
      browser.updateKeys();
      // loggerBrowser.info(`Успешное обновление ключей (первое), старт итераций`);
      pollingDeals(redis, getDeals.bind(null, redis, browser));
      pollingPhone(redis, timerPhone.bind(null, redis));
      workerServer.on('message', (data) => {
        if ('command' in data && data.command === 'balance') balance.call(null, redis, browser, data.phone);
      });
    };

    const headless = process.argv.includes('--headless');
    const initBrowser = () => {
      browser
        .initBrowser(headless)
        .then(next)
        .catch(() => {
          logger.warn(`Не удалось запустить браузер, попытка запустить`);
          initBrowser();
        });
    };

    try {
      redis.initClient().then(() => {
        server.init();
        initBrowser();
      });
    } catch (error: unknown) {
      logger.error(error);
    }
  });

main().catch((error: unknown) => {
  logger.error(error);
  process.exit(1);
});

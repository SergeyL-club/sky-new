import type { TransferListItem } from 'node:worker_threads';
import type WorkerRedis from './workers/redis.js';
import type WorkerBrowser from './workers/browser.js';
import type WorkerServer from './workers/server.js';
import type { Remote } from 'comlink';
import type { Deal } from './workers/redis.js';

import path from 'path';
import { wrap } from 'comlink';
import logger, { loggerBrowser } from './utils/logger.js';
import { Worker } from 'node:worker_threads';
import { pollingDeals } from './utils/timer.js';

const getDeals = async (redis: Remote<WorkerRedis>, browser: Remote<WorkerBrowser>) => {
  logger.info(`Получение списка сделок`);
  const params = (symbol: 'btc' | 'usdt', currency: 'rub', offset: number, limit: number) => ({ symbol, currency, offset, limit });
  const code = (data: ReturnType<typeof params>) => `new Promise((resolve) => getDeals('[authKey]', ${JSON.stringify(data)}).then(resolve).catch(() => resolve([])))`;

  const btcLimit = await redis.getConfig('POLLING_DEALS_LIMIT_BTC');
  const usdtLimit = await redis.getConfig('POLLING_DEALS_LIMIT_USDT');
  const btcParams = params('btc', 'rub', 0, btcLimit as number);
  const usdtParams = params('usdt', 'rub', 0, usdtLimit as number);

  const btcIs = await redis.getConfig('POLLING_DEALS_BTC');
  let btcDeals = [] as Deal[];
  if (btcIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(btcParams)}`);
    btcDeals = (await browser.evalute({ code: code(btcParams) })) as Deal[];
    logger.log(`Получено ${btcDeals.length}`);
  }

  const usdtIs = await redis.getConfig('POLLING_DEALS_USDT');
  let usdtDeals = [] as Deal[];
  if (usdtIs) {
    logger.info(`Получение списка с данными ${JSON.stringify(usdtParams)}`);
    usdtDeals = (await browser.evalute({ code: code(usdtParams) })) as Deal[];
    logger.log(`Получено ${usdtDeals.length}`);
  }

  const newDeals = [] as Deal[];
  const allDeals = btcDeals.concat(usdtDeals);
  logger.info(`Общее количество сделок ${allDeals.length}`);
  for (let indexDeal = 0; indexDeal < allDeals.length; indexDeal++) {
    const deal = allDeals[indexDeal];
    const oldDeal = await redis.getDeal(deal.id);
    if (!oldDeal) newDeals.push(deal);
  }
  logger.info(`Количество новых сделок ${newDeals.length}`);
  logger.log(`Обновление списка в памяти`);
  await redis.clearDeals();
  await redis.setDeals(allDeals);

  logger.log(`Отправляем на обработку новые сделки`);
  for (let indexNewDeal = 0; indexNewDeal < newDeals.length; indexNewDeal++) {
    const deal = newDeals[indexNewDeal];
    // TODO: обработка deal
  }
};

const main = () =>
  new Promise<number>((_) => {
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

    try {
      redis.initClient().then(() => {
        server.init();
      });
      browser.initBrowser().then(() => {
        browser.updateKeys().then(() => {
          loggerBrowser.info(`Успешное обновление ключей (первое), старт итераций`);
          pollingDeals(redis, getDeals.bind(null, redis, browser));
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

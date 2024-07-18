import path from 'path';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import logger from './utils/logger.js';
import { Worker } from 'node:worker_threads';
import type { TransferListItem } from 'node:worker_threads';
import type { WorkerBrowser } from './workers/browser.js';
import { delay } from './utils/dateTime.js';

const main = () =>
  new Promise<number>((_, reject) => {
    // создание потока на browser
    logger.info('Создание отдельного потока для browser');
    const workerBrowser = new Worker(path.resolve(import.meta.dirname, './workers/browser.js'));
    const workerBrowserAdapter = new MessageChannel();

    // задать отключение нужных параметров при неизвестном выходе процесса (его закрытие, пример: когда дебаг поток на браузер остается если его принудильно закрыть)
    process.on('exit', () => {
      workerBrowser.postMessage({ exit: 1 });
    });

    // код после запуска browser
    const next = async (browser: Remote<WorkerBrowser>, code: boolean) => {
      if (!code) new Error('Не удалось инициализировать browser');
      browser.loop();
      await delay(20000);
      const paramsBtcOne = {
        symbol: 'btc',
        currency: 'rub',
        offset: 0,
        limit: 10,
      };
      const codeGet = `new Promise((resolve) => getDeals('[authKey]', ${JSON.stringify(paramsBtcOne)}).then(resolve).catch(() => resolve([])))`;
      const result = await browser.evalute({ code: codeGet });
      logger.log({ obj: { btcOne: result } }, 'Результат запроса на список сделок');
    };

    try {
      // инициализация browser (его привязка)
      logger.info('Привязка потока browser к core потоку');
      const browser = wrap<WorkerBrowser>(workerBrowserAdapter.port1);
      workerBrowser.once('message', next.bind(this, browser));
      workerBrowser.postMessage({ port: workerBrowserAdapter.port2 }, [workerBrowserAdapter.port2 as unknown as TransferListItem]);
    } catch (error: unknown) {
      workerBrowser.postMessage({ exit: 1 });
      reject(error);
    }
  });

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });

import path from 'path';
import logger from './utils/logger.js';
import { generateWorkerChannel } from './utils/worker.js';

interface WorkerData {
  test: number;
}

const main = () =>
  new Promise<number>((resolve, reject) => {
    if (process.argv.length > 10) reject(new Error('Argv length > 10'));

    const workerTest = generateWorkerChannel<any, any>(path.resolve(import.meta.dirname, './workers/workerGetDeals.js'), (code) =>
      logger.warn(`Поток был закрыт с кодом ${code} (${workerTest.worker.threadId})`),
    );

    workerTest
      .post({ test: 1 })
      .then(console.log)
      .catch(console.error)
      .finally(() => {
        workerTest.post({ event: 'stop' }).then((data) => {
          console.log(data);
          resolve(0);
        });
      });
  });

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });

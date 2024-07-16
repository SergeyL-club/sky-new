import path from 'path';
import logger from './utils/logger.js';
import { generateWorkerChannel } from './utils/worker.js';
import browser from './utils/browser.js';

type WorkerData = {
  test: number;
}

const main = () =>
  new Promise<number>((_, reject) => {
    try {
      browser.initBrowser();
    } catch (error: unknown) {
      reject(error);
    }
  });

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });

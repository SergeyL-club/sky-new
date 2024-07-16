import logger from './utils/logger.js';
import browser from './utils/browser.js';

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

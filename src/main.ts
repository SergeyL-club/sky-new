import logger from './utils/logger.js';

const main = () =>
  new Promise<number>((resolve, reject) => {
    if (process.argv.length > 10) reject(new Error('Argv length > 10'));

    resolve(0);
  });

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });

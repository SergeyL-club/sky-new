import type { Remote } from 'comlink';
import type WorkerRedis from '../workers/redis.js';

import { delay } from './dateTime.js';

export function pollingDeals(redis: Remote<WorkerRedis>, callback: () => void | Promise<void>) {
  redis.getConfig('POLLING_DEALS').then((polling) => {
    redis.getConfig('DELAY_POLLING_DEALS').then((delayCycle) => {
      if (polling) Promise.resolve(callback());
      delay(delayCycle as number).finally(() => pollingDeals.call(null, redis, callback));
    });
  });
}

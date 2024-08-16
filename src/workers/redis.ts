import type { PuppeteerLifeCycleEvent } from 'puppeteer';
// import type WorkerBrowser from './browser.js';
// import type WorkerServer from './server.js';
// import type { Remote } from 'comlink';

import { expose } from 'comlink';
import * as CONFIG from '../config.js';
import { parentPort } from 'node:worker_threads';
import { createClient, RedisClientType } from 'redis';
import { loggerRedis } from '../utils/logger.js';

type ServerCommands = 'server' | 'browser' | 'exit' | 'connect';
type KeyOfConfig = keyof typeof CONFIG;
type TypeOfConfig = typeof CONFIG;
type ValueType = string | number | boolean | PuppeteerLifeCycleEvent[] | [string, string] | undefined;

// cache deal
export type CacheDeal = {
  id: string;
  state: string;
};

// details deal
export type DetailsDeal = {};

// channels
// let browser: Remote<WorkerBrowser> | null = null;
// let server: Remote<WorkerServer> | null = null;

class WorkerRedis {
  private static instance: WorkerRedis;

  private redis: RedisClientType = createClient({ url: CONFIG['URL_REDIS'], database: CONFIG['DB_REDIS'] });

  constructor() {
    if (WorkerRedis.instance) return WorkerRedis.instance;
    WorkerRedis.instance = this;
  }

  private convertRedisToConfig = <Type extends KeyOfConfig>(data: string, key: Type): TypeOfConfig[Type] => {
    if (typeof CONFIG[key] == 'boolean') return Boolean(Number(data)) as TypeOfConfig[Type];
    if (typeof CONFIG[key] == 'number') return Number(data) as TypeOfConfig[Type];
    if (Array.isArray(CONFIG[key]) || typeof CONFIG[key] == 'object') return JSON.parse(data);
    return data as TypeOfConfig[Type];
  };

  private convertConfigToRedis = (data: ValueType, key: KeyOfConfig): string => {
    if (typeof CONFIG[key] == 'boolean') return String(Number(data));
    if (typeof CONFIG[key] == 'number') return String(data);
    if (Array.isArray(CONFIG[key]) || typeof CONFIG[key] == 'object') return JSON.stringify(data);
    return data as string;
  };

  setConfig = async <Type extends KeyOfConfig>(key: Type, value: TypeOfConfig[Type]) => {
    try {
      const data = this.convertConfigToRedis(value, key);
      await this.redis?.hSet(CONFIG['DATA_PATH_REDIS_CONFIG'], key, data);
      return true;
    } catch {
      return false;
    }
  };

  getConfig = async <Type extends KeyOfConfig>(key: Type): Promise<TypeOfConfig[Type]> => {
    const data = await this.redis?.hGet(CONFIG['DATA_PATH_REDIS_CONFIG'], key);
    if (!data) return CONFIG[key] as TypeOfConfig[Type];
    return this.convertRedisToConfig(data, key) as TypeOfConfig[Type];
  };

  initClient = async () => {
    loggerRedis.log(`Инициализация сокета redis`);
    await this.redis.connect();
    loggerRedis.info(`Инициализация сокета redis успешно`);
  };

  setCacheDeal = async (deals: CacheDeal[]) => {
    try {
      await this.redis.set(CONFIG['DATA_PATH_REDIS_DEALS_CACHE'], JSON.stringify(deals));
      return true;
    } catch {
      return false;
    }
  };

  getCacheDeals = async (): Promise<CacheDeal[]> => {
    try {
      const data = await this.redis.get(CONFIG['DATA_PATH_REDIS_DEALS_CACHE']);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  };

  // private setDealMulti = (multi: ReturnType<typeof this.redis.multi>, deal: Deal) => {
  //   const keys = Object.keys(deal);
  //   for (let indexKey = 0; indexKey < keys.length; indexKey++) {
  //     const key = keys[indexKey] as keyof Deal;
  //     const value = deal[key as keyof Deal];
  //     const data = this.convertDealToRedis(value, key);
  //     multi.hSet(`${CONFIG['DATA_PATH_REDIS_DEALS']}:${deal.id}`, key, data);
  //   }
  // };

  // private getDealMulti = (multi: ReturnType<typeof this.redis.multi>, id: string) => {
  //   const keys = Object.keys(this.defaultDeal);
  //   for (let indexKey = 0; indexKey < keys.length; indexKey++) {
  //     const key = keys[indexKey] as keyof Deal;
  //     multi.hGet(`${CONFIG['DATA_PATH_REDIS_DEALS']}:${id}`, key);
  //   }
  // };
  // private remDealMulti = (multi: ReturnType<typeof this.redis.multi>, path: string) => {
  //   const keys = Object.keys(this.defaultDeal);
  //   for (let indexKey = 0; indexKey < keys.length; indexKey++) {
  //     const key = keys[indexKey] as keyof Deal;
  //     multi.hDel(path, key);
  //   }
  // };

  // setDeal = async (deal: Deal) => {
  //   try {
  //     const multi = this.redis.multi();
  //     this.setDealMulti(multi, deal);
  //     await multi.exec();
  //     return true;
  //   } catch {
  //     return false;
  //   }
  // };

  // setDeals = async (deals: Deal[]) => {
  //   const multi = this.redis.multi();
  //   for (let indexDeal = 0; indexDeal < deals.length; indexDeal++) {
  //     const deal = deals[indexDeal];
  //     this.setDealMulti(multi, deal);
  //   }

  //   try {
  //     await multi.exec();
  //     return true;
  //   } catch {
  //     return false;
  //   }
  // };

  // getDeal = async (id: string) => {
  //   try {
  //     const multi = this.redis.multi();
  //     this.getDealMulti(multi, id);
  //     const result = await multi.exec();
  //     const deal = {} as Deal;

  //     const keys = Object.keys(this.defaultDeal);
  //     for (let indexKeys = 0; indexKeys < keys.length; indexKeys++) {
  //       const key = keys[indexKeys] as keyof Deal;
  //       deal[key] = this.convertRedisToDeal(result[indexKeys] as string, key) as never;
  //     }

  //     if (!deal.id) return null;
  //     return deal;
  //   } catch {
  //     return null;
  //   }
  // };

  // getDeals = async (ids: string[]) => {
  //   try {
  //     const deals = [] as (Deal | null)[];
  //     for (let indexIds = 0; indexIds < ids.length; indexIds++) {
  //       const id = ids[indexIds];
  //       deals.push(await this.getDeal(id));
  //     }

  //     return deals;
  //   } catch {
  //     return [];
  //   }
  // };

  // clearDeals = async () => {
  //   const multi = this.redis.multi();
  //   const dealsPath = await this.redis.keys(`${CONFIG['DATA_PATH_REDIS_DEALS']}:*`);
  //   for (let indexDeal = 0; indexDeal < dealsPath.length; indexDeal++) {
  //     const path = dealsPath[indexDeal];
  //     this.remDealMulti(multi, path);
  //   }
  //   try {
  //     await multi.exec();
  //     return true;
  //   } catch {
  //     return false;
  //   }
  // };
}

const worker = new WorkerRedis();

parentPort?.on('message', async (message) => {
  if ('command' in message)
    switch (message.command as ServerCommands) {
      case 'browser':
        // browser = wrap<WorkerBrowser>(message['port']);
        break;
      case 'server':
        // server = wrap<WorkerServer>(message['port']);
        break;
      case 'connect':
        expose(worker, message['port']);
        break;
      case 'exit':
        process.exit(message['code']);
    }
});

export default WorkerRedis;

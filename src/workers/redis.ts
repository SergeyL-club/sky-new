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

// phone
export type PhoneServiceData = {
  requisite: {
    text: string;
    chat_text: string;
    requisite_text: string;
    min_payment_sum: number;
    max_payment_sum: number;
  };
  id: number;
  deal_id: string;
  create_at: number;
  unlock_at: number;
};

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

  getsConfig = async <Type extends KeyOfConfig>(keys: Type[]): Promise<TypeOfConfig[Type][]> => {
    const datas = [] as TypeOfConfig[Type][];
    for (let indexKey = 0; indexKey < keys.length; indexKey++) {
      const key = keys[indexKey];
      const data = await this.redis?.hGet(CONFIG['DATA_PATH_REDIS_CONFIG'], key);
      if (!data) datas.push(CONFIG[key] as TypeOfConfig[Type]);
      else datas.push(this.convertRedisToConfig(data, key) as TypeOfConfig[Type]);
    }
    return datas;
  };

  initClient = async () => {
    loggerRedis.log(`Инициализация сокета redis`);
    await this.redis.connect();
    loggerRedis.info(`Инициализация сокета redis успешно`);
  };

  setCacheDeal = async (deals: CacheDeal[]) => {
    try {
      const path = (await this.getConfig('DATA_PATH_REDIS_DEALS_CACHE')) as string;
      await this.redis.set(path, JSON.stringify(deals));
      return true;
    } catch {
      return false;
    }
  };

  getCacheDeals = async (): Promise<CacheDeal[]> => {
    try {
      const path = (await this.getConfig('DATA_PATH_REDIS_DEALS_CACHE')) as string;
      const data = await this.redis.get(path);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  };

  setPhone = async (phone: PhoneServiceData) => {
    try {
      const path = (await this.getConfig('DATA_PATH_REDIS_PHONE')) as string;
      await this.redis.set(path + phone.requisite.text, JSON.stringify(phone));
      return true;
    } catch {
      return false;
    }
  };

  getPhone = async (requisite: string) => {
    try {
      const path = (await this.getConfig('DATA_PATH_REDIS_PHONE')) as string;
      const data = await this.redis.get(path + ':' + requisite);
      if (!data) return null;
      return data;
    } catch {
      return null;
    }
  };

  getPhoneDeal = async (dealId: string) => {
    try {
      const path = (await this.getConfig('DATA_PATH_REDIS_PHONE')) as string;
      const phones = await this.redis.keys(path + ':*');
      for (let indexPhone = 0; indexPhone < phones.length; indexPhone++) {
        const pathPhone = phones[indexPhone];
        const data = await this.redis.get(pathPhone);
        if (!data) continue;
        const phone = JSON.parse(data) as PhoneServiceData;
        if (phone.deal_id === dealId) return phone;
      }
      return null;
    } catch {
      return null;
    }
  };

  delPhoneDeal = async (dealId: string) => {
    try {
      const phone = await this.getPhoneDeal(dealId);
      if (!phone) return false;

      const path = (await this.getConfig('DATA_PATH_REDIS_PHONE')) as string;
      await this.redis.del(path + ':' + phone.requisite.text);

      return true;
    } catch {
      return false;
    }
  };
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

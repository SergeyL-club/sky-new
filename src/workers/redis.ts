import type { PuppeteerLifeCycleEvent } from 'puppeteer';
import type WorkerBrowser from './browser.js';
import type WorkerServer from './server.js';
import type { Remote } from 'comlink';

import { expose, wrap } from 'comlink';
import * as CONFIG from '../config.js';
import { parentPort } from 'node:worker_threads';
import { createClient, RedisClientType } from 'redis';
import { loggerRedis } from '../utils/logger.js';

type ServerCommands = 'server' | 'browser' | 'exit' | 'connect';
type KeyOfConfig = keyof typeof CONFIG;
type TypeOfConfig = typeof CONFIG;
type ValueType = string | number | boolean | PuppeteerLifeCycleEvent[] | [string, string] | undefined;

// channels
let browser: Remote<WorkerBrowser> | null = null;
let server: Remote<WorkerServer> | null = null;

class WorkerRedis {
  private static instance: WorkerRedis;

  private redis: RedisClientType = createClient();

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
      await this.redis?.hSet(`sky:config`, key, data);
      return true;
    } catch {
      return false;
    }
  };

  getConfig = async <Type extends KeyOfConfig>(key: Type): Promise<TypeOfConfig[Type]> => {
    const data = await this.redis?.hGet(`sky:config`, key);
    if (!data) return CONFIG[key];
    return this.convertRedisToConfig(data, key);
  };

  initClient = async () => {
    loggerRedis.log(`Инициализация сокета redis`);
    await this.redis.connect();
    loggerRedis.info(`Инициализация сокета redis успешно`);
  };
}

const worker = new WorkerRedis();

parentPort?.on('message', async (message) => {
  if ('command' in message)
    switch (message.command as ServerCommands) {
      case 'browser':
        browser = wrap<WorkerBrowser>(message['port']);
        break;
      case 'server':
        server = wrap<WorkerServer>(message['port']);
        break;
      case 'connect':
        expose(worker, message['port']);
        break;
      case 'exit':
        process.exit(message['code']);
    }
});

export default WorkerRedis;

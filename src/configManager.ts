import type { RedisClientType } from '@redis/client';
import { createClient } from 'redis';
import * as CONFIG from './config.js';
import type { PuppeteerLifeCycleEvent } from 'puppeteer';

type KeyOfConfig = keyof typeof CONFIG;
type TypeOfConfig = typeof CONFIG;
type ValueType = string | number | boolean | PuppeteerLifeCycleEvent[] | [string, string] | undefined;

class ConfigManager {
  private static instance: ConfigManager;

  redis: RedisClientType = createClient();

  constructor() {
    if (ConfigManager.instance) return ConfigManager.instance;
    ConfigManager.instance = this;
  }

  convertRedisToConfig = <Type extends KeyOfConfig>(data: string, key: Type): TypeOfConfig[Type] => {
    if (typeof CONFIG[key] == 'boolean') return Boolean(Number(data)) as TypeOfConfig[Type];
    if (typeof CONFIG[key] == 'number') return Number(data) as TypeOfConfig[Type];
    if (Array.isArray(CONFIG[key]) || typeof CONFIG[key] == 'object') return JSON.parse(data);
    return data as TypeOfConfig[Type];
  };

  convertConfigToRedis = (data: ValueType, key: KeyOfConfig): string => {
    if (typeof CONFIG[key] == 'boolean') return String(Number(data));
    if (typeof CONFIG[key] == 'number') return String(data);
    if (Array.isArray(CONFIG[key]) || typeof CONFIG[key] == 'object') return JSON.stringify(data);
    return data as string;
  };

  setConfig = async <Type extends KeyOfConfig>(key: Type, value: TypeOfConfig[Type]) => {
    try {
      let data = this.convertConfigToRedis(value, key);
      await this.redis.hSet(`sky:config`, key, data);
      return true;
    } catch {
      return false;
    }
  };

  getConfig = async <Type extends KeyOfConfig>(key: Type): Promise<TypeOfConfig[Type]> => {
    let data = await this.redis.hGet(`sky:config`, key);
    if (!data) return CONFIG[key];
    return this.convertRedisToConfig(data, key);
  };
}

export default new ConfigManager();

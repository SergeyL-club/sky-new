import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Remote } from 'comlink';
import type WorkerRedis from './redis.js';
// import type WorkerBrowser from './browser.js';

// import md5 from 'md5';
// import { ApiRequest } from '../utils/paid.js';
import { parentPort } from 'node:worker_threads';
import * as CONFIG from '../config.js';
import { fastify } from 'fastify';
import { expose, wrap } from 'comlink';
import { loggerServer } from '../utils/logger.js';
import { resolve } from 'node:path';
import { getDate } from '../utils/dateTime.js';
import { getLogs, readLogs } from '../utils/htmlLog.js';

type ServerCommands = 'browser' | 'redis' | 'exit' | 'connect';
type Events = 'config-set' | 'config-get' | 'logs' | 'menu';

type KeyOfConfig = keyof typeof CONFIG;
type TypeOfConfig = typeof CONFIG;

type Callback = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;
type Listen = {
  [key: string]: Callback;
};

type RequestQueryGetConfig = {
  command: 'config-get';
  name: keyof typeof CONFIG;
  menu?: boolean;
};

type RequestQuerySetConfig = {
  command: 'config-set';
  name: keyof typeof CONFIG;
  value: unknown;
  menu?: boolean;
};

type RequestQueryGetLog = {
  command: 'logs';
  limit?: number;
  type?: 'info' | 'log' | 'warn' | 'error';
};

type RequestQueryMenu = {
  command: 'menu';
  client?: boolean;
};

type RequestQuery = RequestQueryGetConfig | RequestQuerySetConfig | RequestQueryGetLog | { command: undefined };

// channels
let redis: Remote<WorkerRedis> | null = null;
// let browser: Remote<WorkerBrowser> | null = null;

class WorkerServer {
  private static instance: WorkerServer;
  private fastify: FastifyInstance | null;
  private listen: Listen;

  constructor() {
    this.fastify = null;
    this.listen = {};
    if (WorkerServer.instance) return WorkerServer.instance;
    WorkerServer.instance = this;
  }

  //   onNotifyMessage = async (request: ApiRequest, reply: FastifyReply) => {
  //     const data = request.body;
  //     logger.log('Уведомление о поступлении, данные:', data);
  //     const srcSign = data.sign;
  //     delete data.sign;
  //     const tmp: string[] = [];
  //     Object.keys(data)
  //       .sort()
  //       .forEach(function (k) {
  //         const v = (data as any)[k];
  //         tmp.push(v);
  //       });
  //     const hash = tmp.join(':');
  //     const sign = md5(hash + LOCAL_CONFIG['PAID_SECRET']);
  //     if (sign != srcSign) {
  //       logger.error(new Error(`Хеши не сходятся: ${srcSign}, ${sign}`));
  //       reply.send('error');
  //       return;
  //     }

  //     // TODO: заменить получение id, и обработку balance
  //     const id = await this.sManager.redis.loadIdNow(String(data.id));
  //     if (id) {
  //       this.sManager.balance(data);
  //       return await reply.send('ok');
  //     }
  //     return await reply.send('not');
  //   };

  on = (event: Events, callback: Callback) => {
    this.listen[event] = callback;
  };

  init = async () => {
    loggerServer.log(`Старт инициализации сервера`);

    loggerServer.log(`Инициализация fastify`);
    this.fastify = fastify({ logger: false });

    loggerServer.log(`Создание хука на путь /`);
    this.fastify.get(`/`, (request, reply) => {
      const query: RequestQuery = request.query as RequestQuery;
      const keys = Object.keys(this.listen);
      if ('command' in query)
        for (let indexListen = 0; indexListen < keys.length; indexListen++) {
          const callback = this.listen[keys[indexListen]];
          if (keys[indexListen] === query['command']) return callback(request, reply);
        }
      reply.status(404).send(`Нету страницы`);
    });

    loggerServer.log(`Получение порта`);
    const PORT = ((await redis?.getConfig('PORT')) ?? CONFIG['PORT']) as number;
    loggerServer.log(`Запуск listen`);
    this.fastify.listen({ port: PORT }, (err, addr) => {
      if (!err) loggerServer.info(`Завершение инициализации сервера [${addr}]`);
    });
  };
}

const worker = new WorkerServer();

worker.on('config-get', async (request, reply) => {
  const query: RequestQueryGetConfig = request.query as RequestQueryGetConfig;
  const data = (await redis?.getConfig(query.name)) ?? CONFIG[query.name];
  if (query.menu) return reply.status(200).send({ name: query.name, value: data });
  return reply.status(200).send(`Значение CONFIG[${query.name}]: ${JSON.stringify(data)}`);
});

const convertRequestToConfig = <Type extends KeyOfConfig>(data: string, key: Type): TypeOfConfig[Type] => {
  if (typeof CONFIG[key] == 'boolean') return Boolean(data === 'true') as TypeOfConfig[Type];
  if (typeof CONFIG[key] == 'number') return Number(data) as TypeOfConfig[Type];
  if (Array.isArray(CONFIG[key]) || typeof CONFIG[key] == 'object') return JSON.parse(data);
  return data as TypeOfConfig[Type];
};

worker.on('config-set', async (request, reply) => {
  const query: RequestQuerySetConfig = request.query as RequestQuerySetConfig;
  const data = await redis?.setConfig(query.name, convertRequestToConfig(query.value as string, query.name));
  if (!(query.name in CONFIG)) return reply.status(400).send();
  if (!data) return reply.status(400).send(`Значение не соответсвует CONFIG[${query.name}]: ${query.value} (${typeof query.value})`);
  const dataNow = (await redis?.getConfig(query.name)) ?? CONFIG[query.name];
  if (query.menu) return reply.status(200).send({ name: query.name, value: dataNow });
  return reply.status(200).send(`Значение CONFIG[${query.name}]: ${JSON.stringify(dataNow)}`);
});

worker.on('logs', async (request, reply) => {
  // TODO: сделать параметр date [year, month, day] чтобы можно было выбрать нужный лог
  const query: RequestQueryGetLog = request.query as RequestQueryGetLog;
  const date = getDate({ isMore: 'formatDate' });
  const fs = resolve(import.meta.dirname, `../../logs/${date}/[${date}]console_${query.type ?? 'all'}.log`);
  reply.type('text/html');

  const data = getLogs(readLogs(fs, query.limit ?? 10000000000000000));
  return reply.status(200).send(data);
});

// TODO: сделать ответ on notify message по телефону в balance

function generateHtml(html: string, code: string, style: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menu Config</title><style>${style}</style></head><body><div style="display:flex;flex-direction:column;">${html}</div><script>${code}</script></body></html>`;
}

worker.on('menu', async (request, reply) => {
  let html = '';
  const keys = Object.keys(CONFIG) as KeyOfConfig[];
  const values = (await redis?.getsConfig(keys)) as (string | number | boolean | [string, string])[];
  const query: RequestQueryMenu = request.query as RequestQueryMenu;
  const ignoreClient: KeyOfConfig[] = [
    'DATA_PATH_REDIS_CONFIG',
    'DATA_PATH_REDIS_DEALS_CACHE',
    'DB_REDIS',
    'DELAY_EVENT_MIN',
    'DELAY_EVENT_MAX',
    'PORT',
    'SELECTOR_AUTH_FORM',
    'SELECTOR_BTN_AUTH',
    'SELECTOR_ERROR',
    'SELECTOR_INPUT_EMAIL',
    'SELECTOR_INPUT_PASSWORD',
    'SELECTOR_URL_AUTH',
    'URL_DEALS',
    'URL_MAIN_AUTH',
    'URL_REDIS',
    'WAIT_TIMEOUT',
    'WAIT_UNTIL',
  ];

  for (let indexKey = 0; indexKey < keys.length; indexKey++) {
    const key = keys[indexKey] as KeyOfConfig;
    const value = values[indexKey];
    if (query.client && ignoreClient.includes(key)) continue;
    let valueHtml = '';
    if (typeof value === 'boolean') valueHtml = `<button id="${key}" onclick="setConfig('${key}', ${value})" data-value="${value}">${value ? 'Вкл' : 'Выкл'}</button>`;
    if (typeof value === 'string') valueHtml = `<input id="${key}" type="text" data-pre='${value}' value='${value}'/><button onclick="setConfig('${key}', '${value}')">Отправить</button>`;
    if (typeof value === 'number') valueHtml = `<input id="${key}" type="number" data-pre="${value}" value="${value}"/><button onclick="setConfig('${key}', ${value})">Отправить</button>`;
    if (Array.isArray(value) && typeof value[0] === 'string')
      valueHtml = `<span>RU-<input type="text" id="${key}_RU" data-pre='${value[0]}' value='${value[0]}'/></span><span>EN-<input id="${key}_EN" type="text" data-pre='${value[1]}' value='${value[1]}'/></span><button onclick="setConfig('${key}', [])">Отправить</button>`;

    html += `<span style='display:flex;gap:10px;margin-top:5px;flex-direction:row;'>Значение CONFIG[${key}]: ${valueHtml}</span>`;
  }
  const code = `function setConfig(key, value){
    const fetchConfig = (key, value) => fetch(window.location.origin + "/?command=config-set&name=" + key + "&value=" + value + "&menu=true");
    if (typeof value === "boolean") {
      const button = document.getElementById(key);
      const bool = button.dataset.value == "false" ? true : false;
      fetchConfig(key, bool).then((response) => {
        if (response.ok) {
          response.json().then((json) => {
            button.dataset.value = json["value"] ? "true" : "false";
            button.innerHTML = json["value"] ? "Вкл" : "Выкл";
          })
        }
      })
    } else if (typeof value === "string") {
      const inputString = document.getElementById(key);
      const nowValue = inputString.value;
      const oldValue = inputString.dataset.pre;
      fetchConfig(key, nowValue).then((response) => {
        if (response.ok) {
          response.json().then((json) => {
            inputString.dataset.pre = json["value"];
            inputString.value = json["value"];
          })
        } else inputString.value = oldValue; 
      })
    } else if (typeof value === "number") {
      const inputNumber = document.getElementById(key);
      const nowValue = inputNumber.value;
      const oldValue = inputNumber.dataset.pre;
      fetchConfig(key, nowValue).then((response) => {
        if (response.ok) {
          response.json().then((json) => {
            inputNumber.dataset.pre = "" + json["value"];
            inputNumber.value = "" + json["value"];
          })
        } else inputNumber.value = "" + oldValue; 
      })
    } else if (Array.isArray(value)) {
      const inputRu = document.getElementById(key + "_RU");
      const inputEn = document.getElementById(key + "_EN");
      const nowValueRu = inputRu.value;
      const oldValueRu = inputRu.dataset.pre;
      const nowValueEn = inputEn.value;
      const oldValueEn = inputEn.dataset.pre;
      fetchConfig(key, JSON.stringify([nowValueRu, nowValueEn])).then((response) => {
        if (response.ok) {
          response.json().then((json) => {
            inputRu.dataset.pre = json["value"][0];
            inputRu.value = json["value"][0];
            inputEn.dataset.pre = json["value"][1];
            inputEn.value = json["value"][1];
          })
        } else {
          inputRu.value = oldValueRu;
          inputEn.value = oldValueEn;
        } 
      })    
    }
  }`;

  return reply
    .status(200)
    .type('text/html')
    .send(generateHtml(html, code, ''));
});

parentPort?.on('message', async (message) => {
  if ('command' in message)
    switch (message.command as ServerCommands) {
      case 'redis':
        redis = wrap<WorkerRedis>(message['port']);
        break;
      case 'browser':
        // browser = wrap<WorkerBrowser>(message['port']);
        break;
      case 'connect':
        expose(worker, message['port']);
        break;
      case 'exit':
        process.exit(message['code']);
    }
});

export default WorkerServer;

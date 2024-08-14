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
type Events = 'config-set' | 'config-get' | 'logs';

type Callback = (request: FastifyRequest, reply: FastifyReply) => void | Promise<void>;
type Listen = {
  [key: string]: Callback;
};

type RequestQueryGetConfig = {
  command: 'config-get';
  name: keyof typeof CONFIG;
};

type RequestQuerySetConfig = {
  command: 'config-set';
  name: keyof typeof CONFIG;
  value: unknown;
};

type RequestQueryGetLog = {
  command: 'logs';
  limit?: number;
  type?: 'info' | 'log' | 'warn' | 'error';
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
  return reply.status(200).send(`Значение CONFIG[${query.name}]: ${JSON.stringify(data)}`);
});

worker.on('config-set', async (request, reply) => {
  const query: RequestQuerySetConfig = request.query as RequestQuerySetConfig;
  const data = await redis?.setConfig(query.name, query.value as string);
  if (!data) return reply.status(400).send(`Значение не соответсвует CONFIG[${query.name}]: ${query.value} (${typeof query.value})`);
  const dataNow = (await redis?.getConfig(query.name)) ?? CONFIG[query.name];
  return reply.status(200).send(`Значение CONFIG[${query.name}]: ${JSON.stringify(dataNow)}`);
});

worker.on('logs', async (request, reply) => {
  const query: RequestQueryGetLog = request.query as RequestQueryGetLog;
  const date = getDate({ isMore: 'formatDate' });
  const fs = resolve(import.meta.dirname, `../../logs/${date}/[${date}]console_${query.type ?? 'all'}.log`);
  reply.type('text/html');

  const data = getLogs(readLogs(fs, query.limit ?? 10000000000000000));
  return reply.status(200).send(data);
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

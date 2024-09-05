import type WorkerRedis from '../workers/redis.js';
import type { FastifyRequest } from 'fastify';
import type { Remote } from 'comlink';

import http from 'http';
import https from 'https';
import logger from './logger.js';

export type PayInfo = {
  sign?: string;
  sum: number;
  id: number;
  number: string;
  typ_check: string;
  num_inserts: number;
  mobile_insert: boolean;
  time: number;
};

export type ApiRequest = FastifyRequest<{
  Body: PayInfo;
}>;

export async function get_method_str(port: number, redis: Remote<WorkerRedis>) {
  const mtsPort = (await redis.getConfig('MTS_PORT')) as number;
  const yandexPort = -1;
  const qiwiPort = -1;
  const payeerPort = -1;
  if (port === mtsPort) return 'mts';
  if (port === yandexPort) return 'yandex';
  if (port === qiwiPort) return 'qiwi';
  if (port === payeerPort) return 'payeer';
  return '';
}

export async function get_method_id(str: Awaited<ReturnType<typeof get_method_str>>) {
  if (str == 'mts') return 1;
  if (str == 'qiwi') return 2;
  return -1;
}

export async function sendRequest<Type>(url: string, subUrl: string, maxRepeat = 3, cnt = 1): Promise<Type | false> {
  const localUrl = url + subUrl;
  const result = await sendGet(localUrl);
  if (result === false) {
    logger.error('Запрос не удался:', subUrl);
    if (cnt < maxRepeat) {
      logger.log('Повторная попытка(' + cnt + ')');
      return await sendRequest(url, subUrl, cnt + 1);
    }
    return false;
  }

  //console.log('request:', subUrl, 'answer:', result);
  return JSON.parse(result + '');
}

export async function unlockNumber(url: string, phone: string) {
  const subUrl = 'action=lock_check&number=' + phone + '&val=0';
  return await sendRequest(url, subUrl);
}

export async function lockNumber(url: string, phone: string) {
  const subUrl = 'action=lock_check&number=' + phone + '&val=1';
  return await sendRequest(url, subUrl);
}

export async function delNumber(url: string, phone: string) {
  const subUrl = 'action=del_number&number=' + phone;
  return await sendRequest(url, subUrl);
}

export async function delAndUnlock(url: string, phone: string) {
  await unlockNumber(url, phone);
  await delNumber(url, phone);
}

export async function getNumberPossible<Type>(url: string, sum: number, id: number = -1, isQiwi = false): Promise<Type> {
  let subUrl = `action=get_sim_possible&sum=${sum}&lock_check=1&is_qiwi=${isQiwi ? 1 : 0}`;
  if (id > -1) subUrl += '&id=' + id;
  return (await sendRequest(url, subUrl)) as Type;
}

export async function getNumber<Type>(url: string, sum: number, id: number = -1, isQiwi = false): Promise<Type> {
  let subUrl = `action=get_sim&sum=${sum}&lock_check=1&is_qiwi=${isQiwi ? 1 : 0}`;
  if (id > -1) subUrl += '&id=' + id;
  return (await sendRequest(url, subUrl)) as Type;
}

export async function lockSimTime(url: string, phone: string, time = 5 * 60) {
  const subUrl = 'action=set_wait&number=' + phone + '&time=' + time;
  return await sendRequest(url, subUrl);
}

// export async function getNumber<Type>(url: string, sum: number, method: Awaited<ReturnType<typeof get_method_id>>, id: number = -1, is_pre = false) {
//   let subUrl = `get-requisite?method_id=${method}&deal_id=${id}&sum=${sum}`;
//   if (is_pre) subUrl += '&test=1';
//   return await sendRequest<Type>(url, subUrl);
// }

// export async function unlockNumber<Type>(url: string, id: string) {
//   const subUrl = `start-checking-balance?deal_id=${id}`;
//   return await sendRequest<Type>(url, subUrl);
// }

export async function sendGet(url: string): Promise<string | false> {
  return new Promise((resolve) => {
    http
      .get(url, (resp) => {
        let data = '';

        resp.on('data', (chunk: string) => {
          data += chunk;
        });

        resp.on('end', () => {
          resolve(data);
        });
      })
      .on('error', (err: Error) => {
        console.error('Error get:', err.message);
        resolve(false);
      });
  });
}

export async function sendTgNotify(str: string, chat_id: number, port: number, tg_token = '1011294800:AAHJ51OwsdglVetposO1NuDit4QKK4p2yUw') {
  https.get(`https://api.telegram.org/bot${tg_token}/sendMessage?chat_id=` + chat_id + '&text=' + encodeURI(str)).on('error', (e) => {
    console.error(e);
  });
  if (str.includes('Паника')) {
    console.log('Отправляем панику для перезапуска');
    http.get('http://127.0.0.1:5050/?port=' + port);
  }
}

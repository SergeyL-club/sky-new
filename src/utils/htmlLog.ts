import type { Levels } from './logger.js';

import { existsSync, readFileSync } from 'node:fs';
import { renderTextLine, reversCustomLevels } from './logger.js';

export function readLogs(fname: string, limit: number) {
  if (!existsSync(fname)) return [];
  let str = readFileSync(fname, 'utf8');
  str = str.toString().trim();
  str = str.split('\r\n').join('\n');
  const list = str.split('$$$');
  const logs = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const str = list[i];
    logs.push(str);
    if (logs.length >= limit) break;
  }
  logs.reverse().shift();
  return logs;
}

export function getLogs(data: string[]) {
  let s = '<html><head><meta charset="UTF-8"></head><body style="background: #000;">';
  for (let i = 0; i < data.length; i++) {
    const d = JSON.parse(data[i]);
    const text = renderTextLine(d, reversCustomLevels[d['level'] as number] as Levels, true);
    s += text;
  }
  s += '</body></html>';
  return s;
}

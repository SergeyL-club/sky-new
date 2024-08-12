import path from 'path';
import { DestinationStream, MultiStreamOptions, pino, StreamEntry } from 'pino';
import { getDate } from './dateTime.js';
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'fs';

const customLevels = {
  log: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const ColorsStart = {
  log: '\x1b[0m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

type Levels = keyof typeof customLevels;

export const renderTextLine = <T extends string>(msg: T, level: Levels) => {
  const data = JSON.parse(msg);
  let text = '';
  text += `(${getDate({ isMore: 'format', actualDate: data['time'] })}) `;
  text += `[PID: ${data['pid']}, `;
  text += data['channel'] ? `CHANNEL: ${data['channel']}, ` : '';
  text += `${ColorsStart[level]}${level.toLocaleUpperCase()}${ColorsStart['log']}]: `;

  text += `${data.msg}`;
  if ('err' in data) {
    text += `\n${ColorsStart[level]}Message${ColorsStart['log']}: ${data['err']['message']}`;
    if ('stack' in data['err']) {
      let stack = data['err']['stack'];
      stack = stack.split('\n');
      if (stack[0].includes('Error:')) stack.shift();
      stack = stack.join('\n');
      text += '\n' + stack;
    }
  }

  if ('obj' in data) {
    text += `\n${ColorsStart[level]}Object${ColorsStart['log']}: `;
    text += `${JSON.stringify(data['obj'], null, 1)}`;
  }

  text += '\n';
  return text;
};

const destinationStreamFile = (level: string): DestinationStream => ({
  write: (msg) => {
    const data = JSON.parse(msg);
    const dirPath = path.resolve(import.meta.dirname, '../../logs');
    if (!existsSync(dirPath)) mkdirSync(dirPath);
    const filePath = `${dirPath}/[${getDate({ isMore: 'formatDate', actualDate: data['time'] })}]${level}.log`;

    const fd = openSync(filePath, 'a');
    writeSync(fd, msg, null, 'utf-8');
    closeSync(fd);
  },
});

const destinationStreamConsole = (level: Levels): DestinationStream => ({
  write: (msg) => {
    process.stdout.write(renderTextLine(msg, level));
  },
});

const steams: StreamEntry<Levels>[] = [
  { level: 'log', stream: destinationStreamFile('cosnole_all') },
  { level: 'info', stream: destinationStreamFile('cosnole_all') },
  { level: 'warn', stream: destinationStreamFile('cosnole_all') },
  { level: 'error', stream: destinationStreamFile('cosnole_all') },
  { level: 'log', stream: destinationStreamFile('console_log') },
  { level: 'info', stream: destinationStreamFile('console_info') },
  { level: 'warn', stream: destinationStreamFile('console_warn') },
  { level: 'error', stream: destinationStreamFile('console_error') },
  { level: 'log', stream: destinationStreamConsole('log') },
  { level: 'info', stream: destinationStreamConsole('info') },
  { level: 'warn', stream: destinationStreamConsole('warn') },
  { level: 'error', stream: destinationStreamConsole('error') },
];

const multistreamOpts: MultiStreamOptions = {
  dedupe: true,
  levels: customLevels,
};

const logger = pino<Levels>(
  {
    customLevels,
    level: 'log',
    useOnlyCustomLevels: true,
  },
  pino.multistream(steams, multistreamOpts),
);

export const loggerCore = logger.child({ channel: 'CORE' });
export const loggerBrowser = logger.child({ channel: 'BROWSER' });
export const loggerServer = logger.child({ channel: 'SERVER' });
export const loggerRedis = logger.child({ channel: 'REDIS' });

export default loggerCore;

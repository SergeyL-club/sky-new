import { parentPort } from 'node:worker_threads';

type Obj = {
  [key: string]: string | number | object;
};

type Data = Obj & {
  event?: 'stop';
};

if (!parentPort) process.exit(0);
parentPort.on('message', (msg: [string, string, Data]) => {
  if (!parentPort) process.exit(0);
  const [messageId, errorId, data] = msg;
  try {
    if ('event' in data && data['event'] === 'stop') {
      parentPort.postMessage([messageId, errorId, data]);
      process.exit(0);
    }
    parentPort.postMessage([messageId, errorId, data]);
  } catch (e: unknown) {
    parentPort.postMessage([errorId, messageId, e]);
  }
});

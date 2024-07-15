import { parentPort } from 'node:worker_threads';

parentPort!.on('message', (msg) => {
  const [messageId, errorId, data] = msg;
  try {
    if ('event' in data && data['event'] === 'stop') {
      parentPort!.postMessage([messageId, errorId, data]);
      process.exit(0);
    }
    parentPort!.postMessage([messageId, errorId, data]);
  } catch (e: unknown) {
    parentPort!.postMessage([errorId, messageId, e]);
  }
});

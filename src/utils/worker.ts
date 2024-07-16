import { Worker } from 'node:worker_threads';

type Callback<T> = (message: T) => void;

type Callbacks = {
  [key: number]: Callback<any>;
}

const generateId = (keys: Callbacks) => {
  let id = 0;
  while (keys[id]) {
    id++;
  }
  return id;
};

const generateWorkerChannel = <ResolveType extends any, PostMessageType extends any>(path: string, exit: Callback<number>) => {
  const worker = new Worker(path);

  const callbacks: Callbacks = {};

  worker.on('exit', (code: number) => exit(code));
  worker.on('message', (msg) => {
    const [currectId, lastId, data] = msg;
    if (callbacks[currectId]) {
      callbacks[currectId].call(null, data);
      delete callbacks[currectId];
    }
    if (callbacks[lastId]) delete callbacks[lastId];
  });

  return {
    worker,
    post: (message: PostMessageType) =>
      new Promise<ResolveType>((resolve, reject) => {
        const eventMessage: Callback<any> = (msg: any) => resolve(msg);
        const messageId = generateId(callbacks);
        callbacks[messageId] = eventMessage;

        const eventError = (msg: any) => reject(msg);
        const errorId = generateId(callbacks);
        callbacks[errorId] = eventError;

        worker.postMessage([messageId, errorId, message]);
      }),
  };
};

export { generateWorkerChannel };

var keys = [];

document['refreshSocket'] = () => {
  const socket = io('wss://ws.skycrypto.net', {
    transports: ['websocket'],
    path: '/sky-socket',
  });

  socket.on('update codedata', (data) => {
    keys = JSON.parse(data);
  });

  socket.on('connect', () => {
    socket.emit('2probe');
    console.log('connection');
  });
};

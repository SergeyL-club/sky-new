const messageDeal = async (token, key, message, receiver) =>
  new Promise((resolve, reject) => {
    const data = { receiver, message };
    const headers = {
      Authorization: `Bearer ${token}`,
      AuthKey: key,
      'Access-Control-Allow-Origin': '*',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Length': `${JSON.stringify(data).length}`,
      'Content-Type': 'application/json;charset=UTF-8',
    };

    const url = 'https://api.skycrypto.me/rest/v1/user-messages';

    fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    })
      .then(async (response) => {
        if (response.status === 200) {
          return true;
        } else {
          const json = await response.json();
          if (json['detail'] == 'Attempted spam messages') return true;
          throw new Error(`Status: ${response.status}, ${text}`);
        }
      })
      .then((e) => {
        resolve(e);
      })
      .catch((error) => {
        reject(error);
      });
  });

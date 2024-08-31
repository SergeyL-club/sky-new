const authPost = async (email, password) =>
  new Promise((resolve, reject) => {
    const data = { email, password };
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://skycrypto.me',
      Referer: 'https://skycrypto.me/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Length': `${JSON.stringify(data).length}`,
      'Content-Type': 'application/json;charset=UTF-8',
    };

    const refresh = 'https://api.skycrypto.me/rest/v1/auth/login';

    fetch(refresh, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    })
      .then(async (response) => {
        if (response.status === 200) {
          return await response.json();
        } else {
          throw new Error(`Status: ${response.status}, ${await response.text()}`);
        }
      })
      .then((e) => {
        resolve(e);
      })
      .catch((error) => {
        reject(error);
      });
  });

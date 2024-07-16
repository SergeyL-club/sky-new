const refresh = async () =>
  new Promise((resolve, reject) => {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${getCookie('sky_token')}`,
      Origin: 'https://skycrypto.me',
      Referer: 'https://skycrypto.me/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    };

    const refresh = 'https://api.skycrypto.me/rest/v1/codedata';

    fetch(refresh, {
      method: 'GET',
      headers: headers,
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Network response was not ok.');
        }
      })
      .then((e) => {
        resolve(e);
      })
      .catch((error) => {
        reject(error);
      });
  });
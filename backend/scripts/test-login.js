const http = require('http');

const data = JSON.stringify({
  email: 'cuentastrbx@gmail.com',
  password: 'password_falsa'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let resData = '';
  res.on('data', d => resData += d);
  res.on('end', () => console.log(`Status: ${res.statusCode}`, `Response:`, resData));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();

//使用nodejs自带的http、https模块
var http = require('http');
var https = require('https');
  
//根据项目的路径导入生成的证书文件
var privateKey = fs.readFileSync(path.join(__dirname, './certs/private.pem'), 'utf8')
var certificate = fs.readFileSync(path.join(__dirname, './certs/certificate.crt'), 'utf8')
var credentials = {key: privateKey, cert: certificate};
  
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

//可以分别设置http、https的访问端口号
var PORT = 7000;
var SSLPORT = 7001;
const port = parseInt(process.env.PORT, 10) || 8000;

// get Node Server instance when calling app.listen  
httpServer.listen(PORT, function() {
  console.log('HTTP Server is running on: http://localhost:%s', PORT);
});
//创建https服务器
httpsServer.listen(SSLPORT, function() {
  console.log('HTTPS Server is running on: https://localhost:%s', SSLPORT);
});

const nileHandler = require('./server/nileServer')(httpsServer, 10);

// parse application/json 
app.use(bodyParser.json())

// Serve static files
// app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'client')));

// Routes
// const nileHandler = nileServer(server);
app.use('/', nileHandler);
  
  
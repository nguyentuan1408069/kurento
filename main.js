const express = require('express');
var app = express();
const kurentoServer = require('./src/infrastructure/server');

kurentoServer(app);
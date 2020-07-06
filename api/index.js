
var url = require('url');
var express = require('express');
var app = express();
var http = require('http');
require('dotenv').config();
const database_url = process.env.DATABASE_URL;
const mongoose = require('mongoose');
const routes = require('./routers/routes')

mongoose.connect(database_url, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(()=> {
        console.log('Database connected');
    })
    .catch((error)=> {
        console.log('Error connecting to database,',error);
    });

const port = process.env.PORT_API;
app.use('/', routes)
app.listen(port, () => {console.log(`Server started on http://localhost: ${port}`)})

module.exports = app;
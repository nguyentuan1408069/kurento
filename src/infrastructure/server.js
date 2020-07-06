
var url = require('url');
var minimist = require('minimist');
var ws = require('ws');
var fs    = require('fs');
var https = require('https');
require('dotenv').config();

const RoomManager = require('../server');

var mongoose = require('mongoose');

var wss = null;
    
module.exports = (app) => {

    var argv = minimist(process.argv.slice(3), {
        default: {
            as_uri: `${process.env.AS_URI}`,
            ws_uri: `${process.env.WS_URI}`,
            file_uri: `${process.env.FILE_URI}`,
        }
    });
    
    var options =
    {
      key:  fs.readFileSync("src/keys/server.key"),
      cert: fs.readFileSync("src/keys/server.crt")
    };

    var database_url = process.env.DATABASE_URL;

    mongoose.connect(database_url, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(()=> {
        console.log('Database connected');
    })
    .catch((error)=> {
        console.log('Error connecting to database,',error);
    });
        
    var asUrl = url.parse(argv.as_uri);
    
    var port = asUrl.port;
    var server = https.createServer(options, app).listen(port, function() {
        console.log('Kurento Tutorial started');
        console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
    });
    wss = new ws.Server({
        server : server,
        path : '/one2many'
    });
        
    return new RoomManager(wss, argv)
};


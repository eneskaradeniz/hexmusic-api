require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoDB = require('./src/databases/mongodb/index');
const socketIO = require('socket.io');
const compression = require("compression");
const bodyParser = require('body-parser');

/*
const os = require('os');
const cluster = require('cluster');
const numCpu = os.cpus().length;
*/

const shared = require('./src/shared');
const Error = require('./src/controllers/ErrorController');

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// GZIP COMPRESS

const shouldCompress = (req, res) => {
  if (req.headers['x-no-compression']) {
    // don't compress responses if this request header is present
    return false;
  }

  // fallback to standard compression
  return compression.filter(req, res);
};

app.use(compression({
  // filter decides if the response should be compressed or not,
  // based on the `shouldCompress` function above
  filter: shouldCompress,
  // threshold is the byte threshold for the response body size
  // before compression is considered, the default is 1kb
  threshold: 0
}));

// START SERVER

const PORT = process.env.PORT || 3000;
const server = require('http').createServer(app);

server.listen(PORT, async () => {
    console.log("Listening on port", PORT);
    await mongoDB.connect();
});

// SOCKET.IO CONFIGURATION

const io = socketIO(server);

const db = require('mongoose');
const User = require('./src/models/UserModel');

const socketioJwt = require('socketio-jwt');
const jwtConfig = require('./src/config/jwt');

io.use(socketioJwt.authorize({
  secret: jwtConfig.secret,
  handshake: true,
  auth_header_required: true,
}));

io.on('connection', socket => {
  connect_socket(socket);

  console.log('sockets:', io.sockets.sockets);

  Object.keys(io.sockets.sockets).forEach((e) => {
    console.log('HELLO');
    console.log(e);
    const test = io.sockets.sockets[e];
    console.log('user_id:', test.decoded_token._id);
  });

  socket.on('disconnect', () => disconnect_socket(socket));
  socket.on("start_typing", (data) => start_typing(socket, data));
});

function connect_socket(socket) {
  try {
    var user_id = socket.decoded_token._id;
    console.log(`(${io.sockets.sockets.length})`, "CONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);

    // BU USERID LI BAŞKA SOCKET VARMI KONTROL ET
    const find_sockets = io.sockets.sockets.filter(x => x.decoded_token._id === user_id);
    find_sockets.forEach(x => {
      console.log('foreach:', x);
      if(x.id !== socket.id) {
        console.log('LOGOUT:', x.id);

        x.emit('logout');
        x.disconnect();
      } else {
        console.log('AYNI SOCKET ID DEVAM');
      }  
    });  
  } catch(err) {
    Error({
      file: 'server.js',
      method: 'connect_socket',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
}

function disconnect_socket(socket) {
  try {
    var user_id = socket.decoded_token._id;
    stop_music(user_id);

    console.log(`(${io.sockets.sockets.length})`, "DISCONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);
  } catch(err) {
    Error({
      file: 'server.js',
      method: 'leftUser',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
}

function start_typing(socket, data) {
  try {
    const user_id = socket.decoded_token._id;
    const { to } = data;
  
    const target_socket_id = Object.keys(io.sockets.sockets).find(x => x.decoded_token._id === to);
    const target_socket = target_socket_id != null ? io.sockets.sockets[target_socket_id] : null;

    if(target_socket) {
      target_socket.emit('typing', {
          is_typing: true,
          user_id: user_id,
      });

      setTimeout(() => {
        target_socket.emit('typing', {
          is_typing: false,
          user_id: user_id,
        });
      }, 2000);
    }
  } catch(err) {
    Error({
      file: 'server.js',
      method: 'startTyping',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
}

async function stop_music(logged_id) {
  const session = await db.startSession();

  try {
      await session.withTransaction(async () => {
        await User.updateOne({ _id: logged_id }, { 
          'current_play.is_playing': false,
          'current_play.timestamp': Date.now(),
        }).session(session);
      });
  } catch(err) {
      Error({
          file: 'server.js',
          method: 'stop_music',
          title: err.toString(),
          info: err,
          type: 'critical',
      });
  } finally {
      session.endSession();
  }
}

// GRIDFS CONFIGURATION

const storage = new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (req, file) => {
      if(file.mimetype === 'image/jpeg') {
        return new Promise((resolve, reject) => {
          crypto.randomBytes(16, (err, buf) => {
            if (err) {
              Error({
                file: 'server.js',
                method: 'storage',
                title: err.toString(),
                info: err,
                type: 'critical',
              });
              return reject(err);
            }
            const filename = buf.toString('hex') + path.extname(file.originalname);
            const fileInfo = {
              filename: filename,
              bucketName: 'uploads'
            };
            resolve(fileInfo);
          });
        });
      } else {
        return null;
      }
    
    }
});
  
const upload = multer({ storage });

// ROUTES CONFIGURATION

const routes = require('./src/routes');
app.use('/', routes(upload));

// EVERY DAY RENEW USER COUNTS

const schedule = require('node-schedule');
const Language = require('./src/utils/Language');

const _ = require("lodash");
const firebaseAdmin = require("./src/firebase/firebaseAdmin");

const DEFAULT_LIKE_COUNT = 30;
const DEFAULT_ADS_COUNT = 5;

schedule.scheduleJob('0 15 0 * * *', async () => {
  try {
    const results = await Promise.all([
      User.find({ "notifications.renew_likes": true }).select('fcm_token language'),
      User.updateMany({ product: { $eq: 'free' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 1, ad: DEFAULT_ADS_COUNT }}),
      User.updateMany({ product: { $eq: 'premium_lite' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 3, ad: DEFAULT_ADS_COUNT }}),
      User.updateMany({ product: { $eq: 'premium_plus' } }, { counts: { like: DEFAULT_LIKE_COUNT, mega_like: 5, ad: DEFAULT_ADS_COUNT }}),
    ]);

    const users = results[0];

    var tr_tokens = [];
    var en_tokens = [];

    users.forEach(user => {
      switch(user.language) {
        case 'tr':
          if(user.fcm_token != null) tr_tokens.push(user.fcm_token.token);
          break;
        case 'en':
          if(user.fcm_token != null) en_tokens.push(user.fcm_token.token);
          break;
      }
    });

    const tr_title = Language.translate({ key: 'renew_likes_title', lang: 'tr' });
    const tr_body = Language.translate({ key: 'renew_likes_body', lang: 'tr' });

    const en_title = Language.translate({ key: 'renew_likes_title', lang: 'en' });
    const en_body = Language.translate({ key: 'renew_likes_body', lang: 'en' });

    const tr_chunks = _.chunk(tr_tokens, 500);
    const en_chunks = _.chunk(en_tokens, 500);

    // TR İÇİN
    const promisesTR = tr_chunks.map((tokens) => {
      const payload = {
        tokens,
        title: tr_title,
        body: tr_body,
        channel_id: 'match',
        data: {
          notification_type: 'RENEW_LIKES',
        }
      };

      return firebaseAdmin.sendMulticastNotification(payload); 
    });

    // EN İÇİN
    const promisesEN = en_chunks.map((tokens) => {
      const payload = {
        tokens,
        title: en_title,
        body: en_body,
        channel_id: 'match',
        data: {
          notification_type: 'RENEW_LIKES',
        }
      };

      return firebaseAdmin.sendMulticastNotification(payload); 
    });

    await Promise.all([promisesTR, promisesEN]);
  } catch(err) {
    Error({
      file: 'server.js',
      method: 'daily_renew',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
});
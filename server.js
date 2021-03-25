require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoDB = require('./api/databases/mongodb/index');
const socketIO = require('socket.io');
const compression = require("compression");
const bodyParser = require('body-parser');

const Error = require('./api/controllers/ErrorController');

// CONFIG EXPRESS

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// MULTER UPLOAD IMAGES

const multer = require('multer');

const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './avatars/');
  },
  filename: function(req, file, cb) {
    crypto.randomBytes(16, (err, buf) => {
      if (err) cb(null, null);
      cb(null, (buf.toString('hex') + path.extname(file.originalname)));
    });
  }
});

const fileFilter = (req, file, cb) => {
  // reject a file
  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5
  },
  fileFilter: fileFilter
});

app.use('/avatars', express.static('avatars'));

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

// ROUTES CONFIGURATION

const routes = require('./api/routes');
app.use('/', routes(upload));

// START SERVER

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(PORT, async () => {
    console.log("Listening on port", PORT);
    await mongoDB.connect();
});

// SOCKET.IO CONFIGURATION

const InstantListeners = require('./api/shared/InstantListenersController');
const SocketController = require('./api/shared/SocketController');

const db = require('mongoose');
const User = require('./api/models/UserModel');

const socketioJwt = require('socketio-jwt');

SocketController.socket_io = socketIO(server);

SocketController.socket_io.use(socketioJwt.authorize({
  secret: process.env.JWT_SECRET,
  handshake: true,
  auth_header_required: true,
}));

SocketController.socket_io.on('connection', socket => {
  connect_socket(socket);

  socket.on('disconnect', () => disconnect_socket(socket));
  socket.on("start_typing", (data) => start_typing(socket, data));
});

function connect_socket(socket) {
  try {
    var user_id = socket.decoded_token._id;
    console.log(`(${SocketController.getSocketCount()})`, "CONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);

    // BU USERID LI BAŞKA SOCKET VARMI KONTROL ET
    var find_sockets = SocketController.findSockets(user_id);

    find_sockets.forEach(x => {
      if(x.id !== socket.id) {
        console.log('LOGOUT:', x.id);

        x.emit('logout');
        x.disconnect();
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

    console.log(`(${SocketController.getSocketCount()})`, "DISCONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);
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
  
    const target_socket = SocketController.findSocket(to);

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
  InstantListeners.delete(logged_id);

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

// EVERY DAY RENEW USER COUNTS

const schedule = require('node-schedule');
const Language = require('./api/lang/Language');

const lodash = require("lodash");
const FirebaseAdmin = require("./api/firebase/FirebaseAdmin");

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

    const tr_chunks = lodash.chunk(tr_tokens, 500);
    const en_chunks = lodash.chunk(en_tokens, 500);

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

      return FirebaseAdmin.sendMulticastNotification(payload); 
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

      return FirebaseAdmin.sendMulticastNotification(payload); 
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
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoDB = require('./src/databases/mongodb/index');
const socketIO = require('socket.io');
const compression = require("compression");
const bodyParser = require('body-parser');

/*const os = require('os');
const cluster = require('cluster');
const numCpu = os.cpus().length;
console.log('CPU SAYISI:', numCpu);*/

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

//SOCKET.IO CONFIGURATION

const io = socketIO(server);

const db = require('mongoose');
const User = require('./src/models/UserModel');

const socketioJwt = require('socketio-jwt');
const jwtConfig = require('./src/config/jwt');

io.use(socketioJwt.authorize({
  secret: jwtConfig.secret,
  handshake: true,
  auth_header_required: true,
  callback: false,
}));

io.on('connection', socket => {
  console.log('tokenden gelen user_id:', socket.decoded_token._id);

  socket.on('init_user', (data) => initUser(socket, data));
  socket.on('disconnect', async () => console.log('disconnect:', socket.id));
  socket.on("start_typing", (data) => startTyping(socket, data));
});

function initUser(socket, data) {
  try {
    const { user_id } = data;
    console.log('INIT YAPILACAK USERID:', user_id);

    // BAŞKA SOCKET VARMI KONTROL ET
    const find_users = shared.users.filter(x => x.user_id === user_id);
    if(find_users.length > 0) {
      console.log('BU IDLI BAŞKA SOKET VAR LOGOUT YAPTIRACAK');
      find_users.forEach(findUser => {
        console.log('LOGOUT:', findUser.socket.id);
        findUser.socket.emit('logout');
        findUser.socket.disconnect();
      });  
    }

    // SOCKET KAYDI YAP
    shared.users.push({ user_id, socket });
    socket.emit('init_user');

    console.log(`(${shared.users.length})`, "CONNECT SOCKETID/USERID: " + socket.id + "/" + user_id);
  } catch(err) {
    Error({
      file: 'server.js',
      method: 'initUser',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
}

async function leftUser(socket) {
  try {
    // SOKETİ BUL
    const find_user = shared.users.find(x => x.socket.id === socket.id);
    if(!find_user) return;

    // DINLEDIĞI MÜZİK VARSA SİL
    await stopMusic(find_user.user_id);

    // LİSTEDEN KULLANICIYI KALDIR
    shared.users = shared.users.filter(x => x.socket.id !== find_user.socket.id);

    console.log(`(${shared.users.length})`, "DISCONNECT SOCKETID/USERID: " + find_user.socket.id + "/" + find_user.user_id);
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

function startTyping(socket, data) {
  try {
    // BU SOKETİ BUL
    const findUser = shared.users.find(x => x.socket.id === socket.id);
    if(!findUser) return;

    const { to } = data;
    const user_id = findUser.user_id;

    const findTargetUser = shared.users.find(x => x.user_id === to);
    if(findTargetUser) {
      findTargetUser.socket.emit('typing', {
          is_typing: true,
          user_id: user_id,
        });
        setTimeout(() => {
          const findTargetUser = shared.users.find(x => x.user_id === to);
          if(findTargetUser) {
            findTargetUser.socket.emit('typing', {
              is_typing: false,
              user_id: user_id,
            });
          }
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

async function stopMusic(logged_id) {
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
          method: 'stopMusic',
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

const routes = require('./src/routes');
app.use('/', routes(upload));

// EVERY DAY RENEW LIKES AND ADS

const schedule = require('node-schedule');
const Language = require('./src/utils/Language');

const _ = require("lodash");
const firebaseAdmin = require("./src/firebase/firebaseAdmin");

const DEFAULT_LIKE_COUNT = 30;
const DEFAULT_ADS_COUNT = 5;

// HER GÜN BELİRLİ SAATTE KULLANICILARIN BEĞENİ HAKLARINI GÜNCELLE
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
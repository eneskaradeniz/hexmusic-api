require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoDB = require('./src/databases/mongodb/index');
const socketIO = require('socket.io');
const compression = require("compression");

const shared = require('./src/shared');

const Error = require('./src/controllers/ErrorController');

const bodyParser = require('body-parser');

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use(compression());

const PORT = process.env.PORT || 3000;

const server = require('http').createServer(app);
const io = socketIO(server);

server.listen(PORT, async () => {
    console.log("Listening on port", PORT);
    await mongoDB.connect();
});

//SOCKET.IO CONFIGURATION

shared.users = [];

const User = require('./src/models/UserModel');

function initUser(socket, data) {
  try {
    const { userId } = data;
    console.log('INIT YAPILACAK USERID:', userId);

    // BAŞKA SOCKET VARMI KONTROL ET
    const findUsers = shared.users.filter(x => x.userId === userId);
    if(findUsers.length > 0) {
      console.log('BU IDLI BAŞKA SOKET VAR LOGOUT YAPTIRACAK');
      findUsers.forEach(findUser => {
        console.log('LOGOUT:', findUser.socket.id);
        findUser.socket.emit('logout');
        findUser.socket.disconnect();
      });  
    }

    // SOCKET KAYDI YAP
    shared.users.push({ userId, socket });
    socket.emit('init_user');

    console.log(`(${shared.users.length})`, "CONNECT SOCKETID/USERID: " + socket.id + "/" + userId);
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
    const findUser = shared.users.find(x => x.socket.id === socket.id);
    if(!findUser) return;

    // DINLEDIĞI MÜZİK VARSA SİL
    await stopMusic(findUser.userId);

    // LİSTEDEN KULLANICIYI KALDIR
    shared.users = shared.users.filter(x => x.socket.id !== findUser.socket.id);

    console.log(`(${shared.users.length})`, "DISCONNECT SOCKETID/USERID: " + findUser.socket.id + "/" + findUser.userId);
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
    const userId = findUser.userId;

    const findTargetUser = shared.users.find(x => x.userId === to);
    if(findTargetUser) {
      findTargetUser.socket.emit('typing', {
          isTyping: true,
          userId: userId,
        });
        setTimeout(() => {
          const findTargetUser = shared.users.find(x => x.userId === to);
          if(findTargetUser) {
            findTargetUser.socket.emit('typing', {
              isTyping: false,
              userId: userId,
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

async function stopMusic(userId) {
  try {
    await User.findByIdAndUpdate(userId, {
      "listen.isListen": false,
      "listen.timestamp": Date.now(),
    });

    console.log('(disconnect) müzik dinlemiyor:', userId);
  } catch (err) {
    Error({
      file: 'server.js',
      method: 'stopMusic',
      title: err.toString(),
      info: err,
      type: 'critical',
    });
  }
}

io.on('connection', socket => {
  socket.on('init_user', (data) => initUser(socket, data));
  socket.on('disconnect', async () => await leftUser(socket));
  socket.on("start_typing", (data) => startTyping(socket, data));
});

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

schedule.scheduleJob('0 15 0 * * *', async () => {
  try {
    await User.updateMany({ product: { $eq: 'free' } }, { counts: { like: DEFAULT_LIKE_COUNT, megaLike: 1, ads: DEFAULT_ADS_COUNT }});
    await User.updateMany({ product: { $eq: 'premium_lite' } }, { counts: { like: DEFAULT_LIKE_COUNT, megaLike: 3, ads: DEFAULT_ADS_COUNT }});
    await User.updateMany({ product: { $eq: 'premium_plus' } }, { counts: { like: DEFAULT_LIKE_COUNT, megaLike: 5, ads: DEFAULT_ADS_COUNT }});

    var trTokens = [];
    var enTokens = [];

    const users = await User.find({ "notifications.renewLikes": true }).select('_id fcmToken language');

    users.forEach(user => {
      switch(user.language) {
        case 'tr':
          if(user.fcmToken != null) trTokens.push(user.fcmToken.token);
          break;
        case 'en':
          if(user.fcmToken != null) enTokens.push(user.fcmToken.token);
          break;
      }
    });

    const trTitle = await Language.translate({ key: 'renew_likes_title', lang: 'tr' });
    const trBody = await Language.translate({ key: 'renew_likes_body', lang: 'tr' });

    const enTitle = await Language.translate({ key: 'renew_likes_title', lang: 'en' });
    const enBody = await Language.translate({ key: 'renew_likes_body', lang: 'en' });

    const trChunks = _.chunk(trTokens, 500);
    const enChunks = _.chunk(enTokens, 500);

    // TR İÇİN
    const promisesTR = trChunks.map((tokens) => {
      const payload = {
        tokens,
        title: trTitle,
        body: trBody,
        channel_id: 'match',
        data: {
          notification_type: 'RENEW_LIKES',
        }
      };

      return firebaseAdmin.sendMulticastNotification(payload); 
    });

    // EN İÇİN
    const promisesEN = enChunks.map((tokens) => {
      const payload = {
        tokens,
        title: enTitle,
        body: enBody,
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

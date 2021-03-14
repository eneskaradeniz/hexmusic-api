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
app.use(compression());

const PORT = process.env.PORT || 3000;

const server = require('http').createServer(app);
const io = socketIO(server);

server.listen(PORT, async () => {
    console.log("Listening on port", PORT);
    await mongoDB.connect();
});

//SOCKET.IO CONFIGURATION

const User = require('./src/models/UserModel');

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
  const session = db.startSession();

  try {
      await session.withTransaction(async () => {
          await User.updateOne({ _id: logged_id }, { current_play: { timestamp: Date.now(), is_playing: false } }).session(session);
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

/*const schedule = require('node-schedule');
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
*/
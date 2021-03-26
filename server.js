require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoDB = require('./api/databases/mongodb/index');
const compression = require("compression");
const bodyParser = require('body-parser');

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

require('./api/shared/SocketIO').getInstance(server);

// SCHEDULE CONFIGURATION
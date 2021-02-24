const express = require('express');
const router = express.Router();

const ChatController = require('./controllers/ChatController');
const UserController = require('./controllers/UserController');
const MatchController = require('./controllers/MatchController');
const HomeController = require('./controllers/HomeController');
const FileController = require('./controllers/FileController');
const ReportController = require('./controllers/ReportController');

const userMiddleware = require('./middlewares/auths/user');
const middlewares = { user: userMiddleware };

module.exports = (upload) => {

    // AUTH
    router.post('/', upload.array('photos', 3), UserController.register);
    router.get('/callback', UserController.callback);
   
    // USER
    router.get('/me', [middlewares.user], UserController.me);
    router.get('/profile/:userId', [middlewares.user], UserController.profile);
    router.post('/delete_account', [middlewares.user], UserController.delete_account);

    router.get('/action', [middlewares.user], UserController.action);
    
    // REPORT
    router.post('/report_user/:userId', [middlewares.user], ReportController.report_user);
    
    // USER PHOTOS
    router.post('/add_photo', [middlewares.user], upload.single('photo'), UserController.add_photo);
    router.post('/update_photos', [middlewares.user], UserController.update_photos);
    router.post('/delete_photo/:imageId', [middlewares.user], UserController.delete_photo);

    // BLOCK AND END
    router.get('/blocked_users', [middlewares.user], UserController.blocked_users);
    router.post('/end_user/:userId', [middlewares.user], UserController.end_user);
    router.post('/block_user/:userId', [middlewares.user], UserController.block_user);
    router.post('/unblock_user/:userId', [middlewares.user], UserController.unblock_user);

    // USER GET AND UPDATE 
    router.post('/update_profile', [middlewares.user], UserController.update_profile);
    router.post('/update_notifications', [middlewares.user], UserController.update_notifications);
    router.post('/update_permissions', [middlewares.user], UserController.update_permissions);
    router.post('/update_fav_artists', [middlewares.user], UserController.update_fav_artists);
    router.post('/update_fav_tracks', [middlewares.user], UserController.update_fav_tracks);
    router.post('/update_spotify_favorites', [middlewares.user], UserController.update_spotify_favorites);
    router.post('/update_firebase', [middlewares.user], UserController.update_firebase);
    router.post('/update_language', [middlewares.user], UserController.update_language);
    router.post('/update_filtering', [middlewares.user], UserController.update_filtering);

    // MATCH
    router.post('/start_music', [middlewares.user], MatchController.start_music);
    router.post('/stop_music', [middlewares.user], MatchController.stop_music);

    router.get('/live', [middlewares.user], MatchController.live);
    router.get('/explore', [middlewares.user], MatchController.explore);
    router.get('/likes_me', [middlewares.user], MatchController.likes_me);

    router.post('/like/:userId', [middlewares.user], MatchController.like);
    router.post('/dislike/:userId', [middlewares.user], MatchController.dislike);
    router.post('/rewind/:userId', [middlewares.user], MatchController.rewind);

    // HOME
    router.get('/home', [middlewares.user], HomeController.home);
    router.get('/artist_tracks/:artistId', [middlewares.user], HomeController.artist_tracks);
    router.get('/live_count', HomeController.live_count);

    // CHAT
    router.get('/chat_list', [middlewares.user], ChatController.chat_list);
    router.get('/message_list/:chatId', [middlewares.user], ChatController.message_list);
    router.post('/read_messages/:chatId', [middlewares.user], ChatController.read_messages);
    router.post('/send_message/:chatId', [middlewares.user], ChatController.send_message);
    router.post('/like_message/:messageId', [middlewares.user], ChatController.like_message);

    // FILES
    router.get('/image/:imageId', FileController.getImageById);

    // SPOTIFY
    router.post('/search_tracks/:search', UserController.search_tracks);
    router.post('/search_artists/:search', UserController.search_artists);

    return router;
}
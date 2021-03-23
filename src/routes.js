const express = require('express');
const router = express.Router();

const ChatController = require('./controllers/ChatController');
const UserController = require('./controllers/UserController');
const MatchController = require('./controllers/MatchController');
const HomeController = require('./controllers/HomeController');
const ReportController = require('./controllers/ReportController');

const userMiddleware = require('./middlewares/auths/user');
const middlewares = { user: userMiddleware };

const SpotifyController = require('./controllers/SpotifyController');

module.exports = (upload) => {

    router.get('/test', async (req, res, next) => {
        try {
            const tracks = await SpotifyController.getPodcasts(['7smFvddTT4ZygNhCPWt5WK', '7smFvddTT4ZygNhCPWt5WK', '7smFvddTT4ZygNhCPWt5WK', '7smFvddTT4ZygNhCPWt5WK', '7smFvddTT4ZygNhCPWt5WK']);

            return res.json({
                success: true,
                tracks: tracks
            });
        } catch(err) {
            console.log(err);
            return res.json({
                success: false
            });
        }
    });

    // AUTH
    router.get('/callback', UserController.callback);
    router.post('/', upload.array('avatars', 3), UserController.register);
   
    // USER
    router.get('/me', [middlewares.user], UserController.me);
    router.get('/profile/:user_id', [middlewares.user], UserController.profile);
    router.post('/delete_account', [middlewares.user], UserController.delete_account);
    
    // USER PHOTOS
    router.post('/add_avatar', [middlewares.user], upload.single('avatar'), UserController.add_avatar);
    router.post('/update_avatars', [middlewares.user], UserController.update_avatars);
    router.post('/delete_avatar/:image_id', [middlewares.user], UserController.delete_avatar);

    // BLOCK/END/REPORT
    router.get('/blocked_users', [middlewares.user], UserController.blocked_users);
    router.post('/end_user/:user_id', [middlewares.user], UserController.end_user);
    router.post('/block_user/:user_id', [middlewares.user], UserController.block_user);
    router.post('/unblock_user/:user_id', [middlewares.user], UserController.unblock_user);
    router.post('/report_user/:user_id', [middlewares.user], ReportController.report_user);

    // USER GET AND UPDATE 
    router.get('/action', [middlewares.user], UserController.action);

    router.post('/update_profile', [middlewares.user], UserController.update_profile);
    router.post('/update_notifications', [middlewares.user], UserController.update_notifications);
    router.post('/update_permissions', [middlewares.user], UserController.update_permissions);
    router.post('/update_spotify_favorites', [middlewares.user], UserController.update_spotify_favorites);
    router.post('/update_firebase', [middlewares.user], UserController.update_firebase);
    router.post('/update_language', [middlewares.user], UserController.update_language);
    router.post('/update_filtering', [middlewares.user], UserController.update_filtering);

    // MATCH
    router.post('/start_music', [middlewares.user], MatchController.start_music);
    router.post('/stop_music', [middlewares.user], MatchController.stop_music);

    router.get('/live', [middlewares.user], MatchController.live);
    router.get('/likes_me', [middlewares.user], MatchController.likes_me);

    router.post('/like/:user_id', [middlewares.user], MatchController.like);
    router.post('/dislike/:user_id', [middlewares.user], MatchController.dislike);
    router.post('/rewind/:user_id', [middlewares.user], MatchController.rewind);

    // HOME
    router.get('/home', [middlewares.user], HomeController.home);
    router.get('/live_count', HomeController.live_count);

    // CHAT
    router.get('/chat_list', [middlewares.user], ChatController.chat_list);
    router.get('/message_list/:chat_id', [middlewares.user], ChatController.message_list);
    router.post('/read_messages/:chat_id', [middlewares.user], ChatController.read_messages);
    router.post('/send_message/:chat_id', ChatController.send_message);
    router.post('/like_message/:message_id', [middlewares.user], ChatController.like_message);

    return router;
}
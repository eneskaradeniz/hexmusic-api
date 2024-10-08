const db = require('mongoose');

const lodash = require('lodash');

const Chat = require('../models/ChatModel');
const Match = require('../models/MatchModel');
const User = require('../models/UserModel');
const Like = require('../models/LikeModel');
const Dislike = require('../models/DislikeModel');

const FirebaseAdmin = require('../firebase/FirebaseAdmin');

const SocketIO = require('../shared/SocketIO').getInstance();
const InstantListeners = require('../shared/InstantListeners').getInstance();
const SpotifyAPI = require('../shared/SpotifyAPI').getInstance();

const Language = require('../lang/Language');

const Error = require('./ErrorController');

class MatchController {

    async start_music(req, res) {
        try {
            const logged_id = req._id;
            const { id, is_podcast } = req.body;
            if(id === null || is_podcast === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await SpotifyAPI.getAccessToken();

            var track;
            if(is_podcast) track = await SpotifyAPI.getPodcast(id);
            else track = await SpotifyAPI.getTrack(id);
        
            InstantListeners.set({ user_id: logged_id, track_id: track.id, artist_id: track.artist, is_podcast: track.is_podcast });

            updateCurrentPlay(logged_id, track);

            return res.status(200).json({
                success: true,
                track: track
            }); 
        } catch(err) {
            Error({
                file: 'MatchController.js',
                method: 'start_music',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async stop_music(req, res) {
        try {
            const logged_id = req._id;

            InstantListeners.delete(logged_id);

            updateCurrentPlay(logged_id, null);

            return res.status(200).json({
                success: true
            });
        } catch(err) {
            Error({
                file: 'MatchController.js',
                method: 'stop_music',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async test(req, res) {
        // REDIS'DEN KULLANICININ DİNLEDİĞİ MÜZİĞİ VE FİLTRELEME BİLGİLERİNİ GETİR.
        // REDIS'DEN KULLANICININ DİNLEDİĞİ MÜZİĞİ/SANATÇIYI DİNLEYENLERİ GETİR AMA KULLANICININ FİLTRELEMESİNE UYGUN OLANLARI (MIN_AGE, MAX_AGE, GENDER_PREFERENCE, MAX_DISTANCE)
        // DB'DEN KULLANICILARIN LOGGED İÇİN GÖSTERMEYE UYGUN OLANLARI BUL. (LIKE, DISLIKE, MATCH, BLOCK VS. ATMAMIŞ) (MAX 10 KİŞİ VE PREMIUM_PLUS'DAN FREE'YE DORĞU SIRALANMIŞ)
        // DB'DEN BU KULLANICILARIN TINDER KART İÇİN GEREKLI PROFİL BİLGİLERİNİ GETİR.
        // TOPLALAN TÜM VERİLERİ FRONT_END İÇİN AYARLA VE GÖNDER.

        try {
            const logged_id = req.user.id;

            // REDIS'DEN KULLANICININ DİNLEDİĞİ MÜZİĞİ VE FİLTRELEME BİLGİLERİNİ GETİR.
            const logged_user = InstantListeners.get(logged_id);
            if(!logged_user) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_USER_FOR_CACHE'
                });
            }

            // REDIS'DEN KULLANICININ DİNLEDİĞİ MÜZİĞİ/SANATÇIYI DİNLEYENLERİ GETİR AMA KULLANICININ FİLTRELEMESİNE UYGUN OLANLARI (MIN_AGE, MAX_AGE, GENDER_PREFERENCE, MAX_DISTANCE)
            var listeners = InstantListeners.getListeners(logged_user); 
            const user_ids = Object.keys(listeners);

            var users = [];

            if(user_ids.length > 0) {

                // DB'DEN KULLANICILARIN LOGGED İÇİN GÖSTERMEYE UYGUN OLANLARI BUL. (LIKE, DISLIKE, MATCH, BLOCK VS. ATMAMIŞ) (MAX 10 KİŞİ VE PREMIUM_PLUS'DAN FREE'YE DORĞU SIRALANMIŞ)
                const fetch = await User.find({
                    to: { $in: user_ids },
                    from: { $ne: logged_id }
                })
                .limit(10)
                .sort({ 'product.id': -1 })
                .populate('to', 'username display_name avatars verified age permissions.show_age')
                .lean();

                if(fetch.length > 0) {
                    // TOPLALAN TÜM VERİLERİ FRONT_END İÇİN AYARLA VE GÖNDER.
                    users = [];
                }
            }

            return res.status(200).json({
                success: true,
                users: users
            });

        } catch(err) {
            console.log(err);
            return res.status(400).json({ success: false });
        }
    }

    async live(req, res) {
        try {
            const logged_id = req._id;

            // KULLANICININ DİNLEDİĞİ MÜZİĞİ GETİR
            const logged_track = InstantListeners.get(logged_id);
            if(!logged_track) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_TRACK'
                });
            }

            // KULLANICININ FİLTRELEME BİLGİLERİNİ GETİR
            console.time('logged_user');

            const logged_user = await User.findById(logged_id).select('filtering').lean();

            console.timeEnd('logged_user');

            // KULLANICININ DİNLEDİĞİ MÜZİĞİ/SANATÇIYI DİNLEYENLERİ GETİR
            console.time('listeners');

            var listeners = {};
            if(logged_user.filtering.artist) listeners = InstantListeners.getArtistListeners(logged_id, logged_track.artist_id); 
            else listeners = InstantListeners.getTrackListeners(logged_id, logged_track.track_id); 

            console.timeEnd('listeners');

            var users = [];

            const user_ids = Object.keys(listeners);

            if(user_ids.length > 0) {

                // FİLTRELEMEYİ VE QUERYİ AYARLA
                const gender_preference = logged_user.filtering.gender_preference;
                const min_age = logged_user.filtering.min_age;
                const max_age = logged_user.filtering.max_age;
                const max_distance = logged_user.filtering.max_distance;

                var query;

                if(gender_preference !== 'all') {
                    query = {
                        _id: { $in: user_ids },
                        
                        my_blocked: { $nin: logged_id },
                        blocked: { $nin: logged_id },
                        matches: { $nin: logged_id },
                       
                        likes: { $nin: logged_id },
                        dislikes: { $nin: logged_id },
                    
                        age: { $gte: min_age, $lte: max_age },
                        gender: { $eq: gender_preference },
                    };
                } else {
                    query = {
                        _id: { $in: user_ids },

                        my_blocked: { $nin: logged_id },
                        blocked: { $nin: logged_id },
                        matches: { $nin: logged_id },
                        
                        likes: { $nin: logged_id },
                        dislikes: { $nin: logged_id },
    
                        age: { $gte: min_age, $lte: max_age },
                    };
                }

                // UYGUN OLAN MAX 10 KİŞİYİ GETİR
                console.time('fetch');

                const fetch = await User.find(query)
                    .limit(10)
                    .sort({ 'product.id': -1 })
                    .select('display_name avatars verified age permissions')
                    .lean();

                console.timeEnd('fetch');

                if(fetch.length > 0) {

                    console.time('spotify_tracks');

                    await SpotifyAPI.getAccessToken();
                    
                    // MÜZİKLERİN BİLGİLERİNİ ÇEK
                    var track_ids = [logged_track.track_id];
                    if(logged_user.filtering.artist) 
                        tracks = await SpotifyAPI.getTracks(lodash.uniq([...track_ids, ...fetch.map(x => listeners[x._id.toString()].track_id)]));
                              
                    var tracks = [];
                    if(logged_track.is_podcast) tracks = await SpotifyAPI.getPodcasts(track_ids);
                    else tracks = await SpotifyAPI.getTracks(track_ids);

                    console.timeEnd('spotify_tracks');

                    console.time('foreach');

                    fetch.forEach(user => {
                        const track = tracks.find(x => x.id === listeners[user._id.toString()].track_id);
        
                        users.push({
                            user: {
                                _id: user._id,
                                display_name: user.display_name,
                                avatars: user.avatars,
                                verified: user.verified,
                            },
                            age: user.permissions.show_age ? user.age : null,
                            track: track
                        });
                    });

                    console.timeEnd('foreach');
                }
            }

            return res.status(200).json({
                success: true,
                users: users
            });
        } catch(err) {
            console.log(err);
            Error({
                file: 'MatchController.js',
                method: 'live',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({ success: false });
        }
    }

    async explore(req, res) {
        
    }

    async likes_me(req, res) {
        try {

        } catch(err) {
            console.log(err);
            
            return res.status(400).json({
                success: false,
            });
        }
    }

    async like(req, res) {
        try {
            const logged_id = req._id;
            const target_id = req.params.user_id;
            const { like_type, match_type, track_id } = req.body;
            if(target_id === null || like_type === null || match_type === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            if(match_type == 'live' && track_id === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            if(logged_id.toString() == target_id.toString()) {
                return res.status(200).json({
                    success: false,
                    error: 'SAME_USER',
                });
            }

            // LIKE HAKKINI KONTROL ET
            const { is_free, can_like } = await canSendLike(logged_id, like_type);

            if(can_like) {
                _like({
                    logged_id,
                    target_id,
                    like_type,
                    match_type,
                    track_id,
                    is_free
                });

                return res.status(200).json({
                    success: true
                });
            } else {
                return res.status(200).json({
                    success: false,
                    error: like_type === 'like' ? 'NOT_ENOUGH_LIKE' : 'NOT_ENOUGH_MEGALIKE'
                });
            }
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'like',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async dislike(req, res) {
        try {
            const logged_id = req._id;
            const target_id = req.params.user_id;
            if(!target_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            _dislike({ logged_id, target_id });

            return res.status(200).json({ 
                success: true
            });
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'dislike',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async rewind(req, res) {
        const session = await db.startSession();

        try {
            const logged_id = req._id;
            const target_id = req.params.user_id;
            const { type } = req.body;
            if(!target_id || !type) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // PREMİUM OLUP OLMADIĞINI KONTROL ET
            const user = await User.findById(logged_id).select('product');
            if(user.product === 0) {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            // EŞLEŞMİŞLER Mİ
            const find_match = await findMatch({ logged_id, target_id });
            if(find_match > 0) return 'ALREADY_MATCH';

            // TRANSACTION BAŞLAT
            const transaction_results = await session.withTransaction(async () => {
                switch(type) {
                    case 'like':
                        const find_like = await Like.countDocuments({ from: logged_id, to: target_id }).session(session);
                        if(find_like === 0) return 'NOT_FOUND_LIKE';

                        await Like.deleteOne({ from: logged_id, to: target_id }).session(session);
                        break;
                    case 'mega_like':
                        const find_mega_like = await Like.countDocuments({ from: logged_id, to: target_id }).session(session);
                        if(find_mega_like === 0) return 'NOT_FOUND_MEGALIKE';
                    
                        await Like.deleteOne({ from: logged_id, to: target_id }).session(session);
                        await User.updateOne({ _id: logged_id }, { $inc: { 'counts.mega_like': 1 } }).session(session);
                        break;
                    case 'dislike':
                        const findDislike = await Dislike.countDocuments({ from: logged_id, to: target_id }).session(session);
                        if(findDislike === 0) return 'NOT_FOUND_DISLIKE';

                        await Dislike.deleteOne({ from: logged_id, to: target_id }).session(session);
                        break;
                    default: {
                        return 'INVALID_FIELDS';
                    }
                }
            });

            if(transaction_results) {
                return res.status(200).json({
                    success: false,
                    error: transaction_results,
                });
            }

            return res.status(200).json({
                success: true
            });
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'rewind',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        } finally {
            session.endSession();
        }
    }
}

module.exports = new MatchController();

// METHODS

async function updateCurrentPlay(logged_id, track) {
    const session = await db.startSession();

    try {
        if(track) {
            await session.withTransaction(async () => {
                const user = await User.findById(logged_id).select('current_play last_tracks');
    
                user.current_play = {
                    track: track.id,
                    artist: track.artist,
                    is_playing: true,
                    timestamp: Date.now(),
                };
    
                // SON DİNLEDİKLERİME EKLE
                if(user.last_tracks.length > 0) {
                    if(user.last_tracks[0] !== track.id) {
                        // EN BAŞTA ŞARKI VAR VE EŞİT DEĞİL O YÜZDEN EKLE
                        if(user.last_tracks.length >= 10) user.last_tracks.pop();
                        user.last_tracks.unshift(track.id);
                    }
                } else {
                    // LİSTEDE HİÇ ELEMAN YOK EKLE
                    user.last_tracks.unshift(track.id);
                }

                await user.save();
            });
        } else {
            await session.withTransaction(async () => {
                await User.updateOne({ _id: logged_id, 'current_play.is_playing': true }, { 
                    'current_play.is_playing': false,
                    'current_play.timestamp': Date.now(),
                }).session(session);
            });
        }
    } catch(err) {
        Error({
            file: 'MatchController.js',
            method: 'updateCurrentPlay',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    } finally {
        session.endSession();
    }
}

async function doChecks({ logged_id, target_id }) {
    try {
        const lower_id = logged_id < target_id ? logged_id : target_id;
        const higher_id = logged_id > target_id ? logged_id : target_id;

        const results = await Promise.all([
            Like.countDocuments({ from: logged_id, to: target_id }),
            Dislike.countDocuments({ from: logged_id, to: target_id }),
            Match.countDocuments({ lower_id, higher_id }),
        ]);

        var test = true;
        results.forEach(result => { if(result > 0) test = false; });

        if(test) return true;
        else return false;
    } catch (err) {
        throw err;
    }
}

async function canSendLike(logged_id, like_type) {
    try {
        const logged_user = await User.findById(logged_id).select('counts product').lean();

        const is_free = logged_user.product === 0 ? true : false;
        var can_like;
        
        switch(like_type) {
            case 'like':
                if(!is_free) can_like = true;
                else can_like = logged_user.counts.like > 0;
                break;
            case 'mega_like':
                can_like = logged_user.counts.mega_like > 0;
                break;
        }

        return { is_free, can_like };
    
    } catch (err) {
        throw err;
    }
}

async function findMatch({ logged_id, target_id }) {
    try {
        const lower_id = logged_id < target_id ? logged_id : target_id;
        const higher_id = logged_id > target_id ? logged_id : target_id;

        return await Match.countDocuments({ lower_id, higher_id });
    } catch (e){
        throw e;
    }
}

async function _like({ logged_id, target_id, match_type, like_type, track_id, is_free }) {
    const session = await db.startSession();

    try {
        const lower_id = logged_id < target_id ? logged_id : target_id;
        const higher_id = logged_id > target_id ? logged_id : target_id;

        const is_lower = logged_id === lower_id;

        var target_like;
        var _chat;
        var _match;

        // KONTROLLER YAPILACAK
        const result = await doChecks({ logged_id, target_id });
        if(!result) return;
        
        await session.withTransaction(async () => {

            target_like = await Like.findOne({ from: target_id, to: logged_id }).session(session).lean();

            if(target_like) {
                // CHAT OLUŞTUR
                _chat = (await Chat.create([{ 
                    lower_id: lower_id, 
                    higher_id: higher_id, 
                    is_mega_like: like_type === 'mega_like' || target_like.like_type === 'mega_like', 
                }], { session: session }))[0];

                // MATCH OLUŞTUR
                _match = (await Match.create([{ 
                    lower_id: lower_id, 
                    higher_id: higher_id, 
                    lower_match_type: is_lower ? match_type : target_like.match_type, 
                    higher_match_type: is_lower ? target_like.match_type : match_type, 
                    lower_like_type: is_lower ? like_type : target_like.like_type, 
                    higher_like_type: is_lower ? target_like.like_type : like_type,
                    lower_track_id: is_lower ? track_id : target_like.track_id,
                    higher_track_id: is_lower ? target_like.track_id : track_id
                }], { session: session }))[0];

                // TARGETIN LIKE SİL
                await Like.deleteOne({ from: target_id, to: logged_id }).session(session);

                // İKİ KULLANICININ DA MATCHES KISMINA İDLERİNİ EKLE VE LOGGED'DA LIKES LİSTESİNDEN TARGET I KALDIR
                await User.updateOne({ _id: logged_id }, { 
                    $push: { matches: target_id },
                    $pull: { likes: target_id },
                }).session(session);
                await User.updateOne({ _id: target_id }, { $push: { matches: logged_id } }).session(session);

            } else {
                // LIKE OLUŞTUR
                await Like.create([{
                    from: logged_id,
                    to: target_id,
                    like_type: like_type,
                    match_type: match_type,
                    track_id: track_id
                }], { session: session });

                // TARGET'IN LIKES LİSTESİNE LOGGED I EKLE
                await User.updateOne({ _id: target_id }, { $push: { likes: logged_id } }).session(session);
            }

            // LOGGEDIN LIKE HAKKINI GÜNCELLE
            var is_update = false;
            switch(like_type) {
                case 'like':
                    if(is_free) is_update = true;
                    break;
                case 'mega_like':
                    is_update = true;
                    break;
            }

            if(is_update) {
                await User.updateOne({ _id: logged_id }, {
                     $inc: { 
                        'counts.like': like_type === 'like' ? -1 : 0, 
                        'counts.mega_like': like_type === 'mega_like' ? -1 : 0 
                    }
                }).session(session);
            }
        });

        if(target_like) {

            const chat = generateChats(_chat);
            const match = generateMatchs(_match);

            // SOCKETLERE GEREKLI BILGILERI GÖNDER
            const find_lower_socket = SocketIO.findSocket(lower_id);
            if(find_lower_socket) {
                find_lower_socket.emit('new_match', {
                    chat: chat.lower_chat,
                    new_match: match.lower_match,
                });
            }

            const find_higher_socket = SocketIO.findSocket(higher_id);
            if(find_higher_socket) {
                find_higher_socket.emit('new_match', {
                    chat: chat.higher_chat,
                    new_match: match.higher_match,
                });
            }

            // IKI TARAFADA BILDIRIM GÖNDER
            pushMatchNotification({ lowerId, higherId });
        } else {
            // TARGET A BİLDİRİM GÖNDER
            switch(like_type) {
                case 'like':
                    pushLikeNotification({ from: logged_id, to: target_id });
                    break;
                case 'mega_like':
                    pushMegaLikeNotification({ from: logged_id, to: target_id });
                    break;
            }
        }
    } catch(err) {
        await session.abortTransaction();

        Error({
            file: 'MatchController.js',
            method: '_like',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    } finally {
        session.endSession();
    }
}

async function _dislike({ logged_id, target_id }) {
    const session = await db.startSession();

    try {
        // KONTROLLER YAPILACAK
        const result = await doChecks({ logged_id, target_id });
        if(!result) return;

        await session.withTransaction(async () => {
            // DISLIKE OLUŞTUR
            await Dislike.create([{ from: logged_id, to: target_id }], { session: session }); 

            // TARGET'IN DISLIKES LİSTESİNE LOGGED I EKLE
            await User.updateOne({ _id: target_id }, { $push: { dislikes: logged_id } }).session(session);
        });

    } catch(err) {
        Error({
            file: 'MatchController.js',
            method: '_dislike',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    } finally {
        session.endSession();
    }
}

// NOTIFICATIONS

async function pushMatchNotification({ lower_id, higher_id }) {
    try {
        const results = await Promise.all([
            User.findById(lower_id).select('display_name fcm_token notifications language').lean(),
            User.findById(higher_id).select('display_name fcm_token notifications language').lean()
        ]);

        const lower_user = results[0];
        const higher_user = results[1];

        if(lower_user && higher_user) {

            var promises = [];

            // LOWER A BİLDİRİM GÖNDER
            if(lower_user.notifications.new_matches) {
                const title = Language.translate({ key: 'new_match_title', lang: lower_user.language });
                const translate = Language.translate({ key: 'new_match_body', lang: lower_user.language });
                const body = translate.replace('%name', higher_user.display_name);

                promises.push(FirebaseAdmin.sendToDevice({ 
                    title: title, 
                    body: body, 
                    token: lower_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'NEW_MATCH' 
                }));
            }
           
            // TARGET A BİLDİRİM GÖNDER
            if(higher_user.notifications.new_matches) {
                const title = Language.translate({ key: 'new_match_title', lang: higher_user.language });
                const translate = Language.translate({ key: 'new_match_body', lang: higher_user.language });
                const body = translate.replace('%name', lower_user.display_name);

                promises.push(FirebaseAdmin.sendToDevice({ 
                    title: title, 
                    body: body, 
                    token: higher_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'NEW_MATCH' 
                }));
            }

            await Promise.all(promises);
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushMatchNotification',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
}

async function pushLikeNotification({ from, to }) {
    try {
        const results = await Promise.all([
            User.findById(from).select('display_name').lean(),
            User.findById(to).select('fcm_token product notifications language').lean()
        ]);

        const from_user = results[0];
        const to_user = results[1];

        if (from_user && to_user) {
            if(to_user.notifications.likes) {
                var body;
                if(to_user.product === 2) {
                    const translate = Language.translate({ key: 'premium_like_body', lang: to_user.language }); 
                    body = translate.replace('%name', from_user.display_name);
                } else {
                    body = Language.translate({ key: 'free_like_body', lang: to_user.language });
                }

                await FirebaseAdmin.sendToDevice({ 
                    body: body, 
                    token: to_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'LIKE' 
                });
            }        
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushLikeNotification',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
} 

async function pushMegaLikeNotification({ from, to }) {
    try {
        const results = await Promise.all([
            User.findById(from).select('display_name').lean(),
            User.findById(to).select('fcm_token product notifications language').lean()
        ]);

        const from_user = results[0];
        const to_user = results[1];

        if (from_user && to_user) {

            if(to_user.notifications.mega_likes) {
                var body;
                if(to_user.product === 2) {
                    const translate = Language.translate({ key: 'premium_mega_like_body', lang: to_user.language }); 
                    body = translate.replace('%name', from_user.display_name);
                } else {
                    body = Language.translate({ key: 'free_mega_like_body', lang: to_user.language });
                }

                await FirebaseAdmin.sendToDevice({ 
                    body: body, 
                    token: to_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'LIKE' 
                });
            }        
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushMegaLikeNotification',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
}

// UTILS

function generateChats(chat) {
    const lower_chat = {
        _id: chat._id,
        user: chat.higher_id,
        is_mega_like: chat.is_mega_like,

        last_message: chat.last_message,

        read: chat.lower_read,
        created_at: chat.created_at,
    };

    const higher_chat = {
        _id: chat._id,
        user: chat.lower_id,
        is_mega_like: chat.is_mega_like,

        last_message: chat.last_message,

        read: chat.higher_read,
        created_at: chat.created_at,
    };
    
    return { lower_chat, higher_chat };
}

function generateMatchs(match, chat_id) {
    const lower_chat_screen = {
        chat_id: chat_id,
        user: match.higher_id,
    };

    const higher_chat_screen = {
        chat_id: chat_id,
        user: match.lower_id,
    };

    const lower_match = {
        user: match.higher_id,
        chat_screen: lower_chat_screen,
        logged_like_type: match.lower_like_type,
        target_like_type: match.higher_like_type,
    };

    const higher_match = {
        user: match.lower_id,
        chat_screen: higher_chat_screen,
        logged_like_type: match.higher_like_type,
        target_like_type: match.lower_like_type,
    };
    
    return { lower_match, higher_match };
}
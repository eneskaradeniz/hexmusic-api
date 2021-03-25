const db = require('mongoose');

const Chat = require('../models/ChatModel');
const Match = require('../models/MatchModel');
const User = require('../models/UserModel');
const BlockedUser = require('../models/BlockedUserModel');
const Like = require('../models/LikeModel');
const Dislike = require('../models/DislikeModel');

const FirebaseAdmin = require('../firebase/FirebaseAdmin');

const SocketController = require('../shared/SocketController');

const SpotifyController = require('../shared/SpotifyController');
const Language = require('../lang/Language');

const InstantListeners = require('../shared/InstantListenersController');

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

            // MÜZİĞİ BİLGİLERİNİ AL
            await SpotifyController.getAccessToken();

            var track;
            if(is_podcast) track = await SpotifyController.getPodcast(id);
            else track = await SpotifyController.getTrack(id);
        
            // DİNLEYİCİLER LİSTESİNE KULLANICIYI KAYDET
            InstantListeners.set({ user_id: logged_id, track_id: track.id, artist_id: track.artist, is_podcast: track.is_podcast });

            // DB DE SON DİNLEDİKLERİMİ VE CURRENT_PLAY GÜNCELLE
            updateCurrentPlay(logged_id, track);

            // BU MÜZİĞİ DİNLEYENLERİN SOKETLERİNE KULLANICIYI GÖNDER

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

    async live(req, res) {
        try {
            const logged_id = req._id;

            const track = InstantListeners.get(logged_id);
            if(!track) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_TRACK'
                });
            }

            var listeners = [];
            if(logged_user.filtering.artist) listeners = InstantListeners.getArtistListeners(logged_id, track.artist); 
            else listeners = InstantListeners.getTrackListeners(logged_id, track.id); 

            var users = [];

            if(listeners.length !== 0) {
                const logged_user = await User.findById(logged_id).select('filtering').lean();

                /*
                    MÜZİĞİ DİNLEN KULLANICILARIN IDSINI ALICAM
                    DB DE BU İDLİ KULLANICILARDAN:
                        BEN YADA O ENGELEMEDİYSEK
                        EŞLEŞMEDİYSEK
                        LİKE ATMADIYSAM
                        DİSLİKE ATMADIYSAM

                        YAŞ ARALIĞI TERCİHİME UYUYORSA
                        CİNSİYET TERCİHİME UYUYORSA
                    
                    MAX 10 TANE
                    PREMİUM_PLUS DAN FREE YE DOĞRU SIRALANMIŞ
                    SELECT('display_name avatars verified birthday permissions')

                    GELEN VERİLERİ FRONTEND İN ANLAYACAĞI ŞEKİLDE KART MODELİNE ÇEVİR VE GÖNDER.
                */
    
                

                var track_ids = [track.track_id];
                if(logged_user.filtering.artist) {
                    // GELEN KULLANICILARIN DİNLEDİĞİ MÜZİKLERİ AYNI OLMAYACAK ŞEKİLDE LİSTEYE AKTAR.
                }
    
                const tracks = await SpotifyController.getTracks(track_ids);

                // KART MODELİ
                var birthday;
                if(target_user.permissions.show_age) birthday = target_user.birthday;

                const track = tracks.find(x => x.id === listeners[target_user._id].track_id);

                const user_card = {
                    user: {
                        _id: target_user._id,
                        display_name: target_user.display_name,
                        avatars: target_user.avatars,
                        verified: target_user.verified,
                    },
                    birthday: birthday,
                    track: track
                };
            }

            return res.status(200).json({
                success: true,
                users: users
            });
        } catch(err) {
            Error({
                file: 'MatchController.js',
                method: 'live',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
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
            if(user.product === 'free') {
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

// ESKİLER

async function findListenersForTarget(logged_id, track) {
    try {
        // LOGGED IN USER KARTINI OLUŞTUR
        const logged_user = await User.findById(logged_id).select('display_name avatars verified birthday permissions current_play').lean();
        if(logged_user.current_play.track !== track._id) return;
        
        var birthday = null;
        if(logged_user.permissions.show_age) birthday = logged_user.birthday;

        const logged_card = {
            user: {
                _id: logged_user._id,
                display_name: logged_user.display_name,
                avatars: logged_user.avatars,
                verified: logged_user.verified,
            },
            birthday: birthday,
            track: track,
            percentage: 0,
        };

        // BU MÜZİĞİ DİNLEYEN KULLANICILARI BİLGİLERİYLE ÇEK
        const users = await User.find({ 
            $and: [
                { _id: { $ne: logged_id } },
                { "permissions.show_live": true },
                { "current_play.is_playing": true },
                { "current_play.artist": logged_user.current_play.artist },
            ],
        }).select('filtering current_play').lean();

        for (let i = 0; i < users.length; i++) {
            try {
                const target_user = users[i];

                // AYNI KULLANICI MI
                if(logged_user._id.toString() === target_user._id.toString()) continue;
    
                // MÜZİK TERCİHİNİ UYGUN MU
                if(target_user.filtering.artist && target_user.current_play.track !== track._id) continue;
    
                // TARGETIN YAŞ ARALIĞINA UYGUN MU
                var logged_age = calculateAge(logged_user.birthday);
                if(!((target_user.filtering.min_age <= logged_age) && ( logged_age <= target_user.filtering.max_age))) continue;
    
                // TARGETIN CİNSİYET TERCİHİNE UYGUN MU
                if(target_user.filtering.gender_preference !== 'all' && logged_user.gender !== target_user.filtering.gender_preference) continue;
    
                const results = await Promise.all([
                    // LOGGED BLOCKLAMIŞ MI
                    BlockedUser.countDocuments({ from: logged_user._id, to: target_user._id }),
                    // TARGET BLOCKALMIŞ MI
                    BlockedUser.countDocuments({ from: target_user._id, to: logged_user._id }),
                    // TARGET LIKE ATMIŞ MI
                    Like.countDocuments({ from: target_user._id, to: logged_user._id }),
                    // TARGET DISLIKE ATMIŞ MI
                    Dislike.countDocuments({ from: target_user._id, to: logged_user._id }),
                    // EŞLEŞMİŞLER Mİ
                    findMatch({ logged_id: logged_user._id, target_id: target_user._id}),
                ]);

                var is_contiune = true;
                results.forEach(result => { 
                    if(result > 0) {
                        is_contiune = false;
                        return;
                    }
                });
                if(!is_contiune) continue;

                // FİLTRELEME BAŞARILI İSE SOCKETINI BUL VE GÖNDER
                const find_socket = SocketController.findSocket(target_user._id.toString());
                if(find_socket) find_socket.emit('get_card', { user: logged_card });  
            } catch(err) {
                Error({
                    file: 'MatchController.js',
                    method: 'findListenersForTarget',
                    title: err.toString(),
                    info: err,
                    type: 'critical',
                });

                continue;
            }
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'findListenersForTarget',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
}

async function loggedFilter(logged_user, users, match_type) {
    try {
        var filter_users = [];
        if(users.length === 0) return filter_users;

        for (let i = 0; i < users.length; i++) {
            try {
                const target_user = users[i];

                // AYNI KULLANICI MI
                if(logged_user._id.toString() === target_user._id.toString()) continue;

                // LOGGEDIN YAŞ ARALIĞINA UYGUN MU
                var target_age = calculateAge(target_user.birthday);
                if(!((logged_user.filtering.min_age <= target_age) && ( target_age <= logged_user.filtering.max_age))) continue;
    
                // LOGGEDIN CİNSİYET TERCİHİNE UYGUN MU
                if(logged_user.filtering.gender_preference !== 'all' && target_user.gender !== logged_user.filtering.gender_preference) continue;

                const results = await Promise.all([
                    // TARGET BLOCKLAMIŞ MI
                    BlockedUser.countDocuments({ from: target_user._id, to: logged_user._id }),
                    // LOGGED BLOCKALMIŞ MI
                    BlockedUser.countDocuments({ from: logged_user._id, to: target_user._id }),
                    // LOGGED LIKE ATMIŞ MI
                    Like.countDocuments({ from: logged_user._id, to: target_user._id }),
                    // LOGGED DISLIKE ATMIŞ MI
                    Dislike.countDocuments({ from: logged_user._id, to: target_user._id }),
                    // EŞLEŞMİŞLER Mİ
                    findMatch({ logged_id: logged_user._id, target_id: target_user._id}),
                ]);
    
                var is_contiune = true;
                results.forEach(result => { 
                    if(result > 0) {
                        is_contiune = false;
                        return;
                    }
                });
                if(!is_contiune) continue;

                // LİSTEYE EKLE
    
                var birthday;
                if(target_user.permissions.show_age) birthday = target_user.birthday;

                var track;
                if(match_type === 'live')
                    if(logged_user.filtering.artist) track = target_user.current_play.track;
                    else track = logged_user.current_play.track;
                
                filter_users.push({
                    user: {
                        _id: target_user._id,
                        display_name: target_user.display_name,
                        avatars: target_user.avatars,
                        verified: target_user.verified,
                    },
                    birthday: birthday,
                    track: track,
                    percentage: 0,
                });

            } catch(err) {
                Error({
                    file: 'MatchController.js',
                    method: 'loggedFilter',
                    title: err.toString(),
                    info: err,
                    type: 'critical',
                });

                continue;
            }
        }
    
        return filter_users;
    } catch(err) {
        throw err;
    }
}

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
                await User.updateOne({ _id: logged_id }, { 
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

        const is_free = logged_user.product === 'free' ? true : false;
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

            } else {
                // LIKE OLUŞTUR
                await Like.create([{
                    from: logged_id,
                    to: target_id,
                    like_type: like_type,
                    match_type: match_type,
                    track_id: track_id
                }], { session: session });
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
            const find_lower_socket = SocketController.findSocket(lower_id);
            if(find_lower_socket) {
                find_lower_socket.emit('new_match', {
                    chat: chat.lower_chat,
                    new_match: match.lower_match,
                });
            }

            const find_higher_socket = SocketController.findSocket(higher_id);
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

        // DISLIKE AT
        await session.withTransaction(async () => {
            return Dislike.create([{ from: logged_id, to: target_id }], { session: session }); 
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
                if(to_user.product === 'premium_plus') {
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
                if(to_user.product === 'premium_plus') {
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

function calculateAge(timestamp) {
    var birthday = new Date(timestamp);
    var ageDifMs = Date.now() - birthday.getTime();
    var ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function sortByPremiumPlus(array) {
    return array.sort((a, b) => (a.product === "premium_plus" && b.product === "premium_plus") ? 0 : a.product === "premium_plus" ? -1 : 1);
}

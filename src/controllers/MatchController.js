const db = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const Chat = require('../models/ChatModel');
const Match = require('../models/MatchModel');
const User = require('../models/UserModel');
const BlockedUser = require('../models/BlockedUserModel');
const Like = require('../models/LikeModel');
const Dislike = require('../models/DislikeModel');

const PushNotification = require('../controllers/PushNotificationController');
const shared = require('../shared/index');

const SpotifyController = require('./SpotifyController');
const Language = require('../utils/Language');

const Error = require('./ErrorController');

const Track = require('../models/TrackModel');
const Artist = require('../models/ArtistModel');

class MatchController {

    async start_music(req, res) {
        const session = await db.startSession();

        try {
            const logged_id = req._id;
            const { id, is_podcast } = req.body;
            if(id === null || is_podcast === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            var track;
            var artist;

            const find_track = await Track.findById(id).lean();
            if(find_track) {
                if(find_track.is_podcast !== is_podcast) {
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_TRACK',
                    });
                }

                track = find_track;
            } else {
                const logged_user = await User.findById(logged_id).select('spotify_refresh_token').lean();
                const access_token = await SpotifyController.refreshAccessToken(logged_user.spotify_refresh_token);
                if(!access_token) {
                    return res.status(401).json({
                        success: false,
                        error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                    });
                }

                track = is_podcast ? await SpotifyController.getPodcast(access_token, id) : await SpotifyController.getTrack(access_token, id);

                if(!is_podcast) {
                    const find_artist = await Artist.countDocuments({ _id: track.artist });
                    if(!find_artist) {
                        artist = await SpotifyController.getArtist(access_token, track.artist);
                    }
                }

                await session.withTransaction(async () => {
                    const trackExits = await Track.countDocuments({ _id: track._id }).session(session);
                    if(trackExits == 0) {
                        await Track.create([{
                            _id: track._id,
                            name: track.name,
                            artist: track.artist,
                            artists: track.artists,
                            album_name: track.album_name,
                            album_image: track.album_image,
                            is_podcast: track.is_podcast,
                        }], { session: session });
                    }
                    
                    if(artist) {
                        const artistExits = await Artist.countDocuments({ _id: artist._id }).session(session);
                        if(artistExits == 0) {
                            await Artist.create([{
                                _id: artist._id,
                                name: artist.name,
                                image: artist.image,
                            }], { session: session });
                        }
                    }
                });
            }

            await updateCurrentPlay(logged_id, track);

            findListenersForTarget(logged_id, track);

            return res.status(200).json({
                success: true,
                track: track,
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
        } finally {
            session.endSession();
        }
    }

    async stop_music(req, res) {
        try {
            const logged_id = req._id;

            await updateCurrentPlay(logged_id, null);

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
            const logged_user = await User.findById(logged_id).select('filtering current_play').populate('current_play.track').lean();

            var users = [];

            if(logged_user.filtering.artist) {
                users = await User.find({
                    $and: [
                        { _id: { $ne: logged_id } },
                        { "permissions.show_live": true },
                        { "current_play.is_playing": true },
                        { "current_play.artist": logged_user.current_play.artist },
                    ]
                })
                .select('display_name avatars verified birthday gender permissions current_play')
                .populate('current_play.track')
                .lean();
            } else {
                users = await User.find({
                    $and: [
                        { _id: { $ne: logged_id } },
                        { "permissions.show_live": true },
                        { "current_play.is_playing": true },
                        { "current_play.track": logged_user.current_play.track },
                    ]
                })
                .select('display_name avatars verified birthday gender permissions current_play')
                .lean();
            }

            const filter = await loggedFilter(logged_user, users, 'live');
            const sortResult = sortByPremiumPlus(filter);

            return res.status(200).json({
                success: true,
                users: sortResult,
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

    async likes_me(req, res) {
        try {
            const logged_id = req._id;

            // KULLANICININ PREMIUM_PLUS OLUP OLMADIĞINI KONTROL ET
            const loggedUser = await User.findById(logged_id).select('product spotifyRefreshToken');
            if(loggedUser.product !== 'premium_plus') {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            var users = [];

            // KULLANICIYI BEĞENEN KULLANICILARI GETİR
            const beniBegenenler = await Like.find({ to: logged_id }).populate('from', 'name photos isVerifed birthday permissions');
            if(beniBegenenler.length === 0) {
                return res.status(200).json({
                    success: true,
                    users
                });
            }
    
            // KULLANICIYI BEĞENENLERİN IDLERINI LİSTEYE AKTAR
            var user_ids = [];

            beniBegenenler.forEach(like => {
                user_ids.push(like.from._id);
            });

            // KULLANICIYI BEĞENENLERDE DİSLİKE ATTIĞIM VARSA ÇIKAR LİSTEDEN.
            const dislikeAttiklarim = await Dislike.find({ from: logged_id, to: { $in: user_ids } });
            var result = beniBegenenler;

            if(dislikeAttiklarim.length > 0) {
                result = beniBegenenler.filter(x => !dislikeAttiklarim.includes(x.from._id));
            }
           
            // HEPSİNİ SIRAYLA TARA MATCH TYPE I LIVE OLANLARIN SPOTİFYDAN MÜZİK BİLGİLERİNİ ÇEK VE LİSTEYE EKLE
            if(result.length > 0) {
            
                for(const like of result) {
                    let track;
                    if(like.trackId != null) track = tracks.find(x => x.id === like.trackId);

                    users.push({
                        user: {
                            _id: like.from._id,
                            name: like.from.name,
                            photos: like.from.photos,
                            isVerifed: like.from.isVerifed,
                        },
                        birthday: like.from.permissions.showAge ? like.from.birthday : null,
                        track: track,
                        percentage: 0,
                    });
                }
            }

            return res.status(200).json({
                success: true,
                users
            });

        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'likes_me',
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
            const { is_not_free, can_like, update_counts } = await canSendLike(logged_id, like_type);

            if(can_like) {
                // İŞLEMLERİ BAŞLAT
                _like({
                    logged_id,
                    target_id,
                    like_type,
                    match_type,
                    track_id,
                    is_not_free,
                    update_counts,
                });

                return res.status(200).json({
                    success: true
                });
            } else {
                return res.status(200).json({
                    success: false,
                    ad_count: update_counts.ad,
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
            const loggedId = req._id;
            const targetId = req.params.user_id;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            _dislike({
                loggedId,
                targetId,
            });

            return res.status(200).json({
                success: true,
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
        // PREMIUM OLUP OLMADIĞINI KONTROL ET
        // EŞLEŞİP EŞLEŞMEDİKLERİNİ KONTROL ET
        // BÖYLE BİR İŞLEM VARMI KONTROL ET
        // VARSA İŞLEMİ SİL
        // EĞER İŞLEM MEGALIKE İSE MEGALIKE HAKKINI GERİ VER.

        const session = await db.startSession();

        try {
            const loggedId = req._id;
            const targetId = req.params.user_id;
            const { type } = req.body;
            if(!targetId || !type) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // PREMİUM OLUP OLMADIĞINI KONTROL ET
            const user = await User.findById(loggedId).select('counts product');
            if(user.product === 'free') {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            // TRANSACTION BAŞLAT
            const transactionResults = await session.withTransaction(async () => {
                const lowerId = loggedId < targetId ? loggedId : targetId;
                const higherId = loggedId > targetId ? loggedId : targetId;

                // EŞLEŞMİŞLER Mİ
                const findMatch = await Match.countDocuments({ lowerId: lowerId, higherId: higherId }).session(session);
                if(findMatch > 0) return 'ALREADY_MATCH';

                // İŞLEM VARSA GERİ AL
                switch(type) {
                    case 'like':
                        const findLike = await Like.countDocuments({ from: loggedId, to: targetId }).session(session);
                        if(findLike === 0) return 'NOT_FOUND_LIKE';

                        await Like.findOneAndDelete({ from: loggedId, to: targetId }).session(session);
                        break;
                    case 'megaLike':
                        const findMegaLike = await Like.countDocuments({ from: loggedId, to: targetId }).session(session);
                        if(findMegaLike === 0) return 'NOT_FOUND_MEGALIKE';
                    
                        await Like.findOneAndDelete({ from: loggedId, to: targetId }).session(session);

                        user.counts.megaLike += 1;
                        await User.findByIdAndUpdate(loggedId, { 'counts.megaLike': user.counts.megaLike }).session(session);
                        break;
                    case 'dislike':
                        const findDislike = await Dislike.countDocuments({ from: loggedId, to: targetId }).session(session);
                        if(findDislike === 0) return 'NOT_FOUND_DISLIKE';

                        await Dislike.findOneAndDelete({ from: loggedId, to: targetId }).session(session);
                        break;
                    default: {
                        return 'INVALID_FIELDS';
                    }
                }
            });

            switch(transactionResults) {
                case 'ALREADY_MATCH':
                    return res.status(200).json({
                        success: false,
                        error: transactionResults,
                    });
                case 'NOT_FOUND_LIKE':
                    return res.status(200).json({
                        success: false,
                        error: transactionResults,
                    });
                case 'NOT_FOUND_MEGALIKE':
                    return res.status(200).json({
                        success: false,
                        error: transactionResults,
                    });
                case 'NOT_FOUND_DISLIKE':
                    return res.status(200).json({
                        success: false,
                        error: transactionResults,
                    });
                case 'INVALID_FIELDS':
                    return res.status(200).json({
                        success: false,
                        error: transactionResults,
                    });
            }

            return res.status(200).json({
                success: true,
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

// NEWS

async function _like({ logged_id, target_id, like_type, match_type, track_id, is_not_free, update_counts }) {

    // KULLANICININ BEĞENİ HAKKININ OLUP OLMADIĞINI KONTROL ET
    // EĞER YOKSA UYARI VER.
    // EĞER VARSA İŞLEM BAŞARILI DE HIZLI OLSUN DİYE SONRA İŞLEMİ BAŞLAT

    // KONTROLLERİ YAP (LİKE ATMAYA UYGUN MU)

    // EĞER TARGET LIKE ATMIŞSA:
    // CHATI OLUŞTUR
    // CHATI GETİR
    // LOWER VE HIGHER İÇİN CHAT OLUŞTUR
    // MATCH OLUŞTUR
    // MATCHI GETIR (TRACK VARSA ONLARI DA GETİR)
    // LOWER VE HIGHER İÇİN MATCH OLUŞTUR
    // LOGGEDIN LIKE HAKKINI GÜNCELLE
    // TARGETIN LIKE NI SİL.
    // EĞER TÜM İŞLEMLER BAŞARILI OLURSA: BİLDİRİM VE SOKETLERE BİLGİLERİ GÖNDER.

    // EĞER TARGET LIKE ATMAMIŞSA:
    // LIKE OLUŞTUR
    // LOGGEDIN LIKE HAKKINI GÜNCELLE
    // EĞER TÜM İŞLEMLER BAŞARILI OLURSA: BİLDİRİM GÖNDER.

    const session = await db.startSession();

    try {
        const lower_id = logged_id < target_id ? logged_id : target_id;
        const higher_id = logged_id > target_id ? logged_id : target_id;

        const is_lower = logged_id === lower_id;

        // KONTROLLER YAPILACAK
        const result = await doChecks({ logged_id, target_id, is_lower });
        if(!result) return;

        var target_like;
        var chat;
        var match;

        await session.withTransaction(async () => {

            // TARGET IN LIKE ATIP ATMADIĞINI KONTROL ET
            target_like = await Like.findOne({ from: target_id, to: logged_id }).session(session);

            if(target_like) {
            
                // İKİ KULLANICIYI EŞLEŞTİR

                var chat_id = ObjectId();
                var match_id = ObjectId();
    
                // CHATI OLUŞTUR
                await Chat.create([{
                    _id: chat_id,
                    match_id,
                    lower_id,
                    higher_id,
                }], { session: session });
    
                // CHATI GETIR
                const new_chat = await Chat.findById(chat_id)
                    .populate('lower_id', 'display_name avatars verified')
                    .populate('higher_id', 'display_name avatars verified')
                    .session(session);
    
                // LOWER VE HIGHER İÇİN CHATLERI OLUŞTUR
                chat = generateChats(new_chat);
    
                // MATCHI OLUŞTUR
                const lower_like_type = is_lower ? like_type : target_like.like_type;
                const higher_like_type = is_lower ? target_like.like_type : like_type;

                const lower_match_type = is_lower ? match_type : target_like.match_type;
                const higher_match_type = is_lower ? target_like.match_type : match_type;

                const lower_track = is_lower ? track_id : target_like.track;
                const higher_track = is_lower ? target_like.track : track_id;

                await Match.create([{
                    _id: match_id,
                    chat_id,
                    lower_id,
                    higher_id,
                    lower_like_type,
                    higher_like_type,
                    lower_match_type,
                    higher_match_type,
                    lower_track,
                    higher_track,
                }], { session: session });
    
                // MATCHI GETIR
                const new_match = await Match.findById(match_id)
                    .populate('lower_id', 'display_name avatars verified')
                    .populate('higher_id', 'display_name avatars verified')
                    .populate('lower_track')
                    .populate('higher_track')
                    .session(session);
    
                // LOWER VE HIGHER IÇIN MATCHLARI OLUŞTUR
                match = generateMatchs(new_match, chat_id);
    
                // LOGGEDIN LIKE HAKKINI GÜNCELLE
                switch(like_type) {
                    case 'like':
                        if(!is_not_free) 
                            await User.updateOne({ _id: logged_id }, { 'counts.like': update_counts.like }).session(session); 
                        break;
                    case 'megaLike':
                        await User.updateOne({ _id: logged_id }, { 'counts.mega_like': update_counts.mega_like }).session(session); 
                        break;
                }
                
                // TARGETIN LIKE'INI SIL
                await Like.deleteOne({ from: target_id, to: logged_id }).session(session);

            } else {

                // LIKE AT
                await Like.create([{
                    from: logged_id,
                    to: target_id,
                    like_type: like_type,
                    match_type: match_type,
                    track: track_id,
                }], { session: session });

                // LOGGEDIN LIKE HAKKINI GÜNCELLE
                switch(like_type) {
                    case 'like':
                        if(!is_not_free) 
                            await User.updateOne({ _id: logged_id }, { 'counts.like': update_counts.like }).session(session); 
                        break;
                    case 'megaLike':
                        await User.updateOne({ _id: logged_id }, { 'counts.mega_like': update_counts.mega_like }).session(session); 
                        break;
                }
            }
        });

        if(target_like) {
            // SOCKETLERE GEREKLI BILGILERI GÖNDER
            const find_lower_user = shared.users.find(x => x.user_id === lower_id);
            if(find_lower_user) {
                find_lower_user.socket.emit('new_match', {
                    chat: chat.lower_chat,
                    new_match: match.lower_match,
                });
            }

            const findHigherUser = shared.users.find(x => x.user_id === higher_id);
            if(findHigherUser) {
                findHigherUser.socket.emit('new_match', {
                    chat: chat.higher_chat,
                    new_match: match.higher_match,
                });
            }

            // IKI TARAFADA BILDIRIM GÖNDER
            pushMatchNotification({ lowerId: lower_id, higherId: higher_id });
        } else {

            // TARGET A BİLDİRİM GÖNDER
            switch(like_type) {
                case 'like':
                    pushLikeNotification({
                        from: logged_id,
                        to: target_id,
                    });
                    break;
                case 'mega_like':
                    pushMegaLikeNotification({
                        from: logged_id,
                        to: target_id,
                    });
                    break;
            }
        }
    } catch(err) {
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

async function _dislike({ loggedId, targetId }) {
    const session = await db.startSession();

    try {
        // KONTROLLER YAPILACAK
        const isLower = loggedId < targetId;
        const result = await doChecks({ loggedId, targetId, isLower });
        if(!result) return;

        // DISLIKE AT
        session.withTransaction(async () => {
            return await Dislike.create([{
                from: loggedId,
                to: targetId
            }], { session: session }); 
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

// UTILS

function generateChats(chat) {
    const lower_chat = {
        _id: chat._id,
        user: chat.higher_id,

        last_message: chat.last_message,

        read: chat.lower_read,
        created_at: chat.created_at,
    };

    const higher_chat = {
        _id: chat._id,
        user: chat.lower_id,

        last_message: chat.last_message,

        read: chat.higher_read,
        created_at: chat.created_at,
    };
    
    return { lower_chat, higher_chat };
}

function generateMatchs(match, chat_id) {
    const lower_chat_screen = {
        chat_id: chat_id,
        to: match.lower_id._id,
        user: match.higher_id,
    };

    const higher_chat_screen = {
        chat_id: chat_id,
        to: match.higher_id._id,
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

async function updateCurrentPlay(logged_id, track) {
    const session = await db.startSession();

    try {
        if(track) {
            await session.withTransaction(async () => {
                const user = await User.findById(logged_id).select('current_play last_tracks');
    
                user.current_play = {
                    track: track._id,
                    artist: track.artist,
                    is_playing: true,
                    timestamp: Date.now(),
                };
    
                // SON DİNLEDİKLERİME EKLE
                if(user.last_tracks.length > 0) {
                    if(user.last_tracks[0] !== track._id) {
                        // EN BAŞTA ŞARKI VAR VE EŞİT DEĞİL O YÜZDEN EKLE
                        if(user.last_tracks.length >= 10) user.last_tracks.pop();
                        user.last_tracks.unshift(track._id);
                    }
                } else {
                    // LİSTEDE HİÇ ELEMAN YOK EKLE
                    user.last_tracks.unshift(track._id);
                }

                await user.save();
            });
        } else {
            await session.withTransaction(async () => {
                await User.updateOne({ _id: logged_id }, { 
                    current_play: {
                        is_playing: false,
                        timestamp: Date.now(),
                    } 
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
                const find_user = shared.users.find(x => x.user_id === target_user._id.toString());
                if(find_user) find_user.socket.emit('get_card', { user: logged_card });  
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

async function findMatch({ logged_id, target_id }) {
    try {
        const lower_id = logged_id < target_id ? logged_id : target_id;
        const higher_id = logged_id > target_id ? logged_id : target_id;

        return await Match.countDocuments({ lower_id, higher_id });
    } catch (e){
        throw e;
    }
}

async function canSendLike(logged_id, like_type) {
    try {
        const logged_user = await User.findById(logged_id).select('counts product').lean();

        const is_not_free = logged_user.product !== 'free' ? true : false;
        var update_counts = logged_user.counts;
        var can_like;
        
        switch(like_type) {
            case 'like':
                if(is_not_free) can_like = true;
                else {
                    can_like = update_counts.like > 0;
                    if(can_like) update_counts.like--;
                }
                break;
            case 'mega_like':
                can_like = update_counts.mega_like > 0;
                if(can_like) update_counts.mega_like--;
                break;
        }

        return { is_not_free, can_like, update_counts };
    
    } catch (err) {
        throw err;
    }
}

async function doChecks({ logged_id, target_id, is_lower }) {
    try {
        const results = await Promise.all([
            Like.countDocuments({ from: logged_id, to: target_id }),
            Dislike.countDocuments({ from: logged_id, to: target_id }),
            Match.countDocuments({$and: [{ lower_id: is_lower ? logged_id : target_id }, { higher_id: is_lower ? target_id : logged_id }]}),
        ]);

        var test = true;
        results.forEach(result => { if(result > 0) test = false; });

        if(test) return true;
        else return false;
    } catch (err) {
        throw err;
    }
}

async function pushMatchNotification({ lower_id, higher_id }) {
    try {
        const results = await Promise.all([
            User.findById(lower_id).select('display_name fcm_token notifications language').lean(),
            User.findById(higher_id).select('display_name fcm_token notifications language').lean()
        ]);

        const lower_user = results[0];
        const higher_user = results[1];

        if(lower_user && higher_user) {

            // LOWER A BİLDİRİM GÖNDER
            if(lower_user.notifications.new_matches) {
                const title = Language.translate({ key: 'new_match_title', lang: lower_user.language });
                const translate = Language.translate({ key: 'new_match_body', lang: lower_user.language });
                const body = translate.replace('%name', higher_user.display_name);

                await PushNotification.send({ 
                    title: title, 
                    body: body, 
                    fcm_token: lower_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'NEW_MATCH' 
                });
            }
           
            // TARGET A BİLDİRİM GÖNDER
            if(higher_user.notifications.new_matches) {
                const title = Language.translate({ key: 'new_match_title', lang: higher_user.language });
                const translate = Language.translate({ key: 'new_match_body', lang: higher_user.language });
                const body = translate.replace('%name', lower_user.display_name);

                await PushNotification.send({ 
                    title: title, 
                    body: body, 
                    fcm_token: higher_user.fcm_token.token, 
                    channel_id: 'match', 
                    notification_type: 'NEW_MATCH' 
                });
            }
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

                await PushNotification.send({ 
                    body: body, 
                    fcm_token: to_user.fcm_token.token, 
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

                await PushNotification.send({ 
                    body: body, 
                    fcm_token: to_user.fcm_token.token, 
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
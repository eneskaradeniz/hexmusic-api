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

const Spotify = require('../utils/Spotify');
const Language = require('../utils/Language');

const Error = require('./ErrorController');

class MatchController {

    // MATCH

    async start_music(req, res) {
        const session = await db.startSession();

        try {
            const loggedId = req._id;
            const { trackId, artistId } = req.body;
            if(!trackId || !artistId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            var user;
            var track;
      
            const transactionResults = await session.withTransaction(async () => {
               
                user = await User.findById(loggedId).select('listen lastTracks permissions spotifyRefreshToken').session(session);

                // GELEN MÜZİĞİN BİLGİLERİNİ ÇEK.
                const access_token = await Spotify.refreshAccessToken(user.spotifyRefreshToken);
                if(!access_token) return;

                track = await Spotify.getTrack(access_token, trackId);

                // DİNLEDİĞİ MÜZİĞİ GÜNCELLE
                user.listen = {
                    trackId: trackId,
                    artistId: artistId,

                    isListen: true,
                    timestamp: Date.now(),
                }

                // SON DİNLEDİKLERİME EKLE
                if(user.lastTracks.length > 0) {
                    if(user.lastTracks[0] !== trackId) {
                        // EN BAŞTA ŞARKI VAR VE EŞİT DEĞİL O YÜZDEN EKLE
                        if(user.lastTracks.length >= 10) user.lastTracks.pop();
                        user.lastTracks.unshift(trackId);
                    }
                } else {
                    // LİSTEDE HİÇ ELEMAN YOK EKLE
                    user.lastTracks.unshift(trackId);
                }

                // KAYDET
                await user.save();
            });

            if(transactionResults) {
                // BU MÜZİĞİ DİNLEYEN KULLANICILARI BUL UYGUN OLANLARA GÖNDER (EĞER KULLANICI SHOWLIVE KAPATTI İSE GÖNDERME)
                if(user.permissions.showLive) findListenersForTarget(loggedId, track);

                console.log('müzik dinliyor:', loggedId, 'trackname:', track.name, 'trackid:', track.id);

                return res.status(200).json({
                    success: true,
                    track,
                });                
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'start_music',
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
        const session = await db.startSession();

        try {
            const loggedId = req._id;

            await session.withTransaction(async () => {
                await User.findByIdAndUpdate(loggedId, {
                    "listen.isListen": false,
                    "listen.timestamp": Date.now(),
                }).session(session);
            });

            console.log("müzik dinlemiyor:", loggedId);

            return res.status(200).json({
                success: true
            });
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'stop_music',
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

    async live(req, res) {
        try {
            const loggedId = req._id;

            // LOGGEDIN BİLGİLERİNİ GETİR.
            const loggedUser = await User.findById(loggedId).select('filtering listen spotifyRefreshToken');

            // BU MÜZİĞİ DİNLEYEN KULLANICILARI GETİR.
            var allListeners = [];
            if(loggedUser.filtering.artist) {
                allListeners = await User.find({ 
                    $and: [
                        { "permissions.showLive": true },
                        { "listen.isListen": true },
                        { "listen.artistId": { $eq: loggedUser.listen.artistId } },
                        { _id: { $ne: loggedId } },
                    ],
                }).select('name photos isVerifed birthday gender listen permissions');
            } else {
                allListeners = await User.find({ 
                    $and: [
                        { "permissions.showLive": true },
                        { "listen.isListen": true },
                        { "listen.trackId": { $eq: loggedUser.listen.trackId } },
                        { _id: { $ne: loggedId } },
                    ],
                }).select('name photos isVerifed birthday gender listen permissions');
            } 

            // LOGGED A UYGUN FİLTRELEMEYİ YAP VE O KULLANICILARI GÖNDER.
            const users = await loggedFilter(loggedUser, allListeners, 'live');

            // BU KULLANICILAR İÇERİSİNDE PREMİUM PLUS OLANDAN OLMAYANLARA DOĞRU SIRALA
            const sortResult = sortByPremiumPlus(users);

            return res.status(200).json({
                success: true,
                users: sortResult,
            });

        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'live',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async explore(req, res) {
        try {
            const loggedId = req._id;

            // KULLANICIYI BEĞENEN MAX 10 KULLANICI ÇEK (PERMISSON.SHOWEXPLORE TRUE OLANLARI ÇEK)
            // 50 - GELEN KULLANICI KADAR DB DEN KULLANICI ÇEK (PERMISSON.SHOWEXPLORE TRUE OLANLARI ÇEK)
            // LOGGED A UYGUN OLACAK ŞEKİLDE FİLTRELE PREMIUM ISE PREMIUM A GÖRE FİLTRELE (BU İŞLEMLERİ YAPARKEN MÜZİK ZEVK ORANLARINI DA HESAPLA)
            // LİSTEYİ KARIŞTIR
            // BU LİSTEYİ PREMİUM KULLANICILARDAN FREEYE DOĞRU SIRALA

            const loggedUser = await User.findById(loggedId).select('filtering listen spotifyRefreshToken');

            // KULLANICIYI BEĞENEN 10 KİŞİYİ ÇEK
            const likes = await Like.find({ to: loggedId }).limit(10);

            var likedUsers = [];
            var likedUserIds = [];

            // EĞER KULLANICIYI BEĞENEN VARSA O KULLANICILARIN BİLGİLERİNİ ÇEKİP LİSTEYE AKTAR
            if(likes.length > 0) {
                likedUsers = await User.find({
                    $and: [
                        { "permissions.showExplore": true },
                        { _id: { $in: likes } },
                    ],  
                }).select('name photos isVerifed birthday gender listen permissions');

                likedUsers.forEach(user => {
                    likedUserIds.push(user._id);
                });
            }

            // ŞİMDİ KEŞFET İÇİN KULLANICI BUL
            const findUsers = await User.find({
                $and: [
                    { "permissions.showExplore": true },
                    { _id: { $ne: loggedId } },
                    { _id: { $nin: likedUserIds }},
                ],  
            }).limit(50 - likedUsers.length).select('name photos isVerifed birthday gender listen permissions');

            // İKİ LİSTEYİ BİRLEŞTİR
            const result = likedUsers.concat(findUsers);

            // LİSTEYİ FİLTRLEYECEK
            const filterResult = await loggedFilter(loggedUser, result, 'explore');

            // LİSTEYİ KARIŞTIRACAK
            const shuffleResult = shuffle(filterResult);

            // LİSTEYİ PREMİUM PLUSDAN FREE YE DOĞRU SIRALAYACAK
            const sortResult = sortByPremiumPlus(shuffleResult);

            return res.status(200).json({
                success: true,
                users: sortResult,
            });

        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'explore',
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
            const loggedId = req._id;

            // KULLANICININ PREMIUM OLUP OLMADIĞINI KONTROL ET
            const loggedUser = await User.findById(loggedId).select('product spotifyRefreshToken');
            if(loggedUser.product !== 'premium_plus') {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            var users = [];

            // beni beğenenleri getir ama benim like atmadığım olacak.
            const beniBegenenler = await Like.find({ to: loggedId }).populate('from', 'name photos isVerifed birthday permissions');
            if(beniBegenenler.length === 0) {
                return res.status(200).json({
                    success: true,
                    users
                });
            }
    
            // beni beğenenlerin idlerini listeye aktar.
            var userIds = [];

            beniBegenenler.forEach(like => {
                userIds.push(like.from._id);
            });

            // beni beğenenlerdekilere ben dislike atıp atmadığımı kontrol et
            const dislikeAttiklarim = await Dislike.find({ from: loggedId, to: { $in: userIds } });
            var result = beniBegenenler;

            if(dislikeAttiklarim.length > 0) {
                result = beniBegenenler.filter(x => !dislikeAttiklarim.includes(x.from._id));
            }
           
            // HEPSİNİ SIRAYLA TARA MATCH TYPE I LIVE OLANLARIN SPOTİFYDAN MÜZİK BİLGİLERİNİ ÇEK VE LİSTEYE EKLE
            if(result.length > 0) {
                for(const like of result) {
                    var track;
                    if(like.trackId != null) track = await Spotify.getTrack(loggedId, like.trackId);

                    const percentage = await calculatePercentage(loggedId, like.from._id);
                    
                    users.push({
                        user: {
                            _id: like.from._id,
                            name: like.from.name,
                            photos: like.from.photos,
                            isVerifed: like.from.isVerifed,
                        },
                        birthday: like.from.permissions.showAge ? like.from.birthday : null,
                        track: track,
                        percentage: percentage,
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
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async like(req, res) {
        const session = await db.startSession();

        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            const { likeType, matchType, trackId } = req.body;
            if(!targetId || !likeType || !matchType) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            if(matchType == 'live' && !trackId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            if(loggedId.toString() == targetId.toString()) {
                return res.status(200).json({
                    success: false,
                    error: 'SAME_USER',
                });
            }

            // KULLANICININ BEĞENİ HAKKININ OLUP OLMADIĞINI KONTROL ET
            // EĞER YOKSA UYARI VER.
            // EĞER VARSA KONTROLLERİ YAP (LİKE ATMAYA UYGUN MU)

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

            // LIKE HAKKINI KONTROL ET
            const { isNotFree, canLike, updateCounts } = await canSendLike(loggedId, likeType);

            // HANGI LIKE TİPİ İLE GÖNDERDİYSE ONUN HATASINI GÖNDER.
            if(!canLike) {
                return res.status(200).json({
                    success: false,
                    adsCount: updateCounts.ads,
                    error: likeType === 'like' ? 'NOT_ENOUGH_LIKE' : 'NOT_ENOUGH_MEGALIKE'
                });
            } 

            const lowerId = loggedId < targetId ? loggedId : targetId;
            const higherId = loggedId > targetId ? loggedId : targetId;

            const isLower = loggedId === lowerId;

            // KONTROLLER YAPILACAK
            const result = await doChecks({ loggedId, targetId, isLower });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_AVAILABLE',
                });
            }

            var targetLike;
            var chat;
            var match;

            // TRANSACTION BAŞLAT
            await session.withTransaction(async () => {

                // TARGET IN LIKE ATIP ATMADIĞINI KONTROL ET
                targetLike = await Like.findOne({ from: targetId, to: loggedId }).session(session);

                if(targetLike) {
                
                    // İKİ KULLANICIYI EŞLEŞTİR
    
                    var chatId = ObjectId();
                    var matchId = ObjectId();
        
                    // CHATI OLUŞTUR
                    await Chat.create([{
                        _id: chatId,
                        matchId,
                        lowerId,
                        higherId,
                    }], { session: session });
        
                    // CHATI GETIR
                    const newChat = await Chat.findById(chatId)
                        .populate('lowerId', 'name photos isVerifed')
                        .populate('higherId', 'name photos isVerifed')
                        .session(session);
        
                    // LOWER VE HIGHER İÇİN CHATLERI OLUŞTUR
                    chat = generateChats(newChat);
        
                    // MATCHI OLUŞTUR
                    const lowerLikeType = isLower ? likeType : targetLike.likeType;
                    const higherLikeType = isLower ? targetLike.likeType : likeType;
    
                    const lowerMatchType = isLower ? matchType : targetLike.matchType;
                    const higherMatchType = isLower ? targetLike.matchType : matchType;
    
                    const lowerTrackId = isLower ? trackId : targetLike.trackId;
                    const higherTrackId = isLower ? targetLike.trackId : trackId;
    
                    await Match.create([{
                        _id: matchId,
                        chatId,
                        lowerId,
                        higherId,
                        lowerLikeType,
                        higherLikeType,
                        lowerMatchType,
                        higherMatchType,
                        lowerTrackId,
                        higherTrackId,
                    }], { session: session });
        
                    // MATCHI GETIR
                    const newMatch = await Match.findById(matchId)
                        .populate('lowerId', 'name photos isVerifed')
                        .populate('higherId', 'name photos isVerifed')
                        .session(session);
        
                    // MATCHDE TRACKLAR VARSA ONLARIN BILGILERINI ÇEK
                    if(newMatch.lowerTrackId) 
                        newMatch.lowerTrackId = await Spotify.getTrack(lowerId, newMatch.lowerTrackId);
    
                    if(newMatch.higherTrackId) 
                        newMatch.higherTrackId = await Spotify.getTrack(higherId, newMatch.higherTrackId);
        
                    // LOWER VE HIGHER IÇIN MATCHLARI OLUŞTUR
                    match = generateMatchs(newMatch, chatId);
        
                    // LOGGEDIN LIKE HAKKINI GÜNCELLE
                    switch(likeType) {
                        case 'like':
                            if(!isNotFree) {
                                // LIKE HAKKINDAN BİR EKSİLT
                                await User.findByIdAndUpdate(loggedId, { 'counts.like': updateCounts.like }).session(session); 
                            }
                            break;
                        case 'megaLike':
                            // MEGA LIKE HAKKINDAN BİR EKSİLT
                            await User.findByIdAndUpdate(loggedId, { 'counts.megaLike': updateCounts.megaLike }).session(session); 
                            break;
                    }
                    
                    // TARGETIN LIKE'INI SIL
                    await Like.findOneAndDelete({ from: targetId, to: loggedId }).session(session);
    
                } else {
    
                    // LIKE AT
                    await Like.create([{
                        from: loggedId,
                        to: targetId,
                        likeType: likeType,
                        matchType: matchType,
                        trackId: trackId,
                    }], { session: session });
    
                    // LOGGEDIN LIKE HAKKINI GÜNCELLE
                    switch(likeType) {
                        case 'like':
                            if(!isNotFree) {
                                // LIKE HAKKINDAN BİR EKSİLT
                                await User.findByIdAndUpdate(loggedId, { 'counts.like': updateCounts.like }).session(session); 
                            }
                            break;
                        case 'megaLike':
                            // MEGA LIKE HAKKINDAN BİR EKSİLT
                            await User.findByIdAndUpdate(loggedId, { 'counts.megaLike': updateCounts.megaLike }).session(session); 
                            break;
                    }
                }
            });

            if(targetLike) {
                // SOCKETLERE GEREKLI BILGILERI GÖNDER
                const findLowerUser = shared.users.find(x => x.userId === lowerId);
                if(findLowerUser) {
                    findLowerUser.socket.emit('new_match', {
                        chat: chat.lowerChat,
                        newMatch: match.lowerMatch,
                    });
                }

                const findHigherUser = shared.users.find(x => x.userId === higherId);
                if(findHigherUser) {
                    findHigherUser.socket.emit('new_match', {
                        chat: chat.higherChat,
                        newMatch: match.higherMatch,
                    });
                }

                // IKI TARAFADA BILDIRIM GÖNDER
                pushMatchNotification({ lowerId: lowerId, higherId: higherId });
            } else {

                // TARGET A BİLDİRİM GÖNDER
                switch(likeType) {
                    case 'like':
                        pushLikeNotification({
                            from: loggedId,
                            to: targetId,
                        });
                        break;
                    case 'megaLike':
                        pushMegaLikeNotification({
                            from: loggedId,
                            to: targetId,
                        });
                        break;
                }
            }
           
            return res.status(200).json({
                success: true
            });

        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'like',
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

    async dislike(req, res) {
        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // KONTROLLER YAPILACAK
            const isLower = loggedId < targetId;
            const result = await doChecks({ loggedId, targetId, isLower });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_AVAILABLE',
                });
            }

            // DISLIKE AT
            await Dislike.create({
                from: loggedId,
                to: targetId
            }); 

            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'dislike',
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
            const loggedId = req._id;
            const targetId = req.params.userId;
            const { type } = req.body;
            if(!targetId || !type) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // PREMIUM OLUP OLMADIĞINI KONTROL ET
            // EŞLEŞİP EŞLEŞMEDİKLERİNİ KONTROL ET
            // BÖYLE BİR İŞLEM VARMI KONTROL ET
            // VARSA İŞLEMİ SİL
            // EĞER İŞLEM MEGALIKE İSE MEGALIKE HAKKINI GERİ VER.

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

// UTILS

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
}

function sortByPremiumPlus(array) {
    return array.sort((a, b) => (a.product === "premium_plus" && b.product === "premium_plus") ? 0 : a.product === "premium_plus" ? -1 : 1);
}

function calculateAge(timestamp) {
    var birthday = new Date(timestamp);
    var ageDifMs = Date.now() - birthday.getTime();
    var ageDate = new Date(ageDifMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function generateChats(chat) {
    const lowerChat = {
        _id: chat._id,
        user: chat.higherId,

        lastMessage: chat.lastMessage,

        read: chat.lowerRead,
        createdAt: chat.createdAt,
    };

    const higherChat = {
        _id:  chat._id,
        user: chat.lowerId,

        lastMessage: chat.lastMessage,

        read: chat.higherRead,
        createdAt: chat.createdAt,
    };
    
    return { lowerChat, higherChat };
}

function generateMatchs(match, chatId) {
    const lowerChatScreen = {
        chatId: chatId,
        to: match.lowerId._id,
        user: match.higherId,
    };

    const higherChatScreen = {
        chatId: chatId,
        to: match.higherId._id,
        user: match.lowerId,
    };

    const lowerMatch = {
        user: match.higherId,
        chatScreen: lowerChatScreen,
        loggedLikeType: match.lowerLikeType,
        targetLikeType: match.higherLikeType,
    };

    const higherMatch = {
        user: match.lowerId,
        chatScreen: higherChatScreen,
        loggedLikeType: match.higherLikeType,
        targetLikeType: match.lowerLikeType,
    };
    
    return { lowerMatch, higherMatch };
}

async function getMatch({ loggedId, targetId }) {
    try {
        const lowerId = loggedId < targetId ? loggedId : targetId;
        const higherId = loggedId > targetId ? loggedId : targetId;

        const findMatch = await Match.countDocuments({ lowerId, higherId });
        return findMatch > 0 ? true : false;
    } catch (e){
        throw e;
    }
}

async function findListenersForTarget(loggedId, track) {
    try {
        // LOGGED IN USER KARTINI OLUŞTUR
        const loggedUser = await User.findById(loggedId).select('name photos isVerifed birthday permissions');
        
        var birthday = null;
        if(loggedUser.permissions.showAge) birthday = loggedUser.birthday;

        const loggedCard = {
            user: {
                _id: loggedUser._id,
                name: loggedUser.name,
                photos: loggedUser.photos,
                isVerifed: loggedUser.isVerifed,
            },
            birthday: birthday,
            track: track,
            percentage: 0,
        };

        // BU MÜZİĞİ DİNLEYEN KULLANICILARI ÇEK
        const users = await User.find({ 
            $and: [
                { "permissions.showLive": true },
                { "listen.isListen": true },
                { "listen.artistId": { $eq: track.artistId } },
                { _id: { $ne: loggedId } },
            ],
        }).select('filtering listen');

        // MÜZİĞİ DİNLEYEN KULLANICILARIN UYGUN OLANLARIN SOKETİNE LOGGED I GÖNDER
        for(const targetUser of users) {
            try {
                // MÜZİK TERCİHİNİ KONTROL ET
                const isArtist = targetUser.filtering.artist;
                if(!isArtist && targetUser.listen.trackId !== loggedCard.track.id) continue;

                // ZORUNLU FİLTRELEMELER

                if(loggedUser._id.toString() === targetUser._id.toString()) continue;

                let loggedCheckBlock = await BlockedUser.countDocuments({ from: loggedUser._id, to: targetUser._id });
                if(loggedCheckBlock > 0) continue;
   
                let targetCheckBlock = await BlockedUser.countDocuments({ from: targetUser._id, to: loggedUser._id });
                if(targetCheckBlock > 0) continue;
        
                let targetCheckLike = await Like.countDocuments({ from: targetUser._id, to: loggedUser._id });
                if(targetCheckLike > 0) continue;
        
                let targetCheckDislike = await Dislike.countDocuments({ from: targetUser._id, to: loggedUser._id });
                if(targetCheckDislike > 0) continue;
            
                let checkMatch = await getMatch({ loggedId: loggedUser._id, targetId: targetUser._id});
                if(checkMatch) continue;
            
                //TARGET PREMIUM FILTRELEMELERI
        
                var loggedAge = calculateAge(loggedUser.birthday);
        
                // YAŞ ARALIĞI
                if(!((targetUser.filtering.minAge <= loggedAge) && ( loggedAge <= targetUser.filtering.maxAge))) continue;
            
                // CİNSİYET TERCİHİ
                if(targetUser.filtering.genderPreference !== 'all' && loggedUser.gender !== targetUser.filtering.genderPreference) continue;

                const percentage = await calculatePercentage(loggedUser._id, targetUser._id);
                loggedCard.percentage = percentage;

                const findUser = shared.users.find(x => x.userId === targetUser._id.toString());
                if(findUser) {
                    findUser.socket.emit('get_card', {
                        user: loggedCard,
                    });
                }
            } catch (err) {
                Error({
                    file: 'MatchController.js',
                    method: 'loggedFilter',
                    info: err,
                    type: 'critical',
                });

                continue;
            }
        }
    } catch (e) {
        throw e;
    }
}

async function loggedFilter(loggedUser, users, matchType) {
    var filterUsers = [];

    for(const targetUser of users) {
        try {
            // ZORUNLU FİLTRELEMELER

            if(loggedUser._id.toString() === targetUser._id.toString()) continue;

            let targetCheckBlock = await BlockedUser.countDocuments({ from: targetUser._id, to: loggedUser._id });
            if(targetCheckBlock > 0) continue;

            let loggedCheckBlock = await BlockedUser.countDocuments({ from: loggedUser._id, to: targetUser._id });
            if(loggedCheckBlock > 0) continue;
    
            let loggedCheckLike = await Like.countDocuments({ from: loggedUser._id, to: targetUser._id });
            if(loggedCheckLike > 0) continue;
    
            let loggedCheckDislike = await Dislike.countDocuments({ from: loggedUser._id, to: targetUser._id });
            if(loggedCheckDislike > 0) continue;
        
            let findMatch = await getMatch({ loggedId: loggedUser._id, targetId: targetUser._id});
            if(findMatch) continue;
        
            // LOGGED PREMIUM FILTRELEMELERI
    
            var targetAge = calculateAge(targetUser.birthday);
    
            // YAŞ ARALIĞI
            if(!((loggedUser.filtering.minAge <= targetAge) && ( targetAge <= loggedUser.filtering.maxAge))) continue;
        
            // CİNSİYET TERCİHİ
            if(loggedUser.filtering.genderPreference !== 'all' && targetUser.gender !== loggedUser.filtering.genderPreference) continue;

            var birthday;
            if(targetUser.permissions.showAge) birthday = targetUser.birthday;
            
            var track;
            if(matchType === 'live') track = await Spotify.getTrack(loggedUser._id, targetUser.listen.trackId);

            const percentage = await calculatePercentage(loggedUser._id, targetUser._id);
            
            filterUsers.push({
                user: {
                    _id: targetUser._id,
                    name: targetUser.name,
                    photos: targetUser.photos,
                    isVerifed: targetUser.isVerifed,
                },
                birthday: birthday,
                track: track,
                percentage: percentage,
            });
        } catch (err) {
            Error({
                file: 'MatchController.js',
                method: 'loggedFilter',
                info: err,
                type: 'critical',
            });

            continue;
        }
    }

    return filterUsers;
}

async function calculatePercentage(loggedId, targetId) {
    try {
        const loggedUser = await User.findById(loggedId).select('spotifyFavArtists');
        const targetUser = await User.findById(targetId).select('spotifyFavArtists');

        const commonFavArtists = loggedUser.spotifyFavArtists.filter(x => targetUser.spotifyFavArtists.includes(x));
        if(commonFavArtists.length > 0) {
            const loggedPercentage = Math.trunc((100 / (loggedUser.spotifyFavArtists.length / commonFavArtists.length)));
            const targetPercentage = Math.trunc((100 / (targetUser.spotifyFavArtists.length / commonFavArtists.length)));

            return loggedPercentage >= targetPercentage ? loggedPercentage : targetPercentage;
        }

        return 0;
    } catch (e) {
        throw e;
    }
}

async function canSendLike(loggedId, likeType) {
    try {
        const loggedUser = await User.findById(loggedId).select('counts product');

        const isNotFree = loggedUser.product !== 'free' ? true : false;
        var updateCounts = loggedUser.counts;
        var canLike;
        
        switch(likeType) {
            case 'like':
                if(isNotFree) canLike = true;
                else {
                    canLike = likeType === 'like' ? updateCounts.like > 0 : updateCounts.megaLike > 0;
                    if(canLike) updateCounts.like--;
                }
                break;
            case 'megaLike':
                canLike = likeType === 'like' ? updateCounts.like > 0 : updateCounts.megaLike > 0;
                if(canLike) updateCounts.megaLike--;
                break;
        }

        return { isNotFree, canLike, updateCounts };
    
    } catch (e) {
        throw e;
    }
}

async function doChecks({ loggedId, targetId, isLower }) {
    try {
        let loggedLike = await Like.countDocuments({ from: loggedId, to: targetId });
        if(loggedLike > 0) return false;

        let loggedDislike = await Dislike.countDocuments({ from: loggedId, to: targetId });
        if(loggedDislike > 0) return false;

        let findMatch = await Match.countDocuments({$and: [{lowerId: isLower ? loggedId : targetId }, {higherId: isLower ? targetId : loggedId}]});
        if(findMatch > 0) return false;

        return true;
    } catch (e) {
        throw e;
    }
}

async function pushMatchNotification({ lowerId, higherId }) {
    try {
        const lowerUserInfo = await User.findById(lowerId).select('name fcmToken notifications language');
        const higherUserInfo = await User.findById(higherId).select('name fcmToken notifications language');

        if(lowerUserInfo && higherUserInfo) {
            // LOWER A BİLDİRİM GÖNDER
            if(lowerUserInfo.notifications.newMatches) {
                const title = await Language.translate({ key: 'new_match_title', lang: lowerUserInfo.language });
                const translate = await Language.translate({ key: 'new_match_body', lang: lowerUserInfo.language });
                const body = translate.replace('%name', higherUserInfo.name);
                await PushNotification.send({ title: title, body: body, fcmToken: lowerUserInfo.fcmToken.token, channel_id: 'match', notification_type: 'NEW_MATCH' });
            }
           
            // TARGET A BİLDİRİM GÖNDER
            if(higherUserInfo.notifications.newMatches) {
                const title = await Language.translate({ key: 'new_match_title', lang: higherUserInfo.language });
                const translate = await Language.translate({ key: 'new_match_body', lang: higherUserInfo.language });
                const body = translate.replace('%name', lowerUserInfo.name);
                await PushNotification.send({ title: title, body: body, fcmToken: higherUserInfo.fcmToken.token, channel_id: 'match', notification_type: 'NEW_MATCH' });
            }
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushMatchNotification',
            info: err,
            type: 'critical',
        });
    }
}

async function pushLikeNotification({ from, to }) {
    try {
        const fromUserInfo = await User.findById(from).select('name');
        const toUserInfo = await User.findById(to).select('fcmToken product notifications language');

        if (fromUserInfo && toUserInfo) {

            if(toUserInfo.notifications.likes) {
                var body;
                if(toUserInfo.product === 'premium_plus') {
                    const translate = await Language.translate({ key: 'premium_like_body', lang: toUserInfo.language }); 
                    body = translate.replace('%name', fromUserInfo.name);
                } else {
                    body = await Language.translate({ key: 'free_like_body', lang: toUserInfo.language });
                }

                await PushNotification.send({ body: body, fcmToken: toUserInfo.fcmToken.token, channel_id: 'match', notification_type: 'LIKE' });
            }        
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushLikeNotification',
            info: err,
            type: 'critical',
        });
    }
} 

async function pushMegaLikeNotification({ from, to }) {
    try {
        const fromUserInfo = await User.findById(from).select('name');
        const toUserInfo = await User.findById(to).select('fcmToken product notifications language');

        if (fromUserInfo && toUserInfo) {

            if(toUserInfo.notifications.megaLikes) {
                var body;
                if(toUserInfo.product === 'premium_plus') {
                    const translate = await Language.translate({ key: 'premium_mega_like_body', lang: toUserInfo.language }); 
                    body = translate.replace('%name', fromUserInfo.name);
                } else {
                    body = await Language.translate({ key: 'free_mega_like_body', lang: toUserInfo.language });
                }

                await PushNotification.send({ body: body, fcmToken: toUserInfo.fcmToken.token, channel_id: 'match', notification_type: 'LIKE' });
            }        
        }
    } catch (err) {
        Error({
            file: 'MatchController.js',
            method: 'pushMegaLikeNotification',
            info: err,
            type: 'critical',
        });
    }
} 
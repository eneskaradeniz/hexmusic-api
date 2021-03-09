const db = require('mongoose');

const ObjectId = require('mongoose').Types.ObjectId;
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

const User = require('../models/UserModel');
const BlockedUser = require('../models/BlockedUserModel');
const Match = require('../models/MatchModel');
const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const Like = require('../models/LikeModel');
const Dislike = require('../models/DislikeModel');

const Spotify = require('../utils/Spotify');
const FileController = require('../controllers/FileController');

const shared = require('../shared/index');

const Error = require('./ErrorController');

const generateJwtToken = (userId) => jwt.sign({ _id: userId }, jwtConfig.secret);

class UserController {

    // AUTH

    async callback(req, res) {  
        try {
            const code = req.query.code;
            if (!code) {
                return res.status(200).json({
                    success: false,
                    error: 'NO_AUTH_CODE',
                });
            }

            const codeGrant = await Spotify.getAuthorizationCodeGrant(code);
            if(!codeGrant) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }

            const { access_token, refresh_token } = codeGrant;

            const spotifyId = await Spotify.getSpotifyId(access_token);
            if(!spotifyId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }

            const user = await User.findOne({ spotifyId }).select('_id');
            if(user) {
                // GELEN REFRESH TOKENI GÜNCELLE ÖYLE GİRİŞ YAPTIR.
                await updateSpotifyRefreshToken(user._id, refresh_token);

                // BÖYLE BİR KULLANICI VAR TOKEN OLUŞTUR VE PROFILI GETİR
                const token = generateJwtToken(user._id);
                const myProfile = await getMyProfile(user._id);

                return res.status(200).json({ 
                    success: true,

                    userId: user._id,
                    token: token,
                    spotifyRefreshToken: refresh_token,
                    user: myProfile,
                }); 
            } else {
                // BÖYLE BİR KULLANICI YOK KAYIT OL EKRANINA AKTAR
                const { spotifyFavTrackIds, spotifyFavTracks } = await Spotify.getMyTopTracks(access_token);
                const { spotifyFavArtistIds, spotifyFavArtists } = await Spotify.getMyTopArtists(access_token);

                return res.status(200).json({
                    success: true,

                    spotifyId: spotifyId,
                    spotifyRefreshToken: refresh_token,

                    spotifyFavTrackIds: spotifyFavTrackIds,
                    spotifyFavTracks: spotifyFavTracks,
                    
                    spotifyFavArtistIds: spotifyFavArtistIds,
                    spotifyFavArtists: spotifyFavArtists,
                });            
            }
        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'callback',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async register(req, res) {
        // GELEN FOTOĞRAFLARI LISTEYE AKTAR
        var photos = [];
      
        try {
            req.files.forEach(file => {
                photos.push(file.id);
            });

            const { spotifyId, spotifyRefreshToken, spotifyFavArtists, spotifyFavTracks, email, name, birthday, gender, bio, city, favTracks, favArtists, language } = JSON.parse(req.body._body);
            if(!spotifyId || !spotifyRefreshToken || !spotifyFavArtists || !spotifyFavTracks || !email || !name || !birthday || !gender || !language) {
                FileController.deleteImages(photos);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // ADULT VALIDATOR
            const _isAdult = isAdult(birthday);
            if(!_isAdult) {
                FileController.deleteImages(photos);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            
            const userExists = await User.countDocuments({ spotifyId: spotifyId });
            if (userExists > 0) {
                FileController.deleteImages(photos);
                return res.status(200).json({
                    success: false,
                    error: 'ALREADY_REGISTER',
                });
            }

            const userId = ObjectId();
            await User.create({
                _id: userId,
                spotifyId,
                spotifyRefreshToken,
                spotifyFavArtists,
                spotifyFavTracks,
                photos,
                email,
                name,
                birthday,
                gender,
                bio,
                city,
                favTracks,
                favArtists,
                language
            });

            const token = generateJwtToken(userId);
            const myProfile = await getMyProfile(userId);

            return res.status(200).json({
                success: true,
                token,
                userId,
                spotifyRefreshToken,
                user: myProfile,
            });

        } catch (err) {
            FileController.deleteImages(photos);

            Error({
                file: 'UserController.js',
                method: 'register',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
    
    // USER
    
    async me(req, res) {
        try{
            const loggedId = req._id;
            const user = await getMyProfile(loggedId);

            return res.status(200).json({
                success: true,
                user,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'me',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async profile(req, res) {
        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // GEREKLI BİLGİLERİ ÇEK
            const loggedProfile = await User.findById(loggedId).select('name photos isVerifed spotifyFavTracks spotifyFavArtists spotifyRefreshToken');
 
            const targetProfile = await User.findById(targetId).select('name photos isVerifed birthday city bio socialAccounts lastTracks favTracks favArtists spotifyFavTracks spotifyFavArtists spotifyRefreshToken permissions');
            if(!targetProfile) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_TARGET_USER',
                });
            }

            const access_token = await Spotify.refreshAccessToken(loggedProfile.spotifyRefreshToken);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            // PROFILE

            var birthday;
            if(targetProfile.permissions.showAge) birthday = targetProfile.birthday;
            
            var lastTracks;
            if(targetProfile.permissions.showLastTracks) lastTracks = await Spotify.getTracks(access_token, targetProfile.lastTracks);
            
            const favTracks = await Spotify.getTracks(access_token, targetProfile.favTracks);
            const favArtists = await Spotify.getArtists(access_token, targetProfile.favArtists);

            const profile = {
                user: {
                    _id: targetId,
                    name: targetProfile.name,
                    isVerifed: targetProfile.isVerifed,
                    photos: targetProfile.photos,
                },
              
                birthday: birthday,
                city: targetProfile.city,

                bio: targetProfile.bio,
                socialAccounts: targetProfile.socialAccounts,
                
                lastTracks: lastTracks,
                favTracks: favTracks,
                favArtists: favArtists,
            }

            // COMMON

            const commonTrackIds = loggedProfile.spotifyFavTracks.filter(x => targetProfile.spotifyFavTracks.includes(x));
            const commonArtistIds = loggedProfile.spotifyFavArtists.filter(x => targetProfile.spotifyFavArtists.includes(x));

            const commonTracks = await Spotify.getTracks(access_token, commonTrackIds);
            const commonArtists = await Spotify.getArtists(access_token, commonArtistIds);

            var percentage = calculatePercentage(commonArtists.length, loggedProfile.spotifyFavArtists.length, targetProfile.spotifyFavArtists.length);

            const common = {
                commonTracks: commonTracks,
                commonArtists: commonArtists,
                percentage: percentage,
            }

            // MATCH

            var match;

            const lowerId = loggedId < targetId ? loggedId : targetId;
            const higherId = loggedId > targetId ? loggedId : targetId;
            
            const findMatch = await Match.findOne({ lowerId: lowerId, higherId: higherId });

            if(findMatch) {
                const isLower = loggedId === lowerId;

                const loggedUser = {
                    _id: loggedProfile._id,
                    name: loggedProfile.name,
                    photos: loggedProfile.photos,
                    isVerifed: loggedProfile.isVerifed,
                };
                const targetUser = {
                    _id: targetProfile._id,
                    name: targetProfile.name,
                    photos: targetProfile.photos,
                    isVerifed: targetProfile.isVerifed,
                };

                const loggedMatchType = isLower ? findMatch.lowerMatchType : findMatch.higherMatchType;
                const targetMatchType = isLower ? findMatch.higherMatchType : findMatch.lowerMatchType;

                const loggedLikeType = isLower ? findMatch.lowerLikeType : findMatch.higherLikeType;
                const targetLikeType = isLower ? findMatch.higherLikeType : findMatch.lowerLikeType;

                const loggedTrackId = isLower ? findMatch.lowerTrackId : findMatch.higherTrackId;
                const targetTrackId = isLower ? findMatch.higherTrackId : findMatch.lowerTrackId;

                var loggedTrack = {};
                var targetTrack = {};

                if(loggedTrackId)
                    loggedTrack = await Spotify.getTrack(access_token, loggedTrackId);
                
                if(targetTrackId)
                    targetTrack = await Spotify.getTrack(access_token, targetTrackId);
    
                match = {
                    loggedUser,
                    loggedMatchType,
                    loggedLikeType,
                    loggedTrack,

                    targetUser,
                    targetMatchType,
                    targetLikeType,
                    targetTrack
                };
            }

            return res.status(200).json({
                success: true,
                profile,
                common,
                match,
            });

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'profile',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false,
            });
        }
    }

    async delete_account(req, res) {
        const session = await db.startSession();

        try {
            const loggedId = req._id;

            // USERMODEL SİLİNECEK
            // TÜM ENGELLEDİKLERİ SİLİNECEK
            // TÜM DİSLİKELARI SİLİNECEK
            // TÜM LİKELARI SİLİNECEK
            
            // TÜM EŞLEŞMELERİ SİLİNECEK
            // TÜM EŞLEŞTİĞİ KİŞİLERLE OLAN CHATLERİ SİLİNECEK
            // SİLİNEN CHATLERİN MESAJLARIDA SİLİNECEK
            
            // KULLANICININ EŞLEŞTİĞİ TÜM KİŞİLERİN SOKETLERİNE EŞLEŞMENİN BİTİTĞİNİ SÖYLECEK

            // EĞER BU İŞLEMLER BAŞARILI OLURSA KULLANICININ FOTOĞRAFLARI VARSA TÜM FOTOĞRAFLARI SİLİNECEK

            var photos = [];
            var users = [];
            
            await session.withTransaction(async () => {
                // KULLANICININ FOTOĞRAFLARINI ÇEK
                const user = await User.findById(loggedId).select('photos');
                photos = user.photos;

                // USER I SİL
                await User.findByIdAndDelete(loggedId).session(session);

                // ENGELLEDİKLERİNİ SİL
                await BlockedUser.deleteMany({
                    $or: [{ from: loggedId }, { to: loggedId }]
                }).session(session);

                // LİKELARINI SİL
                await Like.deleteMany({
                    $or: [{ from: loggedId }, { to: loggedId }]
                }).session(session);

                // DİSLİKELARINI SİL
                await Dislike.deleteMany({
                    $or: [{ from: loggedId }, { to: loggedId }]
                }).session(session);

                // KULLANICININ TÜM EŞLEŞTİĞİ KULLANICILARIN IDLERINI GETİR (SOKETLERİNE İLİŞKİ BİTTİĞİNİ SÖYLEYECEK)
                const matches = await Match.find({
                    $or: [{ lowerId: loggedId }, { higherId: loggedId }]
                }).select('chatId higherId lowerId').session(session);

                var chatIds = [];
                
                matches.forEach(match => {
                    chatIds.push(match.chatId);
                    
                    const isLower = match.lowerId.toString() === loggedId;
                    users.push({ userId: isLower ? match.higherId : match.lowerId, chatId: match.chatId });
                });

                // EŞLEŞMELERİNİ SİL
                await Match.deleteMany({
                    $or: [{ lowerId: loggedId }, { higherId: loggedId }]
                }).session(session);

                // CHATLERİNİ SİL
                await Chat.deleteMany({
                    $or: [{ lowerId: loggedId }, { higherId: loggedId }]
                }).session(session);

                // SİLİNEN CHATLERİN MESAJLARINI SİL
                await Message.deleteMany({
                    chatId: { $in: chatIds }
                }).session(session);
            });

            // TÜM FOTOĞRAFLARINI SİL
            FileController.deleteImages(photos);

            // EŞLEŞTİĞİ KULLANICILARIN SOKETLERİNE EŞLEŞME BİTTİĞİNİ SÖYLE
            users.forEach(model => {
                const findUser = shared.users.find(x => x.userId === model.userId.toString());
                if(findUser) {
                    findUser.socket.emit('end_user', {
                        userId: model.userId,
                        chatId: model.chatId,
                    });
                }   
            });

            return res.status(200).json({
                success: true
            });
        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'delete_account',
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

    // END AND BLOCK

    async blocked_users(req, res) {
        try {
            const loggedId = req._id;

            // KULLANICININ TÜM ENGELLEDİĞİ KULLANICILARI ÇEK
            const blocks = await BlockedUser.find({ from: loggedId }).populate('to', 'name photos isVerifed');
    
            // FRONTEND İN ANLAYACAĞI ŞEKİLDE GÖNDER
            var users = [];
            blocks.forEach(block => {
                users.push({
                    _id: block._id,
                    user: block.to,
                    sendAt: block.sendAt,
                });
            });

            return res.status(200).json({
                success: true,
                users: users,
            });

        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'blocked_users',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async end_user(req, res) {
        const session = await db.startSession();

        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
 
            // BÖYLE BİR EŞLEŞMENİN OLUP OLMADIĞINI KONTROL ET.
            const lowerId = loggedId < targetId ? loggedId : targetId;
            const higherId = loggedId > targetId ? loggedId : targetId;

            const findMatch = await Match.findOne({
                lowerId: lowerId,
                higherId: higherId
            }).select('_id chatId');

            if(!findMatch) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_MATCH',
                });
            }
   
            await session.withTransaction(async () => {
                // EŞLEŞME İLE ALAKALI HERŞEYİ SİL.
                await Chat.findByIdAndDelete(findMatch.chatId).session(session);
                await Message.deleteMany({ chatId: findMatch.chatId }).session(session);
                await Match.findByIdAndDelete(findMatch._id).session(session);
            });

            const findTargetUser = shared.users.find(x => x.userId === targetId);
            if(findTargetUser) {
                findTargetUser.socket.emit('end_user', {
                    userId: loggedId,
                    chatId: findMatch.chatId,
                });
            }    
            
            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'end_user',
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

    async block_user(req, res) {
        const session = await db.startSession();

        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
 
            // BÖYLE BİR EŞLEŞMENİN OLUP OLMADIĞINI KONTROL ET.
            const lowerId = loggedId < targetId ? loggedId : targetId;
            const higherId = loggedId > targetId ? loggedId : targetId;

            const findMatch = await Match.findOne({
                lowerId: lowerId,
                higherId: higherId
            }).select('_id chatId');
            
            if(!findMatch) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_MATCH',
                });
            }
   
            await session.withTransaction(async () => {
                // EŞLEŞME İLE ALAKALI HERŞEYİ SİL.
                await Chat.findByIdAndDelete(findMatch.chatId).session(session);
                await Message.deleteMany({ chatId: findMatch.chatId }).session(session);
                await Match.findByIdAndDelete(findMatch._id).session(session);

                // KULLANICIYI ENGELLE.
                await BlockedUser.create([{ from: loggedId, to: targetId }], { session: session });
            });

            const findTargetUser = shared.users.find(x => x.userId === targetId);
            if(findTargetUser) {
                findTargetUser.socket.emit('end_user', {
                    userId: loggedId,
                    chatId: findMatch.chatId,
                });
            }    
            
            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'block_user',
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

    async unblock_user(req, res) {
        try {
            const loggedId = req._id;
            const targetId = req.params.userId;
            if(!targetId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR BLOK VARMI KONTROL ET.
            const findBlockUser = await BlockedUser.findOne({ from: loggedId, to: targetId }).select('_id');
            if(!findBlockUser) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_BLOCK_USER',
                });
            }

            // ENGELİ KALDIR.
            await BlockedUser.findByIdAndDelete(findBlockUser._id);  

            return res.status(200).json({
                success: true,
            });

        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'unblock_user',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
   
    // PROFILE IMAGES

    async add_photo(req, res) {
        const imageId = req.file != null ? req.file.id : null;

        try {
            const loggedId = req._id;
            if(!imageId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const loggedUser = await User.findById(loggedId).select('photos product');
            if(loggedUser.photos.length >= 6) {
                return res.status(200).json({
                    success: false,
                    error: 'MAX_PHOTOS_LIMIT',
                });
            }
            if(loggedUser.product === 'free' && loggedUser.photos.length >= 3) {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            // FOTOĞRAFI EKLE
            await User.findByIdAndUpdate(loggedId, { $push: { photos: imageId } });

            return res.status(200).json({
                success: true,
                imageId
            });

        } catch(err) {
            // İŞLEM BAŞARISIZ GELEN FOTOĞRAF VARSA SİL.
            FileController.deleteImageById(imageId);

            Error({
                file: 'UserController.js',
                method: 'add_photo',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_photos(req, res) {
        try {
            const loggedId = req._id;
            const { photos } = req.body;
            if(!photos) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { photos });

            return res.status(200).json({
                success: true,
            });
        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'update_photos',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async delete_photo(req, res) {
        try {
            const loggedId = req._id;
            const imageId = req.params.imageId;
            if(!imageId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const result = await FileController.deleteImageById(imageId);
            if(!result) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, {
                $pull: { photos: imageId }
            });

            return res.status(200).json({
                success: true,
            });

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'delete_photo',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    // USER UPDATE

    async update_profile(req, res) {
        try {
            const loggedId = req._id;
            const { email, name, birthday, gender, city, bio, socialAccounts } = req.body;
            if(!email || !name || !birthday || !gender || !socialAccounts) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // ADULT VALIDATOR
            const _isAdult = isAdult(birthday);
            if(!_isAdult) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            
            await User.findByIdAndUpdate(loggedId, {
                email: email,
                name: name,
                birthday: birthday,
                gender: gender,
                city: city,
                bio: bio,
                socialAccounts: socialAccounts,
            });

            return res.status(200).json({
                success: true
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_profile',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_firebase(req, res) {
        try {
            const loggedId = req._id;
            const { fcmToken } = req.body;
            if(!fcmToken) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            fcmToken.createdAt = Date.now();
            await User.findByIdAndUpdate(loggedId, { fcmToken: fcmToken });

            return res.status(200).json({
                success: true
            });

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'update_firebase',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_language(req, res) {
        try {
            const loggedId = req._id;
            const { language } = req.body;
            if(!language) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { language: language });

            return res.status(200).json({
                success: true
            });

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'update_language',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_fav_tracks(req, res) {
        try {
            const loggedId = req._id;
            const { favTracks } = req.body;
            if(!favTracks) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { favTracks });

            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_fav_tracks',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_fav_artists(req, res) {
        try {
            const loggedId = req._id;
            const { favArtists } = req.body;
            if(!favArtists) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { favArtists });

            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_fav_artists',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_spotify_favorites(req, res) {
        try {
            const loggedId = req._id;

            const user = await User.findById(loggedId).select('spotifyRefreshToken');
            const access_token = await Spotify.refreshAccessToken(user.spotifyRefreshToken);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const myTopTracks = await Spotify.getMyTopTracks(access_token);
            const myTopArtists = await Spotify.getMyTopArtists(access_token);

            await User.findByIdAndUpdate(loggedId, {
                spotifyFavTracks: myTopTracks.spotifyFavTrackIds,
                spotifyFavArtists: myTopArtists.spotifyFavArtistIds,
            });

            return res.status(200).json({
                success: true,
                spotifyFavTracks: myTopTracks.spotifyFavTracks,
                spotifyFavArtists: myTopArtists.spotifyFavArtists,
            });

        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_spotify_favorites',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_permissions(req, res) {
        try {
            const loggedId = req._id;
            const { permissions } = req.body;
            if(!permissions) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { permissions });

            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_permissions',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_notifications(req, res) {
        try {
            const loggedId = req._id;
            const { notifications } = req.body;
            if(!notifications) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.findByIdAndUpdate(loggedId, { notifications });

            return res.status(200).json({
                success: true,
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_notifications',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_filtering(req, res) {
        try {
            const loggedId = req._id;
            const { filtering } = req.body;
            if(!filtering) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const user = await User.findById(loggedId).select('product');
            if(user.product !== 'free') {
                await User.findByIdAndUpdate(loggedId, { filtering });
            } else {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }
 
            return res.status(200).json({
                success: true
            });
        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'update_filtering',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    // SPOTIFY SEARCH

    async search_tracks(req, res) {
        try {
            const searchField = req.params.search;
            const { refresh_token } = req.body;
            if(!searchField || !refresh_token) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const tracks = await Spotify.searchTracks(refresh_token, searchField);
            if(!tracks) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }
            
            return res.status(200).json({
                success: true,
                tracks
            })

        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'search_tracks',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async search_artists(req, res) {
        try {
            const searchField = req.params.search;
            const { refresh_token } = req.body;
            if(!searchField || !refresh_token) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const artists = await Spotify.searchArtists(refresh_token, searchField);
            if(!artists) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            return res.status(200).json({
                success: true,
                artists
            })

        } catch (err) {
            Error({
                file: 'UserController.js',
                method: 'search_artists',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    // OTHER

    async action(req, res) {
        try {
            const loggedId = req._id;

            // LOGGEDIN ACCESS TOKENI GETİR
            const loggedUser = await User.findById(loggedId).select('spotifyRefreshToken');

            const access_token = await Spotify.refreshAccessToken(loggedUser.spotifyRefreshToken);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            // KULLANICININ EŞLEŞTİĞİ İNSANLARI ÇEK
            const matches = await Match.find({
                $or: [{ lowerId: loggedId }, { higherId: loggedId }]
            }).select('lowerId higherId');

            // EŞLEŞTİĞİ KULLANICILARIN IDLERINI BİR LİSTEYE AKTAR
            var userIds = [];
            matches.forEach(match => {
                const isLower = match.lowerId.toString() === loggedId;
                userIds.push(isLower ? match.higherId : match.lowerId);
            });

            // EŞLEŞTİĞİ İNSANLARIN EĞER PERMISSON.showAction OLANLARIN DİNLEDİĞİ MÜZİKLERİ GETİR.
            const result = await User.find({ 
                _id: { $in: userIds },
                "listen.trackId": { $ne: null },
                "permissions.showAction": true,
            }).select('name photos isVerifed listen');

            // BU LİSTENİN İÇİNDEKİ MÜZİKLERİ ÇEK

            var users = [];

            var trackIds = [];
            result.forEach(user => trackIds.push(user.listen.trackId));
            var tracks = await Spotify.getTracks(access_token, trackIds);

            for(const user of result) {
                const track = tracks.find(x => x.id === user.listen.trackId);
                users.push({
                    user: {
                        _id: user._id,
                        name: user.name,
                        photos: user.photos,
                        isVerifed: user.isVerifed,
                    },

                    track: track,
                    isListen: user.listen.isListen,
                    timestamp: user.listen.timestamp,
                });
            }

            return res.status(200).json({
                success: true,
                users
            });
        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'action',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async get_last_tracks(req, res) {
        try {
            const loggedId = req._id;

            const user = await User.findById(loggedId).select('spotifyRefreshToken lastTracks');

            const access_token = await Spotify.refreshAccessToken(user.spotifyRefreshToken);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const lastTracks = await Spotify.getTracks(access_token, user.lastTracks);

            return res.status(200).json({
                success: true,
                tracks: lastTracks,
            }); 

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'get_last_tracks',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
}

module.exports = new UserController();

// UTILS

async function updateSpotifyRefreshToken(loggedId, refresh_token) {
    try {
        await User.findByIdAndUpdate(loggedId, {
            spotifyRefreshToken: refresh_token
        });
    } catch(err) {
        throw err;
    }
}

async function getMyProfile(loggedId) {
    console.time('getMyProfile');
    try {
        console.time('fetch_user');
        const user = await User.findById(loggedId).select('email name photos isVerifed birthday city bio gender socialAccounts lastTracks favTracks favArtists permissions notifications filtering product spotifyFavTracks spotifyFavArtists spotifyRefreshToken');
        console.timeEnd('fetch_user');

        console.time('refresh_token');
        const access_token = await Spotify.refreshAccessToken(user.spotifyRefreshToken);
        if(!access_token) {
            return res.status(401).json({
                success: false,
                error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
            });
        }
        console.timeEnd('refresh_token');

        console.time('spotify_me');
        const lastTracks = Spotify.getTracks(access_token, user.lastTracks);
        const favTracks = Spotify.getTracks(access_token, user.favTracks);
        const favArtists = Spotify.getArtists(access_token, user.favArtists);

        const spotifyFavTracks = Spotify.getTracks(access_token, user.spotifyFavTracks);
        const spotifyFavArtists = Spotify.getArtists(access_token, user.spotifyFavArtists);

        const promises = await Promise.all([lastTracks, favTracks, favArtists, spotifyFavTracks, spotifyFavArtists]);
        console.timeEnd('spotify_me');

        return {
            user: {
                _id: user._id,
                name: user.name,
                isVerifed: user.isVerifed,
                photos: user.photos,
            },

            email: user.email,
          
            birthday: user.birthday,
            city: user.city,
            gender: user.gender,

            bio: user.bio,
            socialAccounts: user.socialAccounts,
        
            lastTracks: promises[0],
            favTracks: promises[1],
            favArtists: promises[2],
        
            spotifyFavTracks: promises[3],
            spotifyFavArtists: promises[4],

            permissions: user.permissions,
            notifications: user.notifications,

            filtering: user.filtering,

            product: user.product,
        };
       
    } catch(err) {
        throw err;
    } finally {
        console.timeEnd('getMyProfile');
    }
}

function isAdult(timestamp) {
    try {
        var birthday = new Date(timestamp);
        var ageDifMs = Date.now() - birthday.getTime();
        var ageDate = new Date(ageDifMs);
        var age = Math.abs(ageDate.getUTCFullYear() - 1970);
        if(!age) if(age < 18) return false;
       
        return true;
    } catch(err) {
        throw err;
    }
}

function calculatePercentage(commonArtistsLength, loggedSpotifyFavArtistsLength, targetSpotifyFavArtistsLength) {
    if(commonArtistsLength > 0) {
        const loggedPercentage = Math.trunc((100 / (loggedSpotifyFavArtistsLength / commonArtistsLength)));
        const targetPercentage = Math.trunc((100 / (targetSpotifyFavArtistsLength / commonArtistsLength)));

        return loggedPercentage >= targetPercentage ? loggedPercentage : targetPercentage;
    }

    return 0;
}
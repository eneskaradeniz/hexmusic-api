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

const Track = require('../models/TrackModel');
const Artist = require('../models/ArtistModel');

const _ = require("lodash");

const generateJwtToken = (user_id) => jwt.sign({ _id: user_id }, jwtConfig.secret);

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

            const code_grant = await Spotify.getAuthorizationCodeGrant(code);
            if(!code_grant) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }

            const { access_token, refresh_token } = code_grant;

            const spotify_id = await Spotify.getSpotifyId(access_token);
            if(!spotify_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }

            const user = await User.findOne({ spotify_id: spotify_id }).select('_id').lean();
            if(user) {
                // GELEN REFRESH TOKENI GÜNCELLE ÖYLE GİRİŞ YAPTIR.
                await updateSpotifyRefreshToken(user._id, refresh_token);

                // BÖYLE BİR KULLANICI VAR TOKEN OLUŞTUR VE PROFILI GETİR
                const token = generateJwtToken(user._id);
                const my_profile = await getMyProfile(user._id);

                return res.status(200).json({ 
                    success: true,

                    user_id: user._id,
                    token: token,
                    spotify_refresh_token: refresh_token,
                    user: my_profile,
                }); 
            } else {
                // BÖYLE BİR KULLANICI YOK KAYIT OL EKRANINA AKTAR
                const { spotify_fav_track_ids, spotify_fav_tracks } = await Spotify.getMyTopTracks(access_token);
                const { spotify_fav_artist_ids, spotify_fav_artists } = await Spotify.getMyTopArtists(access_token);

                return res.status(200).json({
                    success: true,

                    spotify_id: spotify_id,
                    spotify_refresh_token: refresh_token,

                    spotify_fav_track_ids: spotify_fav_track_ids,
                    spotify_fav_tracks: spotify_fav_tracks,
                    
                    spotify_fav_artist_ids: spotify_fav_artist_ids,
                    spotify_fav_artists: spotify_fav_artists,
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
        var avatars = [];

        const session = await db.startSession();
      
        try {
            req.files.forEach(file => avatars.push(file.id));

            const { spotify_id, spotify_refresh_token, spotify_fav_artists, spotify_fav_tracks, email, display_name, birthday, gender, bio, city, fav_tracks, fav_artists, language } = JSON.parse(req.body._body);
            if(!spotify_id || !spotify_refresh_token || !spotify_fav_artists || !spotify_fav_tracks || !email || !display_name || !birthday || !gender || !language) {
                FileController.deleteImages(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // ADULT VALIDATOR
            const _isAdult = isAdult(birthday);
            if(!_isAdult) {
                FileController.deleteImages(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            
            const userExists = await User.countDocuments({ spotify_id: spotify_id });
            if (userExists > 0) {
                FileController.deleteImages(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'ALREADY_REGISTER',
                });
            }

            const access_token = await Spotify.refreshAccessToken(spotify_refresh_token);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const all_tracks = uniq([...spotify_fav_tracks, ...fav_tracks]);
            const all_artists = uniq([...spotify_fav_artists, ...fav_artists]);

            var uniqueNames = [];
            $.each(names, function(i, el){
                if($.inArray(el, uniqueNames) === -1) uniqueNames.push(el);
            });

            console.log('all_tracks:', all_tracks.length);
            console.log('all_artists:', all_artists.length);

            // TRACKS

            const tracks = await Track.find({ _id: { $in: all_tracks }}).select('_id').lean();
            
            const track_ids = [];
            tracks.forEach(e => track_ids.push(e._id));

            const difference_track_ids = all_tracks.filter(x => !track_ids.includes(x));

            const track_chunks = _.chunk(difference_track_ids, 50);
            const track_promises = await Promise.all(track_chunks.map((ids) => {
                console.log(ids);
                return Spotify.getTracks(access_token, ids);
            }));

            console.log(track_promises);

            // ARTISTS

            const artists = await Artist.find({ _id: { $in: all_artists }}).select('_id').lean();
            
            const artist_ids = [];
            artists.forEach(e => artist_ids.push(e._id));

            const difference_artist_ids = all_artists.filter(x => !artist_ids.includes(x));

            const artist_chunks = _.chunk(difference_artist_ids, 50);
            const artist_promises = await Promise.all(artist_chunks.map((ids) => {
                return Spotify.getArtists(access_token, ids);
            }));

            // FINISH

            await session.withTransaction(async () => {
                return await Promise.all([
                    Track.create(difference_tracks, { session: session }),
                    Artist.create(difference_artists, { session: session }),
                ]);
            });

            const user_id = ObjectId();
            await User.create({
                _id: user_id,
                spotify_id: spotify_id,
                spotify_refresh_token: spotify_refresh_token,
                spotify_fav_artists: spotify_fav_artists,
                spotify_fav_tracks: spotify_fav_tracks,
                avatars,
                email,
                display_name: display_name,
                birthday,
                gender,
                bio,
                city,
                fav_tracks: fav_tracks,
                fav_artists: fav_artists,
                language
            });

            const token = generateJwtToken(user_id);
            const my_profile = await getMyProfile(user_id);

            return res.status(200).json({
                success: true,
                token,
                user_id: user_id,
                spotify_refresh_token: spotify_refresh_token,
                user: my_profile,
            });

        } catch (err) {
            FileController.deleteImages(avatars);

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
        } finally {
            session.endSession();
        }
    }
    
    // USER
    
    async me(req, res) {
        try{
            const logged_id = req._id;
            const user = await getMyProfile(logged_id);

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
            const logged_id = req._id;
            const target_id = req.params.user_id;
            if(!target_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // GEREKLI BİLGİLERİ ÇEK
            const results = await Promise.all([
                User.findById(logged_id).select('display_name avatars verified spotify_fav_tracks spotify_fav_artists').lean(),

                User.findById(target_id)
                .select('display_name avatars verified birthday city bio social_accounts last_tracks fav_tracks fav_artists spotify_fav_tracks spotify_fav_artists permissions')
                .populate('fav_tracks')
                .populate('fav_artists')
                .populate('last_tracks')
                .populate('spotify_fav_tracks')
                .populate('spotify_fav_artists')
                .lean()
            ]);

            const logged_profile = results[0];
            const target_profile = results[1];
            if(!target_profile) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_TARGET_USER',
                });
            }

            // PROFILE

            const profile = {
                user: {
                    _id: target_profile._id,
                    display_name: target_profile.display_name,
                    avatars: target_profile.avatars,
                    verified: target_profile.verified,
                },
              
                birthday: target_profile.permissions.show_age ? target_profile.birthday : null,
                city: target_profile.city,

                bio: target_profile.bio,
                social_accounts: target_profile.social_accounts,
                
                last_tracks: target_profile.permissions.show_last_tracks ? target_profile.last_tracks : null,
                fav_tracks: fav_tracks,
                fav_artists: fav_artists,
            }

            // COMMON

            const common_tracks = logged_profile.spotify_fav_tracks.filter(x => target_profile.spotify_fav_tracks.includes(x));
            const common_artists = logged_profile.spotify_fav_artists.filter(x => target_profile.spotify_fav_artists.includes(x));

            var percentage = calculatePercentage(common_artists.length, logged_profile.spotify_fav_artists.length, target_profile.spotify_fav_artists.length);

            const common = {
                common_tracks: common_tracks,
                common_artists: common_artists,
                percentage: percentage,
            }

            // MATCH

            var match;

            const lower_id = logged_id < target_id ? logged_id : target_id;
            const higher_id = logged_id > target_id ? logged_id : target_id;
            
            const find_match = await Match.findOne({ lower_id: lower_id, higher_id: higher_id })
            .populate('lower_track')
            .populate('higher_track')
            .lean();

            if(find_match) {
                const is_lower = logged_id === lower_id;

                const logged_user = {
                    _id: logged_profile._id,
                    display_name: logged_profile.display_name,
                    avatars: logged_profile.avatars,
                    verified: logged_profile.verified,
                };
                const target_user = {
                    _id: target_profile._id,
                    display_name: target_profile.display_name,
                    avatars: target_profile.avatars,
                    verified: target_profile.verified,
                };

                const logged_match_type = is_lower ? find_match.lower_match_type : find_match.higher_match_type;
                const target_match_type = is_lower ? find_match.higher_match_type : find_match.lower_match_type;

                const logged_like_type = is_lower ? find_match.lower_like_type : find_match.higher_like_type;
                const target_like_type = is_lower ? find_match.higher_like_type : find_match.lower_like_type;

                const logged_track = is_lower ? find_match.lower_track : find_match.higher_track;
                const target_track = is_lower ? find_match.higher_track : find_match.lower_track;
    
                match = {
                    logged_user,
                    logged_match_type,
                    logged_like_type,
                    logged_track,

                    target_user,
                    target_match_type,
                    target_like_type,
                    target_track
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
            const logged_id = req._id;

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
                const user = await User.findById(logged_id).select('avatars').lean();
                avatars = user.avatars;

                // USER I SİL
                await User.deleteOne(logged_id).session(session);

                // ENGELLEDİKLERİNİ SİL
                await BlockedUser.deleteMany({
                    $or: [{ from: logged_id }, { to: logged_id }]
                }).session(session);

                // LİKELARINI SİL
                await Like.deleteMany({
                    $or: [{ from: logged_id }, { to: logged_id }]
                }).session(session);

                // DİSLİKELARINI SİL
                await Dislike.deleteMany({
                    $or: [{ from: logged_id }, { to: logged_id }]
                }).session(session);

                // KULLANICININ TÜM EŞLEŞTİĞİ KULLANICILARIN IDLERINI GETİR (SOKETLERİNE İLİŞKİ BİTTİĞİNİ SÖYLEYECEK)
                const matches = await Match.find({
                    $or: [{ lower_id: logged_id }, { higher_id: logged_id }]
                }).select('chat_id higher_id lower_id').session(session).lean();

                var chat_ids = [];
                
                matches.forEach(match => {
                    chat_ids.push(match.chat_id);
                    
                    const is_lower = match.lowerId.toString() === logged_id;
                    users.push({ user_id: is_lower ? match.higher_id : match.lower_id, chat_id: match.chat_id });
                });

                // EŞLEŞMELERİNİ SİL
                await Match.deleteMany({
                    $or: [{ lower_id: logged_id }, { higher_id: logged_id }]
                }).session(session);

                // CHATLERİNİ SİL
                await Chat.deleteMany({
                    $or: [{ lower_id: logged_id }, { higher_id: logged_id }]
                }).session(session);

                // SİLİNEN CHATLERİN MESAJLARINI SİL
                await Message.deleteMany({
                    chat_id: { $in: chat_ids }
                }).session(session);
            });

            // TÜM FOTOĞRAFLARINI SİL
            FileController.deleteImages(photos);

            // EŞLEŞTİĞİ KULLANICILARIN SOKETLERİNE EŞLEŞME BİTTİĞİNİ SÖYLE
            users.forEach(model => {
                const find_user = shared.users.find(x => x.user_id === model.user_id.toString());
                if(find_user) {
                    find_user.socket.emit('end_user', {
                        user_id: model.user_id,
                        chat_id: model.chat_id,
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
            const logged_id = req._id;

            const results = await BlockedUser.find({ from: logged_id }).populate('to', 'display_name avatars verified').sort({ created_at: -1 }).lean();
    
            var users = [];
            for(let i = 0; i < results.length; i++) {
                const user = results[i];

                users.push({
                    _id: user._id,
                    user: user.to,
                    created_at: user.created_at,
                });
            }
           
            return res.status(200).json({
                success: true,
                users: users
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
            const logged_id = req._id;
            const target_id = req.params.user_id;
            if(!target_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
 
            // BÖYLE BİR EŞLEŞMENİN OLUP OLMADIĞINI KONTROL ET.
            const lower_id = logged_id < target_id ? logged_id : target_id;
            const higher_id = logged_id > target_id ? logged_id : target_id;

            const find_match = await Match.findOne({
                lower_id,
                higher_id
            })
            .select('_id chat_id')
            .lean();

            if(!find_match) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_MATCH',
                });
            }
   
            await session.withTransaction(async () => {
                // EŞLEŞME İLE ALAKALI HERŞEYİ SİL.
                await Chat.deleteOne({ _id: find_match.chat_id }).session(session);
                await Message.deleteMany({ chat_id: find_match.chat_id }).session(session);
                await Match.deleteOne({ _id: find_match._id }).session(session);
            });

            const find_target_user = shared.users.find(x => x.user_id === target_id);
            if(find_target_user) {
                find_target_user.socket.emit('end_user', {
                    user_id: logged_id,
                    chat_id: find_match.chat_id,
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
            const logged_id = req._id;
            const target_id = req.params.user_id;
            if(!target_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
 
            // BÖYLE BİR EŞLEŞMENİN OLUP OLMADIĞINI KONTROL ET.
            const lower_id = logged_id < target_id ? logged_id : target_id;
            const higher_id = logged_id > target_id ? logged_id : target_id;

            const find_match = await Match.findOne({
                lower_id,
                higher_id
            })
            .select('_id chat_id')
            .lean();
            
            if(!find_match) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_MATCH',
                });
            }
   
            await session.withTransaction(async () => {
                // EŞLEŞME İLE ALAKALI HERŞEYİ SİL.
                await Chat.deleteOne({ _id: find_match.chat_id }).session(session);
                await Message.deleteMany({ chatId: find_match.chat_id }).session(session);
                await Match.deleteOne({ _id: find_match._id }).session(session);

                // KULLANICIYI ENGELLE.
                await BlockedUser.create([{ from: logged_id, to: target_id }], { session: session });
            });

            const find_target_user = shared.users.find(x => x.user_id === target_id);
            if(find_target_user) {
                find_target_user.socket.emit('end_user', {
                    user_id: logged_id,
                    chat_id: find_match.chat_id,
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
            const logged_id = req._id;
            const target_id = req.params.user_id;
            if(!target_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR BLOK VARMI KONTROL ET.
            const find_block_user = await BlockedUser.findOne({ from: logged_id, to: target_id }).select('_id').lean();
            if(!find_block_user) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_BLOCK_USER',
                });
            }

            // ENGELİ KALDIR.
            await BlockedUser.deleteOne({ _id: find_block_user._id });  

            return res.status(200).json({
                success: true
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
   
    // AVATARS

    async add_avatar(req, res) {
        const image_id = req.file != null ? req.file.id : null;

        try {
            const logged_id = req._id;
            if(!image_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const logged_user = await User.findById(logged_id).select('avatars product').lean();
            if(logged_user.avatars.length >= 6) {
                return res.status(200).json({
                    success: false,
                    error: 'MAX_AVATARS_LIMIT',
                });
            }
            if(logged_user.product === 'free' && logged_user.avatars.length >= 3) {
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            // FOTOĞRAFI EKLE
            await User.updateOne({ _id: logged_id }, { $push: { photos: image_id } });

            return res.status(200).json({
                success: true,
                image_id: image_id
            });

        } catch(err) {
            FileController.deleteImageById(image_id);

            Error({
                file: 'UserController.js',
                method: 'add_avatar',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async update_avatars(req, res) {
        try {
            const logged_id = req._id;
            const { avatars } = req.body;
            if(!avatars) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { avatars });
 
            return res.status(200).json({
                success: true,
            });
        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'update_avatars',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async delete_avatar(req, res) {
        try {
            const logged_id = req._id;
            const image_id = req.params.image_id;
            if(!image_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const result = await FileController.deleteImageById(image_id);
            if(!result) {
                return res.status(400).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { $pull: { avatars: image_id } });

            return res.status(200).json({
                success: true,
            });

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'delete_avatar',
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
            const logged_id = req._id;
            const { email, display_name, birthday, gender, city, bio, social_accounts } = req.body;
            if(!email || !display_name || !birthday || !gender || !social_accounts) {
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
            
            await User.updateOne({ _id: logged_id }, {
                email: email,
                display_name: display_name,
                birthday: birthday,
                gender: gender,
                city: city,
                bio: bio,
                social_accounts: social_accounts,
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
            const logged_id = req._id;
            const { fcm_token } = req.body;
            if(!fcm_token) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            fcm_token.created_at = Date.now();
            await User.updateOne({ _id: logged_id }, { fcm_token: fcm_token });

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
            const logged_id = req._id;
            const { language } = req.body;
            if(!language) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { language: language });

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
            const logged_id = req._id;
            const { fav_tracks } = req.body;
            if(!fav_tracks) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { fav_tracks: fav_tracks });

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
            const logged_id = req._id;
            const { fav_artists } = req.body;
            if(!fav_artists) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { fav_artists });

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
            const logged_id = req._id;

            const user = await User.findById(logged_id).select('spotify_refresh_token').lean();
            const access_token = await Spotify.refreshAccessToken(user.spotify_refresh_token);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const my_top_tracks = await Spotify.getMyTopTracks(access_token);
            const my_top_artists = await Spotify.getMyTopArtists(access_token);

            await User.updateOne({ _id: logged_id }, {
                spotify_fav_tracks: my_top_tracks.spotify_fav_track_ids,
                spotify_fav_artists: my_top_artists.spotify_fav_artist_ids,
            });

            return res.status(200).json({
                success: true,
                spotify_fav_tracks: my_top_tracks.spotify_fav_tracks,
                spotify_fav_artists: my_top_artists.spotify_fav_artists,
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
            const logged_id = req._id;
            const { permissions } = req.body;
            if(!permissions) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { permissions });

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
            const logged_id = req._id;
            const { notifications } = req.body;
            if(!notifications) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            await User.updateOne({ _id: logged_id }, { notifications });

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
            const logged_id = req._id;
            const { filtering } = req.body;
            if(!filtering) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const user = await User.findById(logged_id).select('product').lean();
            if(user.product !== 'free') {
                await User.updateOne({ _id: logged_id }, { filtering });
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
            const query = req.params.q;
            const { refresh_token } = req.body;
            if(!query || !refresh_token) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const tracks = await Spotify.searchTracks(refresh_token, query);
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
            const query = req.params.q;
            const { refresh_token } = req.body;
            if(!query || !refresh_token) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const artists = await Spotify.searchArtists(refresh_token, query);
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
            const logged_id = req._id;

            // KULLANICININ EŞLEŞTİĞİ İNSANLARI ÇEK
            const matches = await Match.find({ $or: [{ lower_id: logged_id }, { higher_id: logged_id }]})
            .select('lower_id higher_id')
            .lean();

            // EŞLEŞTİĞİ KULLANICILARIN IDLERINI BİR LİSTEYE AKTAR
            var user_ids = [];
            matches.forEach(match => {
                const is_lower = match.lower_id.toString() === logged_id;
                user_ids.push(is_lower ? match.higher_id : match.lower_id);
            });

            // EŞLEŞTİĞİ İNSANLARIN EĞER PERMISSON.SHOW_ACTION OLANLARIN DİNLEDİĞİ MÜZİKLERİ GETİR.
            const results = await User.find({ 
                $and: [
                    { _id: { $in: user_ids }},
                    { "current_play.track": { $ne: null }},
                    { "permissions.show_action": true },
                ]
            })
            .select('display_name avatars verified current_play')
            .populate('current_play.track');

            // BU LİSTENİN İÇİNDEKİ MÜZİKLERİ ÇEK
            var users = [];

            for(let i = 0; i < results.length; i++) {
                const user = results[i];

                users.push({
                    user: {
                        _id: user._id,
                        display_name: user.display_name,
                        avatars: user.avatars,
                        verified: user.verified,
                    },
                    track: user.current_play.track,
                    is_playing: user.current_play.is_playing,
                    timestamp: user.current_play.timestamp,
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

    async user_last_tracks(req, res) {
        try {
            const logged_id = req._id;
            const user = await User.findById(logged_id).select('last_tracks').populate('last_tracks').lean();

            return res.status(200).json({
                success: true,
                tracks: user.last_tracks,
            }); 

        } catch(err) {
            Error({
                file: 'UserController.js',
                method: 'user_last_tracks',
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

async function updateSpotifyRefreshToken(logged_id, refresh_token) {
    try {
        await User.updateOne({ _id: logged_id }, { spotify_refresh_token: refresh_token });
    } catch(err) {
        throw err;
    }
}

async function getMyProfile(logged_id) {
    console.time('getMyProfile');
    try {
        console.time('fetch_user');
        const user = await User.findById(logged_id)
        .select('email display_name avatars verified birthday city bio gender social_accounts last_tracks fav_tracks fav_artists permissions notifications filtering product spotify_fav_tracks spotify_fav_artists')
        .populate('last_tracks')
        .populate('fav_tracks')
        .populate('fav_artists')
        .populate('spotify_fav_tracks')
        .populate('spotify_fav_artists')
        .lean();
        console.timeEnd('fetch_user');

        return {
            user: {
                _id: user._id,
                display_name: user.display_name,
                avatars: user.avatars,
                verified: user.verified,
            },

            email: user.email,
          
            birthday: user.birthday,
            city: user.city,
            gender: user.gender,

            bio: user.bio,
            social_accounts: user.social_accounts,
        
            last_tracks: user.last_tracks,
            fav_tracks: user.fav_tracks,
            fav_artists: user.fav_artists,
        
            spotify_fav_tracks: user.spotify_fav_tracks,
            spotify_fav_artists: user.spotify_fav_artists,

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

function calculatePercentage(common_artists_length, logged_spotify_fav_artists_length, target_spotify_fav_artists_length) {
    if(common_artists_length > 0) {
        const logged_percentage = Math.trunc((100 / (logged_spotify_fav_artists_length / common_artists_length)));
        const target_percentage = Math.trunc((100 / (target_spotify_fav_artists_length / common_artists_length)));

        return logged_percentage >= target_percentage ? logged_percentage : target_percentage;
    }

    return 0;
}

function uniq(a) {
    var seen = {};
    return a.filter(function(item) {
        return seen.hasOwnProperty(item) ? false : (seen[item] = true);
    });
}
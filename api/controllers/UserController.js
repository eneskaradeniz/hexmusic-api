require('dotenv').config();

const db = require('mongoose');

const ObjectId = require('mongoose').Types.ObjectId;
const jwt = require('jsonwebtoken');

const User = require('../models/UserModel');
const BlockedUser = require('../models/BlockedUserModel');
const Match = require('../models/MatchModel');
const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const Like = require('../models/LikeModel');
const Dislike = require('../models/DislikeModel');

const SpotifyAPI = require('../shared/SpotifyAPI').getInstance();
const SocketIO = require('../shared/SocketIO').getInstance();

const FileController = require('../controllers/FileController');

const Error = require('./ErrorController');

const lodash = require('lodash');

const generateJwtToken = (user_id) => jwt.sign({ _id: user_id }, process.env.JWT_SECRET);

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

            if(SpotifyAPI != null) {
                console.log("api var");
            } else {
                console.log("api yok");
            }

            console.time('getAuthorizationCodeGrant');
            const code_grant = await SpotifyAPI.getAuthorizationCodeGrant(code);
            console.timeEnd('getAuthorizationCodeGrant');
            
            console.log(code_grant);
            if(!code_grant) {

                console.log("kod geçersiz");
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }

            console.log("devam keee");
            
            const { access_token, refresh_token } = code_grant;

            console.log(code_grant);

            console.time('getSpotifyId');
            const spotify_id = await SpotifyAPI.getSpotifyId(access_token);
            console.timeEnd('getSpotifyId');
            if(!spotify_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_CODE',
                });
            }
           
            console.time('findUser');
            const user = await User.findOne({ spotify_id: spotify_id }).select('_id').lean();
            console.timeEnd('findUser');

            if(user) {
                console.time('profile_and_update');
                const promises = await Promise.all([
                    updateSpotifyRefreshToken(user._id, refresh_token),
                    getMyProfile(user._id),
                ]);
                console.timeEnd('profile_and_update');

                const token = generateJwtToken(user._id);
                const my_profile = promises[1];

                return res.status(200).json({ 
                    success: true,

                    user_id: user._id,
                    token: token,
                    spotify_refresh_token: refresh_token,
                    user: my_profile,
                }); 
            } else {
                return res.status(200).json({
                    success: true,
                    spotify_id: spotify_id,
                    spotify_refresh_token: refresh_token,
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
        session.startTransaction();
      
        try {
            if(req.files) req.files.forEach(file => avatars.push(file.id));
                   
            const { spotify_id, spotify_refresh_token, email, display_name, birthday, gender, bio, city, language } = req.body._body ? JSON.parse(req.body._body) : {};
            if(!spotify_id || !spotify_refresh_token || !email || !display_name || !birthday || !gender || !language) {
                FileController.deleteAvatars(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const age = calculateAge(birthday);
            if(!age || age < 18) {
                FileController.deleteAvatars(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }
            
            const user_exists = await User.countDocuments({ spotify_id: spotify_id });
            if (user_exists > 0) {
                FileController.deleteAvatars(avatars);
                return res.status(200).json({
                    success: false,
                    error: 'ALREADY_REGISTER',
                });
            }

            const access_token = await SpotifyAPI.refreshAccessToken(spotify_refresh_token);
            if(!access_token) {
                FileController.deleteAvatars(avatars);
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const promises = await Promise.all([
                SpotifyAPI.getMyTopTracks(access_token),
                SpotifyAPI.getMyTopArtists(access_token),
            ]);

            const { spotify_fav_tracks, fav_tracks } = promises[0];
            const { spotify_fav_artists, fav_artists } = promises[1];

            const user_id = ObjectId();

            await User.create([{
                _id: user_id,
                spotify_id,
                spotify_refresh_token,
                spotify_fav_tracks,
                spotify_fav_artists,
                fav_tracks,
                fav_artists,
                avatars,
                email,
                display_name,
                birthday,
                age,
                gender,
                bio,
                city,
                language
            }], { session: session });

            await session.commitTransaction();

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
            await session.abortTransaction();

            FileController.deleteAvatars(avatars);

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

            var avatars = [];
            var users = [];
            
            await session.withTransaction(async () => {
                // KULLANICININ FOTOĞRAFLARINI ÇEK
                const user = await User.findById(logged_id).select('avatars').lean();
                avatars = user.avatars;

                await Promise.all([
                    User.deleteOne({ _id: logged_id }).session(session),
                    BlockedUser.deleteMany({ $or: [{ from: logged_id }, { to: logged_id }]}).session(session),
                    Like.deleteMany({ $or: [{ from: logged_id }, { to: logged_id }] }).session(session),
                    Dislike.deleteMany({ $or: [{ from: logged_id }, { to: logged_id }] }).session(session),
                ]);

                // KULLANICININ TÜM EŞLEŞTİĞİ KULLANICILARIN IDLERINI GETİR (SOKETLERİNE İLİŞKİ BİTTİĞİNİ SÖYLEYECEK)
                const matches = await Match.find({
                    $or: [{ lower_id: logged_id }, { higher_id: logged_id }]
                }).select('chat_id higher_id lower_id').session(session).lean();

                matches.forEach(match => {
                    const is_lower = match.lower_id.toString() === logged_id;
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
            });

            // TÜM FOTOĞRAFLARINI SİL
            FileController.deleteAvatars(avatars);

            // EŞLEŞTİĞİ KULLANICILARIN SOKETLERİNE EŞLEŞME BİTTİĞİNİ SÖYLE
            users.forEach(model => {
                const find_socket = SocketIO.findSocket(model.user_id.toString());
                if(find_socket) {
                    find_socket.emit('end_user', {
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
    
    // PROFILE
    
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

            const lower_id = logged_id < target_id ? logged_id : target_id;
            const higher_id = logged_id > target_id ? logged_id : target_id;

            // GEREKLI BİLGİLERİ ÇEK
            const results = await Promise.all([
                User.findById(logged_id)
                .select('display_name avatars verified spotify_fav_tracks spotify_fav_artists')
                .lean(),

                User.findById(target_id)
                .select('display_name avatars verified birthday city bio social_accounts last_tracks fav_tracks fav_artists spotify_fav_tracks spotify_fav_artists permissions')
                .lean(),

                Match.findOne({ lower_id, higher_id })
                .lean(),
            ]);

            const logged_profile = results[0];
            const target_profile = results[1];
            const find_match = results[2];

            if(!target_profile) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_TARGET_USER',
                });
            }

            // FETCH TRACKS AND ARTISTS

            var match_track_ids = [];
            if(find_match) {
                if(find_match.lower_track_id) match_track_ids.push(find_match.lower_track_id);
                if(find_match.higher_track_id) match_track_ids.push(find_match.higher_track_id);
            }

            const common_track_ids = logged_profile.spotify_fav_tracks.filter(x => target_profile.spotify_fav_tracks.includes(x));
            const common_artist_ids = logged_profile.spotify_fav_artists.filter(x => target_profile.spotify_fav_artists.includes(x));

            const track_ids = lodash.uniq([...target_profile.last_tracks, ...target_profile.fav_tracks, ...common_track_ids, ...match_track_ids]);
            const artist_ids = lodash.uniq([...target_profile.fav_artists, ...common_artist_ids]);

            await SpotifyAPI.getAccessToken();

            const promises = await Promise.all([
                SpotifyAPI.getTracks(track_ids),
                SpotifyAPI.getArtists(artist_ids)
            ]);

            const tracks = promises[0];
            const artists = promises[1];

            // PROFILE

            const last_tracks = target_profile.last_tracks.map(x => tracks.find(track => track.id === x));
            const fav_tracks = target_profile.fav_tracks.map(x => tracks.find(track => track.id === x));
            const fav_artists = target_profile.fav_artists.map(x => artists.find(artist => artist.id === x));

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
                
                last_tracks: target_profile.permissions.show_last_tracks ? last_tracks : null,
                fav_tracks: fav_tracks,
                fav_artists: fav_artists,
            }

            // COMMON

            const common_tracks = common_track_ids.map(x => tracks.find(track => track.id === x));
            const common_artists = common_artist_ids.map(x => artists.find(artist => artist.id === x));

            const percentage = calculatePercentage(common_artists.length, logged_profile.spotify_fav_artists.length, target_profile.spotify_fav_artists.length);

            const common = {
                common_tracks: common_tracks,
                common_artists: common_artists,
                percentage: percentage
            };

            // MATCH

            var match;

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

                const logged_track = tracks.find(x => x.id === (is_lower ? find_match.lower_track_id : find_match.higher_track_id));
                const target_track = tracks.find(x => x.id === (is_lower ? find_match.higher_track_id : find_match.lower_track_id));

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
                lower_id: lower_id,
                higher_id: higher_id,
            })
            .select('chat_id')
            .lean();

            if(find_match === null) {
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

            const find_target_socket = SocketIO.findSocket(target_id);
            if(find_target_socket) {
                find_target_socket.emit('end_user', {
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
            .select('chat_id')
            .lean();
            
            if(find_match === null) {
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

                // İKİ KULLANICININ DA BLOCKED/MY_BLOCKED KISIMLARINI AYARLA
                await User.updateOne({ _id: logged_id }, { $push: { my_blocked: target_id } }).session(session);
                await User.updateOne({ _id: target_id }, { $push: { blocked: logged_id } }).session(session);
            });

            const find_target_socket = SocketIO.findSocket(target_id);
            if(find_target_socket) {
                find_target_socket.emit('end_user', {
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

            // BÖYLE BİR BLOK VARMI KONTROL ET
            const find_block_user = await BlockedUser.findOne({ from: logged_id, to: target_id }).select('_id').lean();
            if(!find_block_user) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_BLOCK_USER',
                });
            }

            await session.withTransaction(async () => {
                // ENGELİ KALDIR
                await BlockedUser.deleteOne({ _id: find_block_user._id }).session(session);  

                // İKİ KULLANICININ DA BLOCKED/MY_BLOCKED KISIMLARINI AYARLA
                await User.updateOne({ _id: logged_id }, { $pull: { my_blocked: target_id } }).session(session);
                await User.updateOne({ _id: target_id }, { $pull: { blocked: logged_id } }).session(session);
            });

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
        } finally {
            session.endSession();
        }
    }
   
    // AVATARS

    async add_avatar(req, res) {
        const image_id = req.file != null ? req.file.filename : null;

        try {
            const logged_id = req._id;
            if(!image_id) {
                FileController.deleteAvatar(image_id);
                
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            const logged_user = await User.findById(logged_id).select('avatars product').lean();
            if(logged_user.avatars.length >= 6) {
                FileController.deleteAvatar(image_id);
                
                return res.status(200).json({
                    success: false,
                    error: 'MAX_AVATARS_LIMIT',
                });
            }
            if(logged_user.product.id === 0 && logged_user.avatars.length >= 3) {
                FileController.deleteAvatar(image_id);
                
                return res.status(200).json({
                    success: false,
                    error: 'NO_PERMISSION',
                });
            }

            // FOTOĞRAFI EKLE
            await User.updateOne({ _id: logged_id }, { $push: { avatars: image_id } });

            return res.status(200).json({
                success: true,
                image_id: image_id
            });

        } catch(err) {
            FileController.deleteAvatar(image_id);

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

            const result = await FileController.deleteAvatar(image_id);
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
            const age = calculateAge(birthday);
            if(!age || age < 18) {
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

    async update_spotify_favorites(req, res) {
        try {
            const logged_id = req._id;

            const user = await User.findById(logged_id).select('spotify_refresh_token').lean();
            const access_token = await SpotifyAPI.refreshAccessToken(user.spotify_refresh_token);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const promises = await Promise.all([
                SpotifyAPI.getMyTopTracks(access_token),
                SpotifyAPI.getMyTopArtists(access_token)
            ]);

            const { spotify_fav_tracks, fav_tracks } = promises[0];
            const { spotify_fav_artists, fav_artists } = promises[1];

            await User.updateOne({ _id: logged_id }, {
                spotify_fav_tracks,
                spotify_fav_artists,
            });

            return res.status(200).json({
                success: true
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
            if(user.product.id !== 0) {
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

    // OTHER

    async action(req, res) {
        try {
            const logged_id = req._id;

            // KULLANICININ EŞLEŞTİĞİ İNSANLARI ÇEK
            const matches = await Match.find({ $or: [{ lower_id: logged_id }, { higher_id: logged_id }]})
            .select('lower_id higher_id')
            .lean();

            // EŞLEŞTİĞİ KULLANICILARIN IDLERINI BİR LİSTEYE AKTAR
            var user_ids = matches.map(match => {
                const is_lower = match.lower_id.toString() === logged_id;
                return is_lower ? match.higher_id : match.lower_id;
            });

            // EŞLEŞTİĞİ İNSANLARIN EĞER PERMISSON.SHOW_ACTION OLANLARIN DİNLEDİĞİ MÜZİKLERİ GETİR.
            const results = await User.find({ 
                $and: [
                    { _id: { $in: user_ids }},
                    { "current_play.track": { $ne: null }},
                    { "permissions.show_action": true },
                ]
            })
            .select('display_name avatars verified current_play');

            // GELEN MÜZİKLERİN BİLGİLERİNİ ÇEK
            await SpotifyAPI.getAccessToken();

            const track_ids = lodash.uniq(results.map(user => user.current_play.track));
            const tracks = await SpotifyAPI.getTracks(track_ids);

            // FRONTENDIN ANLAYACAĞI ŞEKİLDE AYARLA
            var users = results.map(user => {
                const track = tracks.find(x => x.id === user.current_play.track);

                return {
                    user: {
                        _id: user._id,
                        display_name: user.display_name,
                        avatars: user.avatars,
                        verified: user.verified,
                    },
                    track: track,
                    is_playing: user.current_play.is_playing,
                    timestamp: user.current_play.timestamp
                };
            });

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
            const user = await User.findById(logged_id).select('last_tracks').lean();

            await SpotifyAPI.getAccessToken();

            const last_tracks = await SpotifyAPI.getTracks(user.last_tracks);

            return res.status(200).json({
                success: true,
                tracks: last_tracks,
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
    try {
        const user = await User.findById(logged_id)
        .select('email display_name avatars verified birthday city bio gender social_accounts last_tracks fav_tracks fav_artists permissions notifications filtering product')
        .lean();

        const track_ids = lodash.uniq([...user.last_tracks, ...user.fav_tracks]);
        const artist_ids = user.fav_artists;

        await SpotifyAPI.getAccessToken();

        const promises = await Promise.all([
            SpotifyAPI.getTracks(track_ids),
            SpotifyAPI.getArtists(artist_ids)
        ]);

        const tracks = promises[0];

        var last_tracks = [];
        var fav_tracks = [];
        var fav_artists = promises[1];

        user.last_tracks.forEach((id) => last_tracks.push(tracks.find(x => x.id === id)));
        user.fav_tracks.forEach((id) => fav_tracks.push(tracks.find(x => x.id === id)));

        return {
            user: {
                _id: user._id,
                display_name: user.display_name,
                avatars: user.avatars,
                verified: user.verified,
            },

            email: user.email,
          
            birthday: user.birthday,
            gender: user.gender,

            bio: user.bio,
            social_accounts: user.social_accounts,
            city: user.city,
        
            last_tracks: last_tracks,
            fav_tracks: fav_tracks,
            fav_artists: fav_artists,

            permissions: user.permissions,
            notifications: user.notifications,

            filtering: user.filtering,
            product: user.product,
        };
       
    } catch(err) {
        throw err;
    }
}

function calculateAge(timestamp) {
    try {
        var birthday = new Date(timestamp);
        var ageDifMs = Date.now() - birthday.getTime();
        var ageDate = new Date(ageDifMs);
        var age = Math.abs(ageDate.getUTCFullYear() - 1970);
        return age;
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
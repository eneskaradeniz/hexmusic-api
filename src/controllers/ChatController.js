const db = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const User = require('../models/UserModel');

const PushNotification = require('../controllers/PushNotificationController');
const shared = require('../shared/index');

const Language = require('../utils/Language');

const Error = require('./ErrorController');

class ChatController {

    // CHAT

    async chat_list(req, res) {
        try {
            const logged_id = req._id;

            // KULLANICININ TÜM CHATLERİNİ ÇEK.
            const result = await Chat.find({
                $or: [{ lower_id: logged_id }, { higher_id: logged_id }],
            }) 
            .populate('lower_id', 'display_name avatars verified')
            .populate('higher_id', 'display_name avatars verified')
            .lean();

            var chats = [];

            // FRONTENDIN OKUYACAĞI ŞEKİLDE CHATLERİ OLUŞTUR.
            result.forEach(chat => {
                let is_lower = logged_id.toString() === chat.lower_id._id.toString();

                chats.push({
                    _id: chat._id,
                    user: is_lower ? chat.higher_id : chat.lower_id,
                    last_message: chat.last_message,
                    read: is_lower ? chat.lower_read : chat.higher_read,
                    created_at: chat.created_at
                });
            });

            return res.status(200).json({
                success: true,
                chats,
            });
        } catch (err) {
            Error({
                file: 'ChatController.js',
                method: 'chat_list',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async message_list(req, res) {
        try {
            const chat_id = req.params.chat_id;
            if(!chat_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // CHATIN DOĞRULUĞUNU KONTROL ET.
            const result = await findChat({ chat_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // TÜM MESAJLARIN LİSTESİNİ ÇEK.
            const messages = await Message.find({ chat_id }).populate('reply', 'from message type').sort({ created_at: -1 }).lean();

            return res.status(200).json({
                success: true,
                messages
            });
        } catch (err) {
            Error({
                file: 'ChatController.js',
                method: 'message_list',
                title: err.toString(),
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async send_message (req, res) {
        const session = await db.startSession();

        try {
            const chat_id = req.params.chat_id;
            const from = req._id;
            const { message, type, to, reply_id } = req.body;
            if(chat_id === null || from === null || message === null || type === null || to === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET.
            const lower_id = from < to ? from : to;
            const higher_id = from > to ? from : to;

            const is_lower = lower_id === from;

            const result = await findChat({ chat_id, lower_id, higher_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // MESAJIN TİPİNE GÖRE İŞLEM YAP.
            var _message;

            switch(type) {
                case 'text':
                    _message = message;
                    break;
                case 'track':
                    _message = JSON.stringify(message);
                    break;
                case 'artist':
                    _message = JSON.stringify(message);
                    break;
                case 'podcast':
                    _message = JSON.stringify(message);
                    break;
                default:
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_MESSAGE_TYPE',
                    });
            }

            // REPLY VARSA DOĞRULUĞUNU KONTROL ET VE BİLGİLERİNİ AL
            if(reply_id) {
                const find_reply_message = await Message.findById(reply_id).select('chat_id').lean();
                if(!find_reply_message) {
                    return res.status(200).json({
                        success: false,
                        error: 'NOT_FOUND_REPLY_MESSAGE',
                    });
                }

                // BU CHATIN MESAJI OLUP OLMADIĞINA BAK.
                if(find_reply_message.chat_id.toString() !== chat_id) {
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_REPLY_MESSAGE',
                    });
                }
            }

            // BU BİLGİLERİ KULLANARAK MESAJI GÖNDER.
            var new_message;
            var update_chat;

            await session.withTransaction(async () => {

                // MESAJI OLUŞTUR
                const message_id = ObjectId();
                await Message.create([{
                    _id: message_id,
                    chat_id,
                    from,
                    message: _message,
                    type,
                    reply: reply_id,
                }], { session: session });

                // MESAJI GETİR
                new_message = await Message.findById(message_id).populate('reply', 'from message type').session(session).lean();

                // CHATI GÜNCELLE
                await Chat.updateOne({ _id: chat_id }, {
                    last_message: {
                        _id: new_message._id,
                        message: new_message.message,
                        type: new_message.type,
                        from: new_message.from,
                        created_at: new_message.created_at,
                    },
                    lower_read: is_lower ? true : false,
                    higher_read: is_lower ? false : true,
                }).session(session);

                // CHATI ÇEK
                update_chat = await Chat.findById(chat_id)
                    .populate('lower_id', 'display_name avatars verified')
                    .populate('higher_id', 'display_name avatars verified')
                    .session(session)
                    .lean();
            });

            // İKİ KULLANICI İÇİN CHATI FRONT END İÇİN OLUŞTUR.
            const { lower_chat, higher_chat } = generateChats(update_chat);

            // TARGETIN SOKETİNİ BUL VE MESAJI VE CHATI GÖNDER.
            emitReceiveMessage({
                to,
                message: new_message,
                chat: is_lower ? higher_chat : lower_chat
            });

            // TARGET A BİLDİRİM GÖNDER
            pushMessageNotification({
                from,
                to,
                chat_id: chat_id,
                message: _message,
                message_type: type
            }); 

            return res.status(200).json({
                success: true,
                message: new_message,
                chat: is_lower ? lower_chat : higher_chat,
            });
        } catch (err) {
            Error({
                file: 'ChatController.js',
                method: 'send_message',
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

    async like_message (req, res) {
        const session = await db.startSession();
        
        try {
            const from = req._id;
            const message_id = req.params.message_id;
            const { chat_id, like, to } = req.body;
            if(from === null || message_id === null || chat_id === null || like === null || to === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const lower_id = from < to ? from : to;
            const higher_id = from > to ? from : to;

            const is_lower = from === lower_id;

            const result = await findChat({ chat_id, lower_id, higher_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            var _lower_chat;
            var _higher_chat;

            var update_message;

            const transactionResults = await session.withTransaction(async () => {
                // BÖYLE BİR MESAJ VARMI KONTROL ET
                const find_message = await Message.countDocuments({ _id: message_id });
                if(find_message <= 0) return;

                // MESAJI GÜNCELLE
                update_message = await Message.findByIdAndUpdate(message_id, { like: like }, { new: true, upsert: true }).populate('reply', 'from message type').session(session).lean();
        
                if(like) {
                    // CHATI GÜNCELLE
                    const update_chat = await Chat.findByIdAndUpdate(update_message.chat_id, {
                        last_message: {
                            _id: update_message._id,
                            message: update_message.message,
                            type: 'like',
                            from: is_lower ? lower_id : higher_id,
                            created_at: Date.now(),
                        },
                        lower_read: is_lower ? true : false,
                        higher_read: is_lower ? false : true,
                    }, { new: true, upsert: true })
                    .populate('lower_id', 'display_name avatars verified')
                    .populate('higher_id', 'display_name avatars verified')
                    .session(session)
                    .lean();

                    // İKİ KULLANICI İÇİN CHATI FRONT END İÇİN OLUŞTUR.
                    const { lower_chat, higher_chat } = generateChats(update_chat);
                    _lower_chat = lower_chat;
                    _higher_chat = higher_chat;
                }
            });
        
            if(transactionResults) {
                // TARGETIN SOKETİNİ BUL VE MESAJI VE CHATI GÖNDER.
                emitLikeMessage({
                    to,
                    message: update_message,
                    chat: is_lower ? _higher_chat : _lower_chat
                });

                // TARGET A BİLDİRİM GÖNDER
                if(like) {
                    pushLikeNotification({
                        from,
                        to,
                        chat_id
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: update_message,
                    chat: is_lower ? _lower_chat : _higher_chat,
                });
            } else {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_MESSAGE'
                });
            }

        } catch(err) {
            Error({
                file: 'ChatController.js',
                method: 'like_message',
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

    async read_messages(req, res) {
        const session = await db.startSession();

        try {
            const from = req._id;
            const chat_id = req.params.chat_id;
            const { to } = req.body;
            if(from === null || chat_id  === null || to  === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            } 
          
            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET.
            const lower_id = from < to ? from : to;
            const higher_id = from > to ? from : to;

            const is_lower = from === lower_id;

            const result = await findChat({ chat_id, lower_id, higher_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            await session.withTransaction(async () => {
                // OKUNMAMIŞ TÜM MESAJLARIN READINI TRUE YAP
                await Message.updateMany({ 
                    chat_id: chat_id,
                    from: { $ne: from },
                    read: false,
                }, { $set: { read: true } }).session(session);

                // CHATI GÜNCELLE
                if(is_lower) {
                    await Chat.updateOne({ _id: chat_id }, {
                        lower_read: true,
                    }, { session: session });
                } else {
                    await Chat.findByIdAndUpdate({ _id: chat_id }, {
                        higher_read: true,
                    }, { session: session });
                }
            });

            // TARGETIN SOKETİNİ BUL VE MESAJLARININ OKUNDUĞUNU SÖYLE
            emitReadMessages({
                to,
                chat_id
            });

            return res.status(200).json({
                success: true
            });
        } catch(err) {
            Error({
                file: 'ChatController.js',
                method: 'read_messages',
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

module.exports = new ChatController();

// UTILS

function generateChats(chat) {
    try {
        const lower_chat = {
            _id: chat._id,
            user: chat.higher_id,
    
            last_message: chat.last_message,
    
            read: chat.lower_read,
            created_at: chat.created_at,
        };
    
        const higher_chat = {
            _id:  chat._id,
            user: chat.lower_id,
    
            last_message: chat.last_message,
    
            read: chat.higher_read,
            created_at: chat.created_at,
        };
        
        return { lower_chat, higher_chat };
    } catch(err) {
        throw err;
    }
}

async function findChat({ chat_id, lower_id, higher_id }) {
    try {
        if(lower_id && higher_id) {
            const find_chat = await Chat.findOne({ lower_id: lower_id, higher_id: higher_id }).select('_id').lean();
            if(!find_chat) return false;
            if(find_chat._id.toString() !== chat_id.toString()) return false;
        } else if (chat_id) {
            const chatExists = await Chat.countDocuments({ _id: chat_id });
            if(chatExists <= 0) return false;
        } else {
            return false;
        }
        
        return true;
    } catch (err) {
        throw err;
    }
}

function emitReceiveMessage({ to, message, chat }) {
    try {
        const find_user = shared.users.find(x => x.user_id === to);
        if(find_user) {
            find_user.socket.emit('receive_message', {
                message: message,
                chat: chat,
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitLikeMessage({ to, message, chat }) {
    try {
        const find_user = shared.users.find(x => x.user_id === to);
        if(find_user) {
            find_user.socket.emit('like_message', {
                message: message,
                chat: chat,
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitReadMessages({ to, chat_id }) {
    try {
        const find_user = shared.users.find(x => x.user_id === to);
        if(find_user) {
            find_user.socket.emit('read_messages', { chat_id });
        }
    } catch (err) {
        console.log(err);
    }
}

async function pushMessageNotification({ from, to, chat_id, message, message_type }) {
    try {
        const results = await Promise.all([
            User.findById(to).select('fcm_token notifications language').lean(),
            User.findById(from).select('display_name avatars verified').lean(),
        ]);

        const to_user = results[0];
        const from_user = results[1];

        if (to_user && to_user.fcm_token && from_user) {
            if(to_user.notifications.text_messages) {
            
                var body;
                var translate;
                switch(message_type) {
                    case 'text':
                        body = message;
                        break;
                    case 'track':
                        const track = JSON.parse(message);
                        translate = Language.translate({ key: "track_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": track.artists[0],
                            "%trackName": track.name,
                        };
                        
                        body = translate.replace(/%name|%artistName|%trackName/gi, function(matched) { return mapObj[matched]; });
                        break;
                    case 'artist':
                        const artist = JSON.parse(message);
                        translate = Language.translate({ key: "artist_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": artist.name,
                        };
                        
                        body = translate.replace(/%name|%artistName/gi, function(matched) { return mapObj[matched]; });
                        break;
                    case 'podcast':
                        const podcast = JSON.parse(message);
                        translate = Language.translate({ key: "track_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": podcast.artists[0],
                            "%trackName": podcast.name,
                        };
                        
                        body = translate.replace(/%name|%artistName|%trackName/gi, function(matched) { return mapObj[matched]; });
                        break;
                }

                // VERİYİ GÖNDER
                const chat = {
                    chat_id,
                    to,
                    user: from_user
                };

                await PushNotification.send({
                    title: from_user.display_name,
                    body: body,
                    fcm_token: to_user.fcm_token.token,
                    data: { chat: chat },
                    channel_id: 'chat',
                    notification_type: 'CHAT',
                });
            }  
        }
    } catch (err) {
        Error({
            file: 'ChatController.js',
            method: 'pushMessageNotification',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
} 

async function pushLikeNotification({ from, to, chat_id }) {
    try {
        const results = await Promise.all([
            User.findById(to).select('fcm_token notifications language').lean(),
            User.findById(from).select('display_name avatars verified').lean(),
        ]);

        const to_user = results[0];
        const from_user = results[1];

        if (to_user && to_user.fcm_token) {
            if(to_user.notifications.like_messages) {
                // VERİYİ GÖNDER
                const chat = {
                    chat_id,
                    to: to,
                    user: from_user
                };

                // MESAJI DİLİNE GÖRE ÇEVİR.
                const body = Language.translate({ key: 'like_message', lang: to_user.language });

                await PushNotification.send({
                    title: from_user.display_name,
                    body: body,
                    fcm_token: to_user.fcm_token.token,
                    data: { chat: chat },
                    channel_id: 'chat',
                    notification_type: 'CHAT',
                });
            }  
        }
    } catch (err) {
        Error({
            file: 'ChatController.js',
            method: 'pushLikeNotification',
            title: err.toString(),
            info: err,
            type: 'critical',
        });
    }
} 
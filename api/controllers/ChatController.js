const db = require('mongoose');

const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const User = require('../models/UserModel');

const FirebaseAdmin = require('../firebase/FirebaseAdmin');
const SocketController = require('../shared/SocketController');

const Language = require('../lang/Language');

const Error = require('./ErrorController');

const PAGE_SIZE = 20;

class ChatController {

    // CHAT

    async chat_list(req, res) {
        try {
            const logged_id = req._id;

            const result = await Chat.find({ $or: [{ lower_id: logged_id }, { higher_id: logged_id }] })
            .populate('lower_id', 'display_name avatars verified')
            .populate('higher_id', 'display_name avatars verified')
            .lean();

            var chats = [];

            result.forEach(chat => {
                const is_lower = logged_id.toString() === chat.lower_id._id.toString();

                chats.push({
                    _id: chat._id,
                    user: is_lower ? chat.higher_id : chat.lower_id,
                    last_message: chat.last_message,
                    read: is_lower ? chat.lower_read : chat.higher_read,
                    is_mega_like: chat.is_mega_like,
                    created_at: chat.created_at
                });
            });

            return res.status(200).json({
                success: true,
                chats
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
            const logged_id = req._id;
            const chat_id = req.params.chat_id;
            const page = parseInt(req.query.page);
            if(!chat_id || !page) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const find_chat = await Chat.findOne({ _id: chat_id }).select('lower_id higher_id').lean();
            if(!find_chat || (find_chat.lower_id.toString() !== logged_id.toString() && find_chat.higher_id.toString() !== logged_id.toString())) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // CHATIN MESAJLARINI ÇEK
            const messages = await Message.find({ chat_id: chat_id }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();

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

    async send_message(req, res) {
        const session = await db.startSession();

        try {
            const author_id = req._id;
            const chat_id = req.params.chat_id;
            const { message, type, reply, to } = req.body;
            if(chat_id === null || message === null || type === null || to === null || to === author_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS'
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const lower_id = author_id < to ? author_id : to;
            const higher_id = author_id > to ? author_id : to;

            const is_lower = lower_id === author_id;

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

            var new_message;
            await session.withTransaction(async () => {
                const created_at = Date.now();
                const promises = await Promise.all([
                    // MESAJI OLUŞTUR
                    Message.create([{
                        chat_id,
                        author_id,
                        message: _message,
                        type,
                        reply,
                        created_at
                    }], { session: session }),

                    // CHATİ GÜNCELLE
                    Chat.updateOne({ _id: chat_id, lower_id, higher_id }, {
                        last_message: {
                            author_id,
                            message: _message,
                            type,
                            created_at
                        },
                        lower_read: is_lower ? true : false,
                        higher_read: is_lower ? false : true
                    }).session(session),
                ]);

                new_message = promises[0];
            });

            emitReceiveMessage({ to, chat_id, message: new_message });
            pushMessageNotification({ author_id, to, chat_id, message, message_type: type });

            return res.status(200).json({
                success: true,
                message: new_message
            });
        } catch(err) {
            await session.abortTransaction();

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
            const author_id = req._id;
            const message_id = req.params.message_id;
            const { chat_id, like, to } = req.body;
            if(author_id === null || message_id === null || chat_id === null || like === null || to === null || to === author_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const lower_id = author_id < to ? author_id : to;
            const higher_id = author_id > to ? author_id : to;

            const is_lower = author_id === lower_id;

            const result = await findChat({ chat_id, lower_id, higher_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            var update_message;
            await session.withTransaction(async () => {
                var promises = [];

                // MESAJI GÜNCELLE
                promises.push(Message.findByIdAndUpdate(message_id, { like: like }, { new: true }).session(session).lean());
        
                if(like) {
                    // CHATİ GÜNCELLE
                    promises.push(Chat.updateOne({ _id: chat_id, lower_id, higher_id }, {
                        last_message: {
                            author_id,
                            message,
                            type,
                            created_at
                        },
                        lower_read: is_lower ? true : false,
                        higher_read: is_lower ? false : true
                    }).session(session));
                }

                const results = await Promise.all(promises);
                update_message = results[0];
            });

            // TARGETIN SOKETİNİ BUL VE MESAJI VE CHATI GÖNDER.
            emitLikeMessage({
                to,
                message: update_message,
                chat: is_lower ? _higher_chat : _lower_chat
            });

            // TARGET A BİLDİRİM GÖNDER
            if(like) {
                pushLikeNotification({
                    author_id,
                    to,
                    chat_id
                });
            }

            return res.status(200).json({
                success: true,
                message: update_message
            });
        } catch(err) {
            await session.abortTransaction();

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
            const author_id = req._id;
            const chat_id = req.params.chat_id;
            const { to } = req.body;
            if(author_id === null || chat_id  === null || to  === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            } 
          
            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET.
            const lower_id = author_id < to ? author_id : to;
            const higher_id = author_id > to ? author_id : to;

            const is_lower = author_id === lower_id;

            const result = await findChat({ chat_id, lower_id, higher_id });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            await session.withTransaction(async () => {
                const promises = [];

                // OKUNMAMIŞ TÜM MESAJLARIN READINI TRUE YAP
                promises.push(Message.updateMany({ 
                    chat_id: chat_id,
                    author_id: is_lower ? higher_id : lower_id,
                    read: false,
                }, { $set: { read: true } }).session(session));

                // CHATI GÜNCELLE
                if(is_lower) {
                    promises.push(Chat.updateOne({ _id: chat_id }, { lower_read: true }).session(session));
                } else {
                    promises.push(Chat.updateOne({ _id: chat_id }, { higher_read: true }).session(session));
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
            await session.abortTransaction();

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
        const find_chat = await Chat.countDocuments({ _id: chat_id, lower_id, higher_id });
        return find_chat > 0 ? true : false;
    } catch (err) {
        throw err;
    }
}

// SOCKET EMITS

function emitReceiveMessage({ to, chat_id, message }) {
    try {
        const find_socket = SocketController.findSocket(to);
        if(find_socket) {
            find_socket.emit('receive_message', {
                chat_id: chat_id,
                message: message
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitLikeMessage({ to, chat_id, message }) {
    try {
        const find_socket = SocketController.findSocket(to);
        if(find_socket) {
            find_socket.emit('like_message', {
                chat_id: chat_id,
                message: message
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitReadMessages({ to, chat_id }) {
    try {
        const find_socket = SocketController.findSocket(to);
        if(find_socket) {
            find_socket.emit('read_messages', { chat_id });
        }
    } catch (err) {
        console.log(err);
    }
}

// PUSH NOTIFICATIONS

async function pushMessageNotification({ author_id, to, chat_id, message, message_type }) {
    try {
        const results = await Promise.all([
            User.findById(to).select('fcm_token notifications language').lean(),
            User.findById(author_id).select('display_name avatars verified').lean(),
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
                const chat_screen = {
                    chat_id: chat_id,
                    user: from_user,
                };

                await FirebaseAdmin.sendToDevice({
                    title: from_user.display_name,
                    body: body,
                    token: to_user.fcm_token.token,
                    data: { chat_screen: chat_screen },
                    channel_id: 'chat',
                    notification_type: 'CHAT'
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

async function pushLikeNotification({ author_id, to, chat_id }) {
    try {
        const results = await Promise.all([
            User.findById(to).select('fcm_token notifications language').lean(),
            User.findById(author_id).select('display_name avatars verified').lean(),
        ]);

        const to_user = results[0];
        const from_user = results[1];

        if (to_user && to_user.fcm_token) {
            if(to_user.notifications.like_messages) {

                // VERİYİ GÖNDER
                const chat_screen = {
                    chat_id: chat_id,
                    user: from_user,
                };

                // MESAJI DİLİNE GÖRE ÇEVİR.
                const body = Language.translate({ key: 'like_message', lang: to_user.language });

                await FirebaseAdmin.sendToDevice({
                    title: from_user.display_name,
                    body: body,
                    token: to_user.fcm_token.token,
                    data: { chat_screen: chat_screen },
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
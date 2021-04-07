const db = require('mongoose');

const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const User = require('../models/UserModel');

const FirebaseAdmin = require('../firebase/FirebaseAdmin');
const Language = require('../lang/Language');

const SocketIO = require('../shared/SocketIO').getInstance();

const Error = require('./ErrorController');

const MESSAGE_PAGE_SIZE = 25;

class ChatController {

    async chat_list(req, res) {
        try {
            const logged_id = req._id;

            const result = await Chat.find({ $or: [{ lower_id: logged_id }, { higher_id: logged_id }] })
            .populate('lower_id', 'display_name avatars verified')
            .populate('higher_id', 'display_name avatars verified')
            .sort({ created_at: -1 })
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
        } catch(err) {
            console.log(err);

            return res.status(400).json({
                success: false
            });
        }
    }

    async message_list(req, res) {
        try {
            const logged_id = req._id;
            const chat_id = req.params.chat_id;
            const skip = req.query.skip;
            if(!chat_id || !skip) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const chatExists = await findChatById({ chat_id, logged_id });
            if(!chatExists) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // CHATIN MESAJLARINI ÇEK
            const messages = await Message.find({ chat_id, created_at: { $gt: skip } })
                .sort({ created_at: -1 })
                .limit(MESSAGE_PAGE_SIZE)
                .lean();

            return res.status(200).json({
                success: true,
                messages
            });

        } catch(err) {
            console.log(err);

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
            const { content, type, reply, to } = req.body;
            if(chat_id === null || content === null || type === null || to === null || to === author_id) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS'
                });
            }

            // BÖYLE BİR CHAT VAR MI VARSA CHATTE BU KULLANICI VAR MI?
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
            var _content;
            switch(type) {
                case 'text':
                    _content = content;
                    break;
                case 'track':
                    _content = JSON.stringify(content);
                    break;
                case 'artist':
                    _content = JSON.stringify(content);
                    break;
                case 'podcast':
                    _content = JSON.stringify(content);
                    break;
                case 'album':
                    _content = JSON.stringify(content);
                    break;
                default:
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_MESSAGE_TYPE',
                    });
            }

            // MESAJI GÖNDER
            var new_message;
            await session.withTransaction(async () => {

                // MESAJI OLUŞTUR
                new_message = (await Message.create([{
                    chat_id,
                    author_id,
                    content: _content,
                    type,
                    reply
                }], { session: session }))[0];

                // CHATI GÜNCELLE
                await Chat.findByIdAndUpdate(chat_id, {
                    last_message: {
                        _id: new_message._id,
                        author_id: new_message.author_id,
                        content: new_message.content,
                        type: new_message.type,
                        created_at: new_message.created_at
                    },
                    lower_read: is_lower ? true : false,
                    higher_read: is_lower ? false : true
                }).session(session);
            });

            emitReceiveMessage({ to, chat_id, message: new_message });
            pushMessageNotification({ author_id, to, chat_id, content: _content, content_type: type });

            return res.status(200).json({
                success: true,
                message: new_message
            });

        } catch(err) {
            console.log(err);

            return res.status(400).json({
                success: false
            });
        } finally {
            session.endSession();
        }
    }

    async like_message(req, res) {
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

            // MESAJI BEĞEN
            await session.withTransaction(async () => {

                // MESAJI GÜNCELLE
                await Message.updateOne(message_id, { like }).session(session).lean();

                if(like) {
                    // CHATI GÜNCELLE
                    Chat.findByIdAndUpdate(chat_id, {
                        last_message: {
                            _id: message_id,
                            author_id: author_id,
                            content: null,
                            type: 'like',
                            created_at: Date.now()
                        }, 
                        lower_read: is_lower ? true : false,
                        higher_read: is_lower ? false : true
                    }).session(session);
                }
            });

            emitLikeMessage({ to, chat_id, message_id, author_id, like });
            if(like) pushLikeNotification({ author_id, to, chat_id });

            return res.status(200).json({
                success: true
            });
        } catch(err) {
            console.log(err);

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

            // OKUNMAMIŞ TÜM MESAJLARI OKU
            await session.withTransaction(async () => {

                // OKUNMAMIŞ TÜM MESAJLARIN READINI TRUE YAP
                await Message.updateMany({ chat_id, author_id: { $ne: author_id }, read: false }, { read: true }).session(session);

                // CHATI GÜNCELLE
                await Chat.findByIdAndUpdate(chat_id, is_lower ? { lower_read: true } : { higher_read: true }).session(session);   
            });

            emitReadMessages({ to, chat_id });

            return res.status(200).json({
                success: true
            });
        } catch (err) {
            console.log(err);

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

async function findChat({ chat_id, lower_id, higher_id }) {
    try {
        console.time('find_chat');
        const find_chat = await Chat.countDocuments({ _id: chat_id, lower_id, higher_id });
        console.timeEnd('find_chat');
        return find_chat > 0 ? true : false;
    } catch (err) {
        throw err;
    }
}

async function findChatById({ chat_id, logged_id }) {
    try {
        console.time('find_chat');
        const find_chat = await Chat.findById(chat_id).select('lower_id higher_id').lean();
        console.timeEnd('find_chat');

        if(!find_chat || (find_chat.lower_id.toString() !== logged_id.toString() && find_chat.higher_id.toString() !== logged_id.toString())) return false;
        
        return true;
    } catch(err) {
        throw err;
    }
}

// SOCKET EMITS

function emitReceiveMessage({ to, chat_id, message }) {
    try {
        const find_socket = SocketIO.findSocket(to);
        if(find_socket) {
            find_socket.emit('receive_message', {
                chat_id,
                message
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitLikeMessage({ to, chat_id, message_id, author_id, like }) {
    try {
        const find_socket = SocketIO.findSocket(to);
        if(find_socket) {
            find_socket.emit('like_message', {
                chat_id,
                message_id,
                author_id,
                like
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitReadMessages({ to, chat_id }) {
    try {
        const find_socket = SocketIO.findSocket(to);
        if(find_socket) {
            find_socket.emit('read_messages', { chat_id });
        }
    } catch (err) {
        console.log(err);
    }
}

// PUSH NOTIFICATIONS

async function pushMessageNotification({ author_id, to, chat_id, content, content_type }) {
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
                switch(content_type) {
                    case 'text':
                        body = content;
                        break;
                    case 'track':
                        const track = JSON.parse(content);
                        translate = Language.translate({ key: "track_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": track.artists[0],
                            "%trackName": track.name,
                        };
                        
                        body = translate.replace(/%name|%artistName|%trackName/gi, function(matched) { return mapObj[matched]; });
                        break;
                    case 'artist':
                        const artist = JSON.parse(content);
                        translate = Language.translate({ key: "artist_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": artist.name,
                        };
                        
                        body = translate.replace(/%name|%artistName/gi, function(matched) { return mapObj[matched]; });
                        break;
                    case 'podcast':
                        const podcast = JSON.parse(content);
                        translate = Language.translate({ key: "track_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": podcast.artists[0],
                            "%trackName": podcast.name,
                        };
                        
                        body = translate.replace(/%name|%artistName|%trackName/gi, function(matched) { return mapObj[matched]; });
                        break;
                      case 'album':
                        const album = JSON.parse(content);
                        translate = Language.translate({ key: "track_message", lang: to_user.language });

                        var mapObj = {
                            "%name": from_user.display_name,
                            "%artistName": album.artists[0],
                            "%trackName": album.name,
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
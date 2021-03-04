const db = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const Chat = require('../models/ChatModel');
const Message = require('../models/MessageModel');
const User = require('../models/UserModel');

const PushNotification = require('../controllers/PushNotificationController');
const shared = require('../shared/index');

const Spotify = require('../utils/Spotify');
const Language = require('../utils/Language');

const Error = require('./ErrorController');

class ChatController {

    // CHAT

    async chat_list(req, res) {
        try {
            const loggedId = req._id;

            // KULLANICININ TÜM CHATLERİNİ ÇEK.
            const result = await Chat.find({
                $or: [{ lowerId: loggedId }, { higherId: loggedId }],
            }) 
            .populate('lowerId', 'name photos isVerifed')
            .populate('higherId', 'name photos isVerifed');

            var chats = [];

            // FRONTENDIN OKUYACAĞI ŞEKİLDE CHATLERİ OLUŞTUR.
            result.forEach(chat => {
                let isLower = loggedId.toString() === chat.lowerId._id.toString();

                chats.push({
                    _id: chat._id,
                    user: isLower ? chat.higherId : chat.lowerId,
                    lastMessage: chat.lastMessage,
                    read: isLower ? chat.lowerRead : chat.higherRead,
                    createdAt: chat.createdAt
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
            const chatId = req.params.chatId;
            if(!chatId) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // CHATIN DOĞRULUĞUNU KONTROL ET.
            const result = await findChat({ chatId });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // TÜM MESAJLARIN LİSTESİNİ ÇEK.
            const messages = await Message.find({ chatId }).populate('reply', 'from message type').sort({ createdAt: -1 });

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
            const chatId = req.params.chatId;
            const from = req._id;
            const { message, type, to, replyId } = req.body;
            if(!chatId || !from || !message || !type || !to) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET.
            const lowerId = from < to ? from : to;
            const higherId = from > to ? from : to;

            const isLower = lowerId === from;

            const result = await findChat({ chatId, lowerId, higherId });
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
                    const findUser = await User.findById(from).select('spotifyRefreshToken');
                    const access_token = await Spotify.refreshAccessToken(findUser.spotifyRefreshToken);
                    if(!access_token) {
                        return res.status(401).json({
                            success: false,
                            error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                        });
                    }

                    const track = await Spotify.getTrack(access_token, message);
                    _message = `${track.id}_${track.name}_${track.artistName}_${track.imageURL}`;
                    break;
                default:
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_MESSAGE_TYPE',
                    });
            }

            // REPLY VARSA DOĞRULUĞUNU KONTROL ET VE BİLGİLERİNİ AL
            if(replyId) {
                const findReplyMessage = await Message.findById(replyId).select('chatId');
                if(!findReplyMessage) {
                    return res.status(200).json({
                        success: false,
                        error: 'NOT_FOUND_REPLY_MESSAGE',
                    });
                }

                // BU CHATIN MESAJI OLUP OLMADIĞINA BAK.
                if(findReplyMessage.chatId.toString() !== chatId) {
                    return res.status(200).json({
                        success: false,
                        error: 'INVALID_REPLY_MESSAGE',
                    });
                }
            }

            // BU BİLGİLERİ KULLANARAK MESAJI GÖNDER.
            var newMessage;
            var updateChat;

            await session.withTransaction(async () => {

                // MESAJI OLUŞTUR
                const messageId = ObjectId();
                await Message.create([{
                    _id: messageId,
                    chatId,
                    from,
                    message: _message,
                    type,
                    reply: replyId,
                }], { session: session });

                // MESAJI GETİR
                newMessage = await Message.findById(messageId).populate('reply', 'from message type').session(session);

                // CHATI GÜNCELLE
                await Chat.findByIdAndUpdate(chatId, {
                    lastMessage: {
                        _id: newMessage._id,
                        message: newMessage.message,
                        type: newMessage.type,
                        from: newMessage.from,
                        createdAt: newMessage.createdAt,
                    },
                    lowerRead: isLower ? true : false,
                    higherRead: isLower ? false : true,
                }).session(session);

                // CHATI ÇEK
                updateChat = await Chat.findById(chatId)
                    .populate('lowerId', 'name photos isVerifed')
                    .populate('higherId', 'name photos isVerifed')
                    .session(session);
            });

            // İKİ KULLANICI İÇİN CHATI FRONT END İÇİN OLUŞTUR.
            const { lowerChat, higherChat } = generateChats(updateChat);

            // TARGETIN SOKETİNİ BUL VE MESAJI VE CHATI GÖNDER.
            emitReceiveMessage({
                to,
                message: newMessage,
                chat: isLower ? higherChat : lowerChat
            });

            // TARGET A BİLDİRİM GÖNDER
            pushMessageNotification({
                from,
                to,
                chatId,
                message: _message,
                messageType: type
            }); 

            return res.status(200).json({
                success: true,
                message: newMessage,
                chat: isLower ? lowerChat : higherChat,
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
            const messageId = req.params.messageId;
            const { chatId, like, to } = req.body;
            if(!from || !messageId || !chatId || like == null || !to) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET
            const lowerId = from < to ? from : to;
            const higherId = from > to ? from : to;

            const isLower = from === lowerId;

            const result = await findChat({ chatId, lowerId, higherId });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            var _lowerChat;
            var _higherChat;

            var updateMessage;

            const transactionResults = await session.withTransaction(async () => {
                // BÖYLE BİR MESAJ VARMI KONTROL ET
                const findMessage = await Message.countDocuments({ _id: messageId });
                if(findMessage <= 0) return;

                // MESAJI GÜNCELLE
                updateMessage = await Message.findByIdAndUpdate(messageId, { like: like }, { new: true, upsert: true }).populate('reply', 'from message type').session(session);
        
                if(like) {
                    // CHATI GÜNCELLE
                    const updateChat = await Chat.findByIdAndUpdate(updateMessage.chatId, {
                        lastMessage: {
                            _id: updateMessage._id,
                            message: updateMessage.message,
                            type: 'like',
                            from: isLower ? lowerId : higherId,
                            createdAt: Date.now(),
                        },
                        lowerRead: isLower ? true : false,
                        higherRead: isLower ? false : true,
                    }, { new: true, upsert: true })
                    .populate('lowerId', 'name photos isVerifed')
                    .populate('higherId', 'name photos isVerifed')
                    .session(session);

                    // İKİ KULLANICI İÇİN CHATI FRONT END İÇİN OLUŞTUR.
                    const { lowerChat, higherChat } = generateChats(updateChat);
                    _lowerChat = lowerChat;
                    _higherChat = higherChat;
                }
            });
        
            if(transactionResults) {
                // TARGETIN SOKETİNİ BUL VE MESAJI VE CHATI GÖNDER.
                emitLikeMessage({
                    to,
                    message: updateMessage,
                    chat: isLower ? _higherChat : _lowerChat
                });

                // TARGET A BİLDİRİM GÖNDER
                if(like) {
                    pushLikeNotification({
                        from,
                        to,
                        chatId
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: updateMessage,
                    chat: isLower ? _lowerChat : _higherChat,
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
            const chatId = req.params.chatId;
            const { to } = req.body;
            if(!from || !chatId || !to) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            } 
          
            // BÖYLE BİR CHATIN OLUP OLMADIĞINI KONTROL ET.
            const lowerId = from < to ? from : to;
            const higherId = from > to ? from : to;

            const isLower = from === lowerId;

            const result = await findChat({ chatId, lowerId, higherId });
            if(!result) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            await session.withTransaction(async () => {
                // OKUNMAMIŞ TÜM MESAJLARIN READINI TRUE YAP
                await Message.updateMany({ 
                    chatId,
                    from: { $ne: from },
                    read: false,
                }, { $set: { read: true } }).session(session);

                // CHATI GÜNCELLE
                if(isLower) {
                    await Chat.findByIdAndUpdate(chatId, {
                        lowerRead: true,
                    }, { session: session });
                } else {
                    await Chat.findByIdAndUpdate(chatId, {
                        higherRead: true,
                    }, { session: session });
                }
            });

            // TARGETIN SOKETİNİ BUL VE MESAJLARININ OKUNDUĞUNU SÖYLE
            emitReadMessages({
                to,
                chatId
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
    } catch(err) {
        throw err;
    }
}

async function findChat({ chatId, lowerId, higherId }) {
    try {
        if(lowerId && higherId) {
            const findChat = await Chat.findOne({ lowerId, higherId }).select('_id');
            if(!findChat) return false;
            if(findChat._id.toString() !== chatId.toString()) return false;
        } else if (chatId) {
            const chatExists = await Chat.countDocuments({ _id: chatId });
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
        const findUser = shared.users.find(x => x.userId === to);
        if(findUser) {
            findUser.socket.emit('receive_message', {
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
        const findUser = shared.users.find(x => x.userId === to);
        if(findUser) {
            findUser.socket.emit('like_message', {
                message: message,
                chat: chat,
            });
        }
    } catch (err) {
        console.log(err);
    }
}

function emitReadMessages({ to, chatId }) {
    try {
        const findUser = shared.users.find(x => x.userId === to);
        if(findUser) {
            findUser.socket.emit('read_messages', {
                chatId
            });
        }
    } catch (err) {
        console.log(err);
    }
}

async function pushMessageNotification({ from, to, chatId, message, messageType }) {
    try {
        const toUser = await User.findById(to).select('fcmToken notifications language');
        if (toUser && toUser.fcmToken) {

            // BU KULLANICNIN CHAT BİLDİRİMİ ALIP ALMADIĞINI KONTROL ET.
            if(toUser.notifications.textMessages) {
                const fromUser = await User.findById(from).select('name photos isVerifed');

                // MESAJ TİPİNE GÖRE MESAJI AYARLA (KULLANICININ DİLİNE GÖRE ÇEVİRİ YAP)
                var body;
                switch(messageType) {
                    case 'text':
                        body = message;
                        break;
                    case 'track':
                        const trackName = message.split('_')[1];
                        const translate = await Language.translate({ key: "track_message", lang: toUser.language });
                        
                        var a = translate.replace('%name', fromUser.name);
                        body = a.replace('%trackName', trackName);
                        break;
                }

                // VERİYİ GÖNDER
                const chat = {
                    chatId: chatId,
                    to: to,
                    user: fromUser
                };

                await PushNotification.send({
                    title: fromUser.name,
                    body: body,
                    fcmToken: toUser.fcmToken.token,
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

async function pushLikeNotification({ from, to, chatId }) {
    try {
        const toUser = await User.findById(to).select('fcmToken notifications language');
        if (toUser && toUser.fcmToken) {

            // Bu kullanıcının chat bildirimi alıp almadığını kontrol et.
            if(toUser.notifications.likeMessages) {
                const fromUser = await User.findById(from).select('name photos isVerifed');

                // VERİYİ GÖNDER
                const chat = {
                    chatId: chatId,
                    to: to,
                    user: fromUser
                };

                // MESAJI DİLİNE GÖRE ÇEVİR.
                const body = await Language.translate({ key: 'like_message', lang: toUser.language });

                await PushNotification.send({
                    title: fromUser.name,
                    body: body,
                    fcmToken: toUser.fcmToken.token,
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
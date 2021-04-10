const db = require('mongoose');

const Chat = require('../models/ChatModel');
const Participant = require('../models/ParticipantModel');
const Message = require('../models/MessageModel');

const FirebaseAdmin = require('../firebase/FirebaseAdmin');
const Language = require('../lang/Language');

const SocketIO = require('../shared/SocketIO').getInstance();

const MESSAGE_PAGE_SIZE = 25;

class ChatController {

    async chat_list(req, res) {
        try {
            const logged_id = req._id;

            const chats = await Participant.find({ user_id: logged_id })
                .populate({
                    path: 'chat_id',
                    model: 'Chat',
                    populate: {
                        path: 'participants',
                        model: 'User',
                        select: 'display_name avatars verified'
                    }
                })
                .lean();

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

            // CHATI VE GEREKİ BİLGİLERİ ÇEK
            const chat = await Chat.findById(chat_id)
                .select('participants')
                .lean();

            // BÖYLE BİR CHAT VARMI? VARSA BU CHATİN KATILIMCISI MI BAK
            if(!chat || !chat.participants.includes(author_id)) {
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
            const { content, content_type, reply } = req.body;
            if(chat_id === null || content === null || content_type === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS'
                });
            }

            // CHATI VE GEREKİ BİLGİLERİ ÇEK
            const chat = await Chat.findById(chat_id)
                .populate('participants', 'display_name fcm_token notifications language')
                .select('participants group')
                .lean();

            // BÖYLE BİR CHAT VARMI? VARSA BU CHATİN KATILIMCISI MI BAK
            if(!chat || !chat.participants.includes(author_id)) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // GEREKLİ BİLGİLERİ AYARLA
            const group = chat.group;

            var author_user;
            var participants = [];
            chat.participants.forEach(user => user._id.toString() === author_id ? author_user = user : participants.push(user));

            // MESAJIN TİPİNE GÖRE İŞLEM YAP.
            var _content;
            switch(content_type) {
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
                    content_type,
                    reply
                }], { session: session }))[0];

                // CHATIN SON MESAJINI GÜNCELLE
                await Chat.updateOne({ _id: chat_id }, {
                    last_message: {
                        _id: new_message._id,
                        author_id: new_message.author_id,
                        content: new_message.content,
                        content_type: new_message.content_type,
                        created_at: new_message.created_at
                    }
                }).session(session);

                // BU CHATTEKİ TÜM KATILIMCILARIN (GÖNDEREN HARİÇ) PARTICIPANT MODELİNDEKİ READ KISMINI FALSE YAP
                await Participant.updateMany({ chat_id, user_id: { $ne: author_id } }, { read: false }).session(session);
            });

            emitReceiveMessage({ chat_id, participants, message: new_message });
            pushMessageNotification({ chat_id, participants, group, author_user, content: _content, content_type });

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
            const chat_id = req.params.chat_id;
            const { message_id, like } = req.body;
            if(chat_id === null || message_id === null || like === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // CHATI VE GEREKİ BİLGİLERİ ÇEK
            const chat = await Chat.findById(chat_id)
                .populate('participants', 'display_name fcm_token notifications language')
                .select('participants group')
                .lean();

            // BÖYLE BİR CHAT VARMI? VARSA BU CHATİN KATILIMCISI MI BAK
            if(!chat || !chat.participants.includes(author_id)) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // GEREKLİ BİLGİLERİ AYARLA
            const group = chat.group;

            var author_user;
            var participants = [];
            chat.participants.forEach(user => user._id.toString() === author_id ? author_user = user : participants.push(user));

            // MESAJI BEĞEN
            await session.withTransaction(async () => {

                if(like) {
                    // MESAJDA "like_by" KISMINA KULLANICININ IDSINI EKLE (EĞER LIKE_BY DA YOKSA EKLE)
                    await Message.updateOne({ _id: message_id, like_by: { $ne: author_id } }, { $push: { like_by: author_id } }).session(session);

                    // CHATIN SON MESAJINI GÜNCELLE
                    await Chat.updateOne({ _id: chat_id }, {
                        last_message: {
                            _id: message_id,
                            author_id: author_id,
                            content: null,
                            content_type: 'like',
                            created_at: Date.now()
                        }
                    }).session(session);

                    // BU CHATTEKİ TÜM KATILIMCILARIN (GÖNDEREN HARİÇ) PARTICIPANT MODELİNDEKİ READ KISMINI FALSE YAP
                    await Participant.updateMany({ chat_id, user_id: { $ne: author_id } }, { read: false }).session(session);
                } else {
                    // MESAJDA "like_by" KISMINDAKİ KULLANICININ IDSİNİ SİL (EĞER LIKE_BY DA VARSA SİL)
                    await Message.updateOne({ _id: message_id, like_by: { $eq: author_id }  }, { $pull: { like_by: author_id } }).session(session);
                }
            });

            emitLikeMessage({ chat_id, participants, message_id, author_id, like });
            if(like) pushLikeNotification({ chat_id, participants, group, author_user });

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
            if(author_id === null || chat_id  === null) {
                return res.status(200).json({
                    success: false,
                    error: 'INVALID_FIELDS',
                });
            }

            // CHATI VE GEREKİ BİLGİLERİ ÇEK
            const chat = await Chat.findById(chat_id)
                .select('participants')
                .lean();

            // BÖYLE BİR CHAT VARMI? VARSA BU CHATİN KATILIMCISI MI BAK
            if(!chat || !chat.participants.includes(author_id)) {
                return res.status(200).json({
                    success: false,
                    error: 'NOT_FOUND_CHAT'
                });
            }

            // GEREKLİ BİLGİLERİ AYARLA
            var participants = [];
            chat.participants.forEach(user => user._id.toString() === author_id ? author_user = user : participants.push(user));

            // OKUNMAMIŞ TÜM MESAJLARI OKU
            await session.withTransaction(async () => {

                await Message.updateMany({

                }).session(session);

                // OKUNMAMIŞ TÜM MESAJLARIN READ KISMINA KULLANICIYI EKLE
                await Message.updateMany({
                    chat_id,
                    author_id: { $ne: author_id },
                    read_by: { $ne: author_id },
                }, { $push: { read_by: author_id } }).session(session);

                // KULLANICININ PARTICIPANT'TA READ KISMINI TRUE YAP
                await Participant.updateOne({ chat_id, user_id: author_id }, { read: true }).session(session);
            });

            emitReadMessages({ chat_id, participants });

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

// SOCKET EMITS

function emitReceiveMessage({ chat_id, participants, message }) {
    try {
        const find_sockets = SocketIO.findSocketsByIds(participants);
        find_sockets.forEach(socket => {
            socket.emit('receive_message', {
                chat_id,
                message
            });
        });
    } catch(err) {
        console.log(err);
    }
}

function emitLikeMessage({ chat_id, participants, message_id, author_id, like }) {
    try {
        const find_sockets = SocketIO.findSocketsByIds(participants);
        find_sockets.forEach(socket => {
            socket.emit('like_message', {
                chat_id,
                message_id,
                author_id,
                like
            });
        });
    } catch (err) {
        console.log(err);
    }
}

function emitReadMessages({ chat_id, participants }) {
    try {
        const find_sockets = SocketIO.findSocketsByIds(participants);
        find_sockets.forEach(socket => {
            socket.emit('read_messages', { chat_id });
        });
    } catch (err) {
        console.log(err);
    }
}

// PUSH NOTIFICATIONS

async function pushMessageNotification({ chat_id, participants, group, author_user, content, content_type }) {
    try {

        const chat_screen = { chat_id, user: from_user }; // BİLDİRİME TIKLADIĞINDA CHAT AÇILMASI İÇİN

        var tr_tokens = [];
        var en_tokens = [];

        participants.forEach(user => {
            // MESAJIN TİPİNE GÖRE KULLANICININ BİLDİRİME İZİN VERİP VERMEDİĞİNİ BUL
            var send = false;
            switch(content_type) {
                case 'text':
                    if(user.notifications.text_messages) send = true;
                    break;
                default:
                    if(user.notifications.music_messages) send = true;
                    break;
            }

            if(send) {
                switch(user.language) {
                    case 'tr':
                        if(user.fcm_token != null) tr_tokens.push(user.fcm_token.token);
                        break;
                    case 'en':
                        if(user.fcm_token != null) en_tokens.push(user.fcm_token.token);
                        break;
                }
            }
        });

        var promises = [];

        const title = group != null ? group.name : author_user.display_name;

        var tr_body;
        var en_body;

        var _tr_body;
        var _en_body;

        switch(content_type) {
            case 'text':
                _tr_body = content;
                _en_body = content;
                break;
            case 'track':
                const track = JSON.parse(content);
                _tr_body = `<track_icon> ${track.artists[0]} - ${track.name}`;
                _en_body = `<track_icon> ${track.artists[0]} - ${track.name}`;
                break;
            case 'artist':
                const artist = JSON.parse(content);
                _tr_body = `<artist_icon> ${artist.name}`;
                _en_body = `<artist_icon> ${artist.name}`;
                break;
            case 'podcast':
                const podcast = JSON.parse(content);
                _tr_body = `<podcast_icon> ${podcast.artists[0]} - ${podcast.name}`;
                _en_body = `<podcast_icon> ${podcast.artists[0]} - ${podcast.name}`;
                break;
            case 'album':
                const album = JSON.parse(content);
                _tr_body = `<album_icon> ${album.artists[0]} - ${album.name}`;
                _en_body = `<album_icon> ${album.artists[0]} - ${album.name}`;
                break;
        }

        tr_body = group != null ? `**${author_user.display_name}** ${_tr_body}` : _tr_body;
        en_body = group != null ? `**${author_user.display_name}** ${_en_body}` : _en_body;

        if(tr_tokens.length > 0) {
            promises.push(FirebaseAdmin.sendMulticastNotification({
                tr_tokens,
                title,
                body: tr_body,
                data: { chat_screen },
                channel_id: 'chat',
                notification_type: 'CHAT'
            }));
        }

        if(en_tokens.length > 0) {
            promises.push(FirebaseAdmin.sendMulticastNotification({
                en_tokens,
                title,
                body: en_body,
                data: { chat_screen },
                channel_id: 'chat',
                notification_type: 'CHAT'
            }));
        }

        await Promise.all(promises);

    } catch (err) {
        console.log(err);
    }
} 

async function pushLikeNotification({ chat_id, participants, group, author_user }) {
    try {

        const chat_screen = { chat_id, user: from_user }; // BİLDİRİME TIKLADIĞINDA CHAT AÇILMASI İÇİN

        var tr_tokens = [];
        var en_tokens = [];

        participants.forEach(user => {
            if(user.notifications.like_messages) {
                switch(user.language) {
                    case 'tr':
                        if(user.fcm_token != null) tr_tokens.push(user.fcm_token.token);
                        break;
                    case 'en':
                        if(user.fcm_token != null) en_tokens.push(user.fcm_token.token);
                        break;
                }
            }
        });

        var promises = [];

        const title = group != null ? group.name : author_user.display_name;

        if(tr_tokens.length > 0) {
            const _body = Language.translate({ key: 'like_message', lang: 'tr' });
            const tr_body = group != null ? `**${author_user.display_name}** ${_body}` : _body;

            promises.push(FirebaseAdmin.sendMulticastNotification({
                tr_tokens,
                title,
                body: tr_body,
                data: { chat_screen },
                channel_id: 'chat',
                notification_type: 'CHAT'
            }));
        }

        if(en_tokens.length > 0) {
            const _body = Language.translate({ key: 'like_message', lang: 'en' });
            const en_body = group != null ? `**${author_user.display_name}** ${_body}` : _body;
        
            promises.push(FirebaseAdmin.sendMulticastNotification({
                en_tokens,
                title,
                body: en_body,
                data: { chat_screen },
                channel_id: 'chat',
                notification_type: 'CHAT'
            }));
        }

        await Promise.all(promises);

    } catch (err) {
        console.log(err);
    }
} 
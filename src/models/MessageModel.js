const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true,
    },
    reply: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },

    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum : ['text','track','voice','gif'],
        required: true,
    },
    like: {
        type: Boolean,
        default: false,
    },
    read: {
        type: Boolean,
        default: false,
    },

    createdAt: {
        type: Number,
        default: Date.now,
    },
});

module.exports = mongoose.model('Message', MessageSchema);
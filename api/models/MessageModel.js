const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
    chat_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true,
        index: true
    },
    author_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum : ['text','track','artist','podcast','album','gif','voice'],
        required: true,
    },
    
    reply: {
        author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','album','gif','voice'] },
    },

    like: {
        type: Boolean,
        default: false
    },
    read: {
        type: Boolean,
        default: false
    },

    created_at: {
        type: Number,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('Message', MessageSchema);
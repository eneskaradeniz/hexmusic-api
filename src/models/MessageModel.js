const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
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
        enum : ['text','track','artist','podcast','voice','gif'],
        required: true,
    },
    
    reply: {
        author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','voice','gif'] },
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
        default: Date.now
    }
});

module.exports = MessageSchema;


/*
const MessageSchema = mongoose.Schema({
    chat_id: {
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
        enum : ['text','track','artist','podcast','voice','gif'],
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

    created_at: {
        type: Number,
        default: Date.now,
    },
});

module.exports = mongoose.model('Message', MessageSchema);
*/
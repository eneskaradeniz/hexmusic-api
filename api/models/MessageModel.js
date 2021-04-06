const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
    author_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum : ['text','track','artist','podcast','album','gif','voice'],
        required: true
    },
    
    reply: {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        content: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','album','gif','voice'], required: true },
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

const MessageBucketSchema = mongoose.Schema({
    chat_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },

    count: {
        type: mongoose.Schema.Types.Number
    },

    messages: [MessageSchema],

    created_at: {
        type: Number,
        default: Date.now
    }
});

MessageBucketSchema.index({ chat_id: 1, created_at: -1 });
module.exports = mongoose.model('Message', MessageBucketSchema);
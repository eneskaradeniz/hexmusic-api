const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
    chat_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
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
        type: {
            _id: { type: mongoose.Schema.Types.ObjectId, required: true },
            author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            content: { type: String },
            type: { type: String, enum: ['text','track','artist','podcast','album','gif','voice'], required: true },
        },
        required: false
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

MessageSchema.index({ chat_id: 1, created_at: -1 });
module.exports = mongoose.model('Message', MessageSchema);
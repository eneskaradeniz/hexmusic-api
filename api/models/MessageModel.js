const mongoose = require('mongoose');

const ReplyMessageSchema = mongoose.Schema({
    _id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Message', 
        required: true 
    },
    author_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },

    content: { 
        type: String 
    },
    content_type: { 
        type: String, 
        enum: ['text','track','artist','podcast','album','gif','voice'], 
        required: true 
    },
});

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
    content_type: {
        type: String,
        enum : ['text','track','artist','podcast','album','gif','voice'],
        required: true
    },

    reply: {
        type: ReplyMessageSchema,
        required: false
    },

    like_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    created_at: {
        type: Number,
        default: Date.now
    }
});

MessageSchema.index({ chat_id: 1, created_at: -1 });
module.exports = mongoose.model('Message', MessageSchema);
const mongoose = require('mongoose');

const MessageSchema = mongoose.Schema({
    conversation_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
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
        type: new mongoose.Schema({
            _id: { type: mongoose.Schema.Types.ObjectId, required: true },
            author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            content: { type: String },
            type: { type: String, enum: ['text','track','artist','podcast','album','gif','voice'], required: true },
        }),
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

MessageSchema.index({ conversation_id: 1, created_at: -1 });
module.exports = mongoose.model('Message', MessageSchema);
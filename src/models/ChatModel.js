const mongoose = require('mongoose');
const MessageSchema = require('./MessageModel');

const ChatSchema = mongoose.schema({
    lower_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    higher_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    messages: [MessageSchema],

    last_message: {
        author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','voice','gif','like'] },
        created_at: { type: Number }
    },

    lower_read: {
        type: Boolean,
        default: false
    },
    higher_read: {
        type: Boolean,
        default: false
    },

    is_mega_like: {
        type: Boolean,
        default: false
    },

    created_at: {
        type: Number,
        default: Date.now
    }
});

/*
const ChatSchema = mongoose.Schema({
    match_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match',
        required: true,
    },

    lower_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    higher_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    last_message: {
        _id: { type: mongoose.Schema.Types.ObjectId },
        message: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','voice','gif','like']},
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        created_at: { type: Number }
    },

    lower_read: {
        type: Boolean,
        default: false,
    },
    higher_read: {
        type: Boolean,
        default: false,
    },

    created_at: {
        type: Number,
        default: Date.now
    }
});
*/

module.exports = mongoose.model('Chat', ChatSchema);
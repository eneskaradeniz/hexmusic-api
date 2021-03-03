const mongoose = require('mongoose');

const any = require('../utils/any');

const ChatSchema = mongoose.Schema({
    matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match',
        required: true,
    },

    lowerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    higherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    lastMessage: {
        _id: { type: mongoose.Schema.Types.ObjectId },
        message: { type: String },
        type: { type: String, enum: ['text','track','artist','podcast','voice','gif','like']},
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Number }
    },

    lowerRead: {
        type: Boolean,
        default: false,
    },
    higherRead: {
        type: Boolean,
        default: false,
    },

    createdAt: {
        type: Number,
        default: Date.now
    }
});

ChatSchema.plugin(any);
module.exports = mongoose.model('Chat', ChatSchema);
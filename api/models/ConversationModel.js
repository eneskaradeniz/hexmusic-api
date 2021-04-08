const mongoose = require('mongoose');

const ConversationSchema = mongoose.Schema({
    members: [{ 
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        read: { type: Boolean, default: false }
    }],

    last_message: {
        type: new mongoose.Schema({
            _id: { type: mongoose.Schema.Types.ObjectId, required: true },
            author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            content: { type: String },
            type: { type: String, enum: ['text','track','artist','podcast','album','gif','voice','like'], required: true },
            created_at: { type: Number, required: true }
        }),
        required: false
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

module.exports = mongoose.model('Conversation', ConversationSchema);
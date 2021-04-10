const mongoose = require('mongoose');

const GroupChatSchema = mongoose.Schema({
    created_user_id: { 
        type: {
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User'
        },
        required: true
    },

    name: { 
        type: String,
        required: true
    },
    description: { 
        type: String,
        required: true
    },
    image: { 
        type: String,
        required: true
    }
});

const LastMessageSchema = mongoose.Schema({
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
        enum: ['text','track','artist','podcast','album','gif','voice','like'], 
        required: true 
    },

    created_at: { 
        type: Number, 
        required: true 
    }
});

const ChatSchema = mongoose.Schema({
    participants: { 
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
        required: true
    },

    group: {
        type: GroupChatSchema,
        required: false
    },

    last_message: {
        type: LastMessageSchema,
        required: false
    },

    is_mega_like: {
        type: Boolean,
        required: false
    },

    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Chat', ChatSchema);
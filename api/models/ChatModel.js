const mongoose = require('mongoose');

const ChatSchema = mongoose.Schema({

    participants: [{ 
        user_id: {
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User',
            required: true,
            index: true
        },
        read: {
            type: Boolean,
            default: false
        },
        created_at: {
            type: Number,
            default: Date.now
        }
    }],

    group: {
        type: {
            managers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            created_user_id: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'User',
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
            },
        },
        required: false
    },

    last_message: {
        type: {
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
        },
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
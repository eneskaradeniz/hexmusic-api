const mongoose = require('mongoose');

const LikeSchema = mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true,
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true,
    },

    like_type: {
        type: String,
        enum: ['like', 'mega_like'],
        required: true,
    },
    match_type: {
        type: String,
        enum: ['live', 'explore', 'likes_me'],
        required: true,
    },
    track: {
        type: String,
        ref: 'Track',
    },
    
    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Like', LikeSchema);
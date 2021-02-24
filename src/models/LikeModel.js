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

    likeType: {
        type: String,
        enum: ['like', 'megaLike'],
        required: true,
    },
    matchType: {
        type: String,
        enum: ['live', 'explore', 'likesMe'],
        required: true,
    },
    trackId: {
        type: String,
    },
    
    sendAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Like', LikeSchema);
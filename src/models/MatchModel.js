const mongoose = require('mongoose');

const MatchSchema = mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
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

    lowerMatchType: {
        type: String,
        enum : ['live', 'explore', 'likesMe'],
    },
    higherMatchType: {
        type: String,
        enum : ['live', 'explore', 'likesMe'],
    },

    lowerLikeType: {
        type: String,
        enum : ['like', 'megaLike'],
    },
    higherLikeType: {
        type: String,
        enum : ['like', 'megaLike'],
    },

    lowerTrackId: {
        type: String,
        default: undefined,
    },
    higherTrackId: {
        type: String,
        default: undefined,
    },

    createdAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Match', MatchSchema);
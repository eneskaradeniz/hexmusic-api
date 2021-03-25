const mongoose = require('mongoose');

const MatchSchema = mongoose.Schema({
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

    lower_match_type: {
        type: String,
        enum : ['live', 'explore', 'likes_me'],
        required: true,
    },
    higher_match_type: {
        type: String,
        enum : ['live', 'explore', 'likes_me'],
        required: true,
    },

    lower_like_type: {
        type: String,
        enum : ['like', 'mega_like'],
        required: true,
    },
    higher_like_type: {
        type: String,
        enum : ['like', 'mega_like'],
        required: true,
    },

    lower_track_id: { type: String },
    higher_track_id: { type: String },

    created_at: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('Match', MatchSchema);
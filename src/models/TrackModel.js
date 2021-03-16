const mongoose = require('mongoose');

const TrackSchema = mongoose.Schema({
    _id: { type: String },
    name: {
        type: String,
        required: true,
    },
    artist: {
        type: String,
        required: true,
    },
    artists: [{ type: String }],
    album_name: {
        type: String,
        required: true,
    },
    album_image: { type: String },
    is_podcast: {
        type: Boolean,
        required: true,
    },
});

module.exports = mongoose.model('Track', TrackSchema);
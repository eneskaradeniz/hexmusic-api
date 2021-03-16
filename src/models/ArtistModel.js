const mongoose = require('mongoose');

const ArtistSchema = mongoose.Schema({
    _id: { type: String },
    name: {
        type: String,
        required: true,
    },
    image: { type: String },
});

module.exports = mongoose.model('Artist', ArtistSchema);
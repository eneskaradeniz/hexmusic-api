const mongoose = require('mongoose');

const ArtistSchema = mongoose.Schema({
    _id: { type: String },
    name: {
        type: String,
        required: true,
    },
    images: [{ type: mongoose.Schema.Types.Mixed }],
});

module.exports = mongoose.model('Artist', ArtistSchema);
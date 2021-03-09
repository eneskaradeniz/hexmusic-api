const mongoose = require('mongoose');
const { isEmail } = require('validator');

const UserSchema = mongoose.Schema({

    /*current_play: {
        track_id: { type: String, default: null },
        artist_id: { type: String, default: null },
        is_podcast: { type: Boolean, default: false },

        is_playing: { type: Boolean, default: false },
        timestamp: { type: Number, default: null },
    },*/

    listen: {
        trackId: { type: String, default: null },
        artistId: { type: String, default: null },

        isListen: { type: Boolean, default: false },
        timestamp: { type: Number, default: null },
    },

    fcmToken: {
        token: { type: String },
        platform: { type: String },
        createdAt: { type: Number },
    },

    spotifyId: {
        type: String,
        unique: true,
        required: true,
    },
    spotifyRefreshToken: {
        type: String,
        required: true,
    },

    isVerifed: {
        type: Boolean,
        required: true,
        default: false
    },

    email: {
        type: String,
        required: true,
        lowercase: true,
        validate: isEmail,
    },

    name: {
        type: String,
        required: true
    },
    photos: [{type: String}],
    birthday: {
        type: Number,
        required: true,
    },
    bio: {
        type: String,
        default: null
    },
    gender: {
        type : String,
        enum : ['male','female'],
        required: true,
    },
    city: {
        type: String,
        default: null
    },

    socialAccounts: {
        instagram: { type: String, default: null },
        facebook: { type: String, default: null },
        twitter: { type: String, default: null },
        spotify: { type: String, default: null },
    },

    lastTracks: [{type: String}],
    favTracks: [{type: String}],
    favArtists: [{type: String}],

    spotifyFavTracks: [{type: String}],
    spotifyFavArtists: [{type: String}],

    filtering: {
        artist: { type: Boolean, default: false },
        minAge: { type: Number, default: 18 },
        maxAge: { type: Number, default: 100 },
        genderPreference: { type : String, enum: ['all','male','female'], default: 'all' },
    },

    permissions: {
        showLive: {type: Boolean, default: true},
        showExplore: {type: Boolean, default: true},
        showAge: {type: Boolean, default: true},
        showAction: {type: Boolean, default: true},
        showLastTracks: {type: Boolean, default: true},
        showOnlineStatus: {type: Boolean, default: true},
    },

    notifications: {
        renewLikes: {type: Boolean, default: true},
        newMatches: {type: Boolean, default: true},
        likes: {type: Boolean, default: true},
        megaLikes: {type: Boolean, default: true},

        textMessages: {type: Boolean, default: true},
        likeMessages: {type: Boolean, default: true},
        trackMessages: {type: Boolean, default: true},
        voiceMessages: {type: Boolean, default: true},
        gifMessages: {type: Boolean, default: true},

        team: {type: Boolean, default: true},
    },

    counts: {
        like: {type: Number, default: 30},
        megaLike: {type: Number, default: 1},
        ads: {type: Number, default: 5},
    },

    product: {
        type : String,
        enum : ['free','premium_lite','premium_plus'],
        default: 'free',
        required: true,
    },

    language: {
        type: String,
        enum : ['tr','en'],
        default: 'tr',
        required: true
    },

    createdAt: {
        type: Number,
        default: Date.now
    }
});

module.exports = mongoose.model('User', UserSchema);
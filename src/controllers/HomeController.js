const User = require('../models/UserModel');

const Spotify = require('../utils/Spotify');

const Log = require('./LogController');

class HomeController {

    // HOME

    async home(req, res) {
        try {
            const loggedId = req._id;
            const loggedUser = await User.findById(loggedId).select('spotifyFavArtists');

            // TREND ARTIST AND ARTIST TOP 10
            const trendArtist = await getTrendArtistAndTop10Tracks(loggedId);

            // SUGGESTED TRACKS
            const suggestedTracks = await getSuggestedTracks(loggedId, loggedUser.spotifyFavArtists);
            
            // SUGGESTED ARTISTS
            const suggestedArtists = await getSuggestedArtists(loggedId, loggedUser.spotifyFavArtists);

            // POPULAR TRACKS
            const popularTracks = await getPopularTracks(loggedId, suggestedTracks);

            // POPULAR ARTISTS
            const popularArtists = await getPopularArtists(loggedId, suggestedArtists);

            return res.status(200).json({
                success: true,
                trendArtist,
                suggestedTracks,
                suggestedArtists,
                popularTracks,
                popularArtists
            });

        } catch(err) {
            Log({
                file: 'HomeController.js',
                method: 'home',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }

    async artist_tracks(req, res) {
        try {
            const loggedId = req._id;
            const artistId = req.params.artistId;

            // SANATÇININ BİLGİLERİNİ ÇEK
            const artist = await Spotify.getArtist(loggedId, artistId);

            // BU SANATÇIYI DİNLEYEN KULLANICI SAYISINI ÇEK
            const aggregate = await User.aggregate([
                {
                    $match: { 
                        $and: [
                            { "listen.isListen": true },
                            { "listen.artistId": artistId },
                            { "permissions.showLive": true },
                        ]   
                    }
                },
                { $count: "count" },
            ]);

            let count = 0;
            aggregate.forEach(element => {
                if(element) count = element.count;
            });

            const listenArtist = { artist, count };

            // BU SANATÇININ DİNLENEN TÜM MÜZİKLERİNİ ÇEK
            const _tracks = await User.aggregate([{
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.artistId": artistId },
                        { "permissions.showLive": true },
                    ]   
                } },
                { $group: {
                    _id: "$listen.trackId",
                    count: { $sum: 1 },
                } },
                {
                    $sort: { 'count': -1 }
                },
            ]);

            // BU TRACKIDLERI BİR LİSTEYE AKTAR VE BİLGİLERİNİ GETİR.

            const trackIds = [];
            _tracks.forEach(track => {
                trackIds.push(track._id);
            });

            const tracks = await Spotify.getTracksWithCount(loggedId, trackIds, _tracks);

            return res.status(200).json({
                listenArtist,
                tracks
            });
            
        } catch(err) {
            Log({
                file: 'HomeController.js',
                method: 'artist_tracks',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
    
    async live_count(req, res) {
        try {
            let count = 0;

            const aggregate = await User.aggregate([
                { 
                    $match: { 
                        $and: [
                            { "listen.isListen": true },
                            { "listen.artistId": { $ne: null } },
                            { "permissions.showLive": true },
                        ]
                    }
                },
                { $count: "count" },
            ]);

            aggregate.forEach(element => {
                if(element) {
                    count = element.count;
                }
            });

            return res.status(200).json({
                success: true,
                count: count
            });

        } catch(err) {
            Log({
                file: 'HomeController.js',
                method: 'live_count',
                info: err,
                type: 'critical',
            });

            return res.status(400).json({
                success: false
            });
        }
    }
}

module.exports = new HomeController();

// UTILS

async function getTrendArtistAndTop10Tracks(loggedId) {
    try {
        const _artists = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.artistId": { $ne: null } },
                        { "permissions.showLive": true },
                    ]
                }
            },
            {
                $group: {
                    _id: "$listen.artistId",
                    count: { $sum: 1 },
                }
            },
            {
                $sort: { 'count': -1 }
            },
            {
                $limit: 1
            },
        ]);

        if(_artists.length > 0) {
            const _artist = _artists[0];

            // BU SANATÇININ TOP 10 TRACKSLARINI GETIR
            const _tracks = await User.aggregate([
                {
                    $match: { 
                        $and: [
                            { "listen.isListen": true },
                            { "listen.artistId": { $eq: _artist._id } },
                            { "permissions.showLive": true },
                        ]
                    }
                },
                {
                    $group: {
                        _id: "$listen.trackId",
                        count: { $sum: 1 },
                    }
                },
                {
                    $sort: { 'count': -1 }
                },
                {
                    $limit: 10
                },
            ]);

            if(_tracks.length > 0) {
                // SANATÇININ BİLGİLERİNİ GETİR
                const artist = await Spotify.getArtist(loggedId, _artist._id);

                const listenArtist = {
                    artist,
                    count: _artist.count,
                };

                // ŞARKILARININ BİLGİLERİNİ GETİR

                var trackIds = [];

                _tracks.forEach(track => {
                    trackIds.push(track._id);
                });

                const tracks = await Spotify.getTracksWithCount(loggedId, trackIds, _tracks);

                return { listenArtist, tracks };
            }
        }

        return null;
    } catch(e) {
        throw e;
    }
}

async function getPopularTracks(loggedId, suggestedTracks) {
    try {

        // ÖNERİLEN ŞARKILARIN IDLERINI ÇEK
        var suggestedTrackIds = [];
        suggestedTracks.forEach(suggestedTrack => {
            suggestedTrackIds.push(suggestedTrack.track.id);
        });

        // DB DEN ŞARKILARI GETIR
        const _tracks = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.trackId": { $ne: null } },
                        { "listen.trackId": { $nin: suggestedTrackIds } },
                        { "permissions.showLive": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$listen.trackId",
                    count: { $sum: 1 },
                }
            },
            {
                $sort: { 'count': -1 }
            },
        ]);

        var tracks = [];

        if(_tracks.length > 0) {
            // ŞARKILARININ BİLGİLERİNİ GETİR
            var trackIds = [];

            _tracks.forEach(track => {
                trackIds.push(track._id);
            });

            tracks = await Spotify.getTracksWithCount(loggedId, trackIds, _tracks);
        }

        return tracks;

    } catch(e) {
        throw e;
    }
}

async function getPopularArtists(loggedId, suggestedArtists) {
    try {

        // ÖNERİLEN SANATÇILARIN IDLERINI ÇEK
        var suggestedArtistIds = [];
        suggestedArtists.forEach(suggestedArtist => {
            suggestedArtistIds.push(suggestedArtist.artist.id);
        });

        // DB DEN SANATÇILARI GETIR
        const _artists = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.artistId": { $ne: null } },
                        { "listen.artistId": { $nin: suggestedArtistIds } },
                        { "permissions.showLive": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$listen.artistId",
                    count: { $sum: 1 },
                }
            },
            {
                $sort: { 'count': -1 }
            },
        ]);

        var artists = [];

        if(_artists.length > 0) {
            // SANATÇILARIN BİLGİLERİNİ GETİR
            var artistIds = [];

            _artists.forEach(artist => {
                artistIds.push(artist._id);
            });

            artists = await Spotify.getArtistsWithCount(loggedId, artistIds, _artists);
        }

        return artists;

    } catch(e) {
        throw e;
    }
}

async function getSuggestedTracks(loggedId, artistIds) {
   try {
        // DB DEN ŞARKILARI GETIR
        const _tracks = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.artistId": { $ne: null } },
                        { "listen.artistId": { $in: artistIds } },
                        { "permissions.showLive": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$listen.trackId",
                    count: { $sum: 1 },
                }
            },
        ]);

        var tracks = [];

        if(_tracks.length > 0) {
            // ŞARKILARININ BİLGİLERİNİ GETİR
            var trackIds = [];

            _tracks.forEach(track => {
                trackIds.push(track._id);
            });

            tracks = await Spotify.getTracksWithCount(loggedId, trackIds, _tracks);
        }

        return tracks;
   } catch(e) {
       throw e;
   }
}

async function getSuggestedArtists(loggedId, artistIds) {
    try {
        // DB DEN SANATÇILARI GETIR
        const _artists = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.artistId": { $ne: null } },
                        { "listen.artistId": { $in: artistIds } },
                        { "permissions.showLive": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$listen.artistId",
                    count: { $sum: 1 },
                }
            },
        ]);

        var artists = [];

        if(_artists.length > 0) {
            // SANATÇILARIN BİLGİLERİNİ GETİR
            var artistIds = [];

            _artists.forEach(artist => {
                artistIds.push(artist._id);
            });

            artists = await Spotify.getArtistsWithCount(loggedId, artistIds, _artists);
        }

        return artists;
   } catch(e) {
       throw e;
   }
}
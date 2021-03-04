const User = require('../models/UserModel');

const Spotify = require('../utils/Spotify');

const Error = require('./ErrorController');

class HomeController {

    // HOME

    async home(req, res) {
        try {
            const loggedId = req._id;
            const loggedUser = await User.findById(loggedId).select('spotifyFavArtists spotifyRefreshToken');

            const access_token = await Spotify.refreshAccessToken(loggedUser.spotifyRefreshToken);
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            const { trendArtist, recommendedTracks, recommendedArtists, popularTracks, popularArtists } = await test(access_token, loggedUser.spotifyFavArtists);

            /*// TREND ARTIST AND ARTIST TOP 10
            const trendArtist = await getTrendArtistAndTop10Tracks(access_token);

            // SUGGESTED TRACKS
            const suggestedTracks = await getSuggestedTracks(access_token, loggedUser.spotifyFavArtists);
            
            // SUGGESTED ARTISTS
            const suggestedArtists = await getSuggestedArtists(access_token, loggedUser.spotifyFavArtists);

            // POPULAR TRACKS
            const popularTracks = await getPopularTracks(access_token, suggestedTracks);

            // POPULAR ARTISTS
            const popularArtists = await getPopularArtists(access_token, suggestedArtists);*/

            return res.status(200).json({
                success: true,
                trendArtist,
                suggestedTracks: recommendedTracks,
                suggestedArtists: recommendedArtists,
                popularTracks,
                popularArtists
            });

        } catch(err) {
            Error({
                file: 'HomeController.js',
                method: 'home',
                title: err.toString(),
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
                if(element) count = element.count;
            });

            return res.status(200).json({
                success: true,
                count: count
            });

        } catch(err) {
            Error({
                file: 'HomeController.js',
                method: 'live_count',
                title: err.toString(),
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

async function test(access_token, spotifyFavArtists) {
    try {
        const trendArtist = await getTrendArtistAndTop10Tracks(access_token);

        var recommendedTracks = [];
        var recommendedArtists = [];

        var popularTracks = [];
        var popularArtists = [];

        var allTracks = [];
        var allArtists = [];

        // TÜM DİNLENEN ŞARKILARI ÇEK
        const _allTracks = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.trackId": { $ne: null } },
                        { "listen.artistId": { $ne: null } },
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

        if(_allTracks.length > 0) {
            var allTrackIds = [];

            _allTracks.forEach(element => allTrackIds.push(element._id));
            allTracks = await Spotify.getTracksWithCount(access_token, allTrackIds, _allTracks);

            recommendedTracks = allTracks.filter(x => spotifyFavArtists.includes(x.track.artistId));
            popularTracks = allTracks.filter(x => !spotifyFavArtists.includes(x.track.artistId));
        } 

        // TÜM DİNLENEN SANATÇILARI ÇEK
        const _allArtists = await User.aggregate([
            {
                $match: { 
                    $and: [
                        { "listen.isListen": true },
                        { "listen.trackId": { $ne: null } },
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
        ]);

        if(_allArtists.length > 0) {
            var allArtistIds = [];

            _allArtists.forEach(element => allArtistIds.push(element._id));
            allArtists = await Spotify.getArtistsWithCount(access_token, allArtistIds, _allArtists);

            recommendedArtists = allArtists.filter(x => spotifyFavArtists.includes(x.artist.id));
            popularArtists = allArtists.filter(x => !spotifyFavArtists.includes(x.artist.id));
        }

        return {
            trendArtist,
            recommendedTracks,
            recommendedArtists,
            popularTracks,
            popularArtists,
        };

    } catch(err) {
        throw err;
    }
}

// UTILS

async function getTrendArtistAndTop10Tracks(access_token) {
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
                const artist = await Spotify.getArtist(access_token, _artist._id);

                const listenArtist = {
                    artist,
                    count: _artist.count,
                };

                // ŞARKILARININ BİLGİLERİNİ GETİR
                var trackIds = [];

                _tracks.forEach(track => {
                    trackIds.push(track._id);
                });

                const tracks = await Spotify.getTracksWithCount(access_token, trackIds, _tracks);

                return { listenArtist, tracks };
            }
        }

        return null;
    } catch(err) {
        throw err;
    }
}

async function getPopularTracks(access_token, suggestedTracks) {
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

            tracks = await Spotify.getTracksWithCount(access_token, trackIds, _tracks);
        }

        return tracks;

    } catch(err) {
        throw err;
    }
}

async function getPopularArtists(access_token, suggestedArtists) {
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

            artists = await Spotify.getArtistsWithCount(access_token, artistIds, _artists);
        }

        return artists;

    } catch(err) {
        throw err;
    }
}

async function getSuggestedTracks(access_token, artistIds) {
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

            tracks = await Spotify.getTracksWithCount(access_token, trackIds, _tracks);
        }

        return tracks;
   } catch(err) {
       throw err;
   }
}

async function getSuggestedArtists(access_token, artistIds) {
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

            artists = await Spotify.getArtistsWithCount(access_token, artistIds, _artists);
        }

        return artists;
   } catch(err) {
       throw err;
   }
}
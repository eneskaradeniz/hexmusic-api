const User = require('../models/UserModel');

const Spotify = require('../utils/Spotify');

const Error = require('./ErrorController');

class HomeController {

    async test_ms(req, res) {
        try {
            const loggedId = req._id;


        } catch(err) {
            console.log('test_ms:', err);
        }
    }

    // HOME

    async home(req, res) {
        try {
            const loggedId = req._id;

            console.time('fetchUser');
            const loggedUser = await User.findById(loggedId).select('spotifyFavArtists spotifyRefreshToken');
            console.timeEnd('fetchUser');

            console.time('refreshAccessToken');
            const access_token = await Spotify.refreshAccessToken(loggedUser.spotifyRefreshToken);
            console.timeEnd('refreshAccessToken');
            if(!access_token) {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SPOTIFY_REFRESH_TOKEN',
                });
            }

            console.time('total_test');
            const { trendArtist, recommendedTracks, recommendedArtists, popularTracks, popularArtists } = await test(access_token, loggedUser.spotifyFavArtists);
            console.timeEnd('total_test');

            return res.status(200).json({
                success: true,
                trendArtist,
                recommendedTracks,
                recommendedArtists,
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

// UTILS

async function test(access_token, spotifyFavArtists) {
    try {
        console.time('total_trend_artist');
        const trendArtist = await getTrendArtistAndTop10Tracks(access_token);
        console.timeEnd('total_trend_artist');

        var recommendedTracks = [];
        var recommendedArtists = [];

        var popularTracks = [];
        var popularArtists = [];

        var allTracks = [];
        var allArtists = [];

        // TÜM DİNLENEN ŞARKILARI ÇEK
        console.time('_allTracks');
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
        console.timeEnd('_allTracks');

        if(_allTracks.length > 0) {
            var allTrackIds = [];

            console.time('_allTracks_foreach');
            _allTracks.forEach(element => allTrackIds.push(element._id));
            console.timeEnd('_allTracks_foreach');

            console.time('spotify_all_tracks');
            allTracks = await Spotify.getTracksWithCount(access_token, allTrackIds, _allTracks);
            console.timeEnd('spotify_all_tracks');

            recommendedTracks = allTracks.filter(x => spotifyFavArtists.includes(x.track.artistId));
            popularTracks = allTracks.filter(x => !spotifyFavArtists.includes(x.track.artistId));
        } 

        // TÜM DİNLENEN SANATÇILARI ÇEK
        console.time('_allArtists');
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
        console.timeEnd('_allArtists');

        if(_allArtists.length > 0) {
            var allArtistIds = [];

            console.time('_allArtists_foreach');
            _allArtists.forEach(element => allArtistIds.push(element._id));
            console.timeEnd('_allArtists_foreach');

            console.time('spotify_all_artists');
            allArtists = await Spotify.getArtistsWithCount(access_token, allArtistIds, _allArtists);
            console.timeEnd('spotify_all_artists');

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

async function getTrendArtistAndTop10Tracks(access_token) {
    try {
        console.time('fetchTrendArtist');
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
        console.timeEnd('fetchTrendArtist');

        if(_artists.length > 0) {
            const _artist = _artists[0];

            // BU SANATÇININ TOP 10 TRACKSLARINI GETIR
            console.time('fetchTrendArtistTop10Tracks');
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
            console.timeEnd('fetchTrendArtistTop10Tracks');

            if(_tracks.length > 0) {
                // SANATÇININ BİLGİLERİNİ GETİR
                console.time('spotify_trend_artist');
                const artist = await Spotify.getArtist(access_token, _artist._id);
                console.timeEnd('spotify_trend_artist');

                const listenArtist = {
                    artist,
                    count: _artist.count,
                };

                // ŞARKILARININ BİLGİLERİNİ GETİR
                var trackIds = [];

                _tracks.forEach(track => {
                    trackIds.push(track._id);
                });

                console.time('spotify_trend_tracks');
                const tracks = await Spotify.getTracksWithCount(access_token, trackIds, _tracks);
                console.timeEnd('spotify_trend_tracks');

                return { listenArtist, tracks };
            }
        }

        return null;
    } catch(err) {
        throw err;
    }
}

// OLD UTILS

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
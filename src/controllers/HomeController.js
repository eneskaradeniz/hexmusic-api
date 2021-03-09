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
            
            const { trendArtist, recommendedTracks, recommendedArtists, popularTracks, popularArtists } = await fetchDatas(access_token, loggedUser.spotifyFavArtists);

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

async function fetchDatas(access_token, spotifyFavArtists) {
    try {
        var trendArtist;

        var recommendedTracks;
        var recommendedArtists;

        var popularTracks;
        var popularArtists;

        const _trend_artist = User.aggregate([
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

        const _all_tracks = User.aggregate([
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

        const _all_artists = User.aggregate([
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

        console.time('fetch_all_listeners');
        const values = await Promise.all([_trend_artist, _all_tracks, _all_artists]);
        console.timeEnd('fetch_all_listeners');

        var _trend_artist_id;
        if(values[0].length > 0) _trend_artist_id = values[0][0]._id.toString();

        // SPOTIFY DAN VERILER ÇEKİLECEK

        const all_track_ids = [];
        values[1].forEach(element => all_track_ids.push(element._id));

        const all_artists_ids = [];
        values[2].forEach(element => all_artists_ids.push(element._id));

        const spotify_all_tracks = Spotify.getTracksWithCount(access_token, all_track_ids, values[1], _trend_artist_id);
        const spotify_all_artists = Spotify.getArtistsWithCount(access_token, all_artists_ids, values[2], _trend_artist_id);

        console.time('spotify_fetch_all');
        const values2 = await Promise.all([spotify_all_tracks, spotify_all_artists]);
        console.timeEnd('spotify_fetch_all');

        const all_tracks = values2[0].results;
        const all_artists = values2[1].results;

        // FINISH

        trendArtist = {
            listenArtist: values2[1].trend_artist,
            tracks: values2[0].trend_tracks,
        };

        recommendedTracks = all_tracks.filter(x => spotifyFavArtists.includes(x.track.artistId));
        popularTracks = all_tracks.filter(x => !spotifyFavArtists.includes(x.track.artistId));

        recommendedArtists = all_artists.filter(x => spotifyFavArtists.includes(x.artist.id));
        popularArtists = all_artists.filter(x => !spotifyFavArtists.includes(x.artist.id));

        return {
            trendArtist,
            recommendedTracks,
            recommendedArtists,
            popularTracks,
            popularArtists
        }
    } catch(err) {
        throw err;
    }
}
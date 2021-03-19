const User = require('../models/UserModel');

const Error = require('./ErrorController');

const Track = require('../models/TrackModel');
const Artist = require('../models/ArtistModel');
const shared = require('../shared');

class HomeController {

    // HOME

    async test(req, res) {
        try {
            console.time('fetch_datas');
            const { trend_artist, recommended_tracks, recommended_artists, all_tracks, all_artists, all_podcasts } = await fetchDatas(['a','1g4J8P1JWwanNyyXckRX5W']);
            console.timeEnd('fetch_datas');

            return res.status(200).json({
                success: true,
                trend_artist: trend_artist,
                recommended_tracks: recommended_tracks,
                recommended_artists: recommended_artists,
                all_tracks: all_tracks,
                all_artists: all_artists,
                all_podcasts: all_podcasts,
            });
        } catch(err) {
            console.log(err);

            return res.status(400).json({
                success: false
            });
        }
    }

    async home(req, res) {
        try {
            const loggedId = req._id;

            console.time('fetch_user_data');
            const loggedUser = await User.findById(loggedId).select('spotify_fav_artists').lean();
            console.timeEnd('fetch_user_data');
            
            console.time('fetch_datas');
            const { trend_artist, recommended_tracks, recommended_artists, all_tracks, all_artists, all_podcasts } = await fetchDatas(loggedUser.spotify_fav_artists);
            console.timeEnd('fetch_datas');

            return res.status(200).json({
                success: true,
                trend_artist: trend_artist,
                recommended_tracks: recommended_tracks,
                recommended_artists: recommended_artists,
                all_tracks: all_tracks,
                all_artists: all_artists,
                all_podcasts: all_podcasts,
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
                            { "current_play.is_playing": true },
                            { "current_play.artist": { $ne: null } },
                            { "permissions.show_live": true },
                        ]
                    }
                },
                { $count: "count" },
            ]);

            aggregate.forEach(element => { if(element) count = element.count; });

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

async function fetchDatas(spotify_fav_artists) {
    try {
        var trend_artist;

        var recommended_tracks = [];
        var recommended_artists = [];

        var all_tracks = [];
        var all_artists = [];
        var all_podcasts = [];

        // DB DE EN ÇOK DİNLENEN SANATÇI VE TOP 10 ŞARKISI (SAYISI İLE BİRLİKTE)
        // DB DE TÜM DİNLENEN ŞARKILAR (SAYISI İLE BİRLİKTE)
        // DB DE TÜM DİNLENEN SANATÇILAR (SAYISI İLE BİRLİKTE)
        // DB DE TÜM DİNLENEN PODCASTLAR (SAYISI İLE BİRLİKTE)

        const _trend_artist = User.aggregate([
            {
                $match: { 
                    $and: [
                        { "current_play.is_playing": true },
                        { "current_play.artist": { $ne: null } },
                        { "permissions.show_live": true },
                    ]
                }
            },
            {
                $group: {
                    _id: "$current_play.artist",
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
                        { "current_play.is_playing": true },
                        { "current_play.track": { $ne: null } },
                        { "current_play.artist": { $ne: null } },
                        { "permissions.show_live": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$current_play.track",
                    count: { $sum: 1 },
                }
            },
        ]);

        const _all_artists = User.aggregate([
            {
                $match: { 
                    $and: [
                        { "current_play.is_playing": true },
                        { "current_play.track": { $ne: null } },
                        { "current_play.artist": { $ne: null } },
                        { "permissions.show_live": true },
                    ]   
                }
            },
            {
                $group: {
                    _id: "$current_play.artist",
                    count: { $sum: 1 },
                }
            }
        ]);

        console.time('fetch_all_listeners');
        const values = await Promise.all([_trend_artist, _all_tracks, _all_artists]);
        console.timeEnd('fetch_all_listeners');

        const aggregate_trend_artist = values[0];

        const trend_artist_id = aggregate_trend_artist._id;

        const aggregate_tracks = values[1];
        const aggregate_artists = values[2];

        var aggregate_track_ids = [];
        aggregate_tracks.forEach(e => aggregate_track_ids.push(e._id));

        var aggregate_artist_ids = [];
        aggregate_artists.forEach(e => aggregate_artist_ids.push(e._id));

        const fetch_track_and_artist_list = await Promise.all([
            User.aggregate([
                {
                    $match: { 
                        $and: [
                            { "current_play.is_playing": true },
                            { "current_play.track": { $ne: null } },
                            { "current_play.artist": { $eq: trend_artist_id } },
                            { "permissions.show_live": true },
                        ]   
                    }
                },
                {
                    $group: {
                        _id: "$current_play.track",
                        count: { $sum: 1 },
                    }
                },
                {
                    $limit: 10
                }
            ]),
            Track.find({ _id: { $in: aggregate_track_ids }}),
            Artist.find({ _id: { $in: aggregate_artist_ids }}),
        ]);

        const trend_tracks_aggregate = fetch_track_and_artist_list[0];
        const tracks_infos = fetch_track_and_artist_list[1];
        const artists_infos = fetch_track_and_artist_list[2];

        if(trend_tracks_aggregate.length > 0) {
            const _trend_artist = trend_tracks_aggregate[0];

            // BU SANATÇININ TOP 10 TRACKSLARINI GETIR
            const _trend_tracks = await User.aggregate([
                {
                    $match: { 
                        $and: [
                            { "current_play.is_playing": true },
                            { "current_play.track": { $ne: null } },
                            { "current_play.artist": { $eq: _trend_artist._id } },
                            { "permissions.show_live": true },
                        ]
                    }
                },
                {
                    $group: {
                        _id: "$current_play.track",
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

            if(_trend_tracks.length > 0) {
                const _artist = Artist.findById(_trend_artist._id).lean();

                var track_ids = [];
                _trend_tracks.forEach(track => track_ids.push(track._id));

                const promises = await Promise.all([
                    Artist.findById(_trend_artist._id).lean(),
                    Track.find({ _id: { $in: track_ids }}),
                ]);

                const listen_artist = {
                    artist: promises[0],
                    count: _artist.count,
                };

                var tracks = [];

                promises[1].forEach((track) => {
                    const obj = _trend_tracks.find(o => o._id === track._id);
                    all_tracks.push({
                        track: track,
                        count: obj.count,
                    });
                });

                trend_artist = {
                    listen_artist: listen_artist,
                    tracks: tracks,
                };
            }
        }

        tracks_infos.forEach((track) => {
            const obj = aggregate_tracks.find(o => o._id === track._id);
            if(track.is_podcast) {
                all_podcasts.push({
                    track: track,
                    count: obj.count,
                });
            } else {
                all_tracks.push({
                    track: track,
                    count: obj.count,
                });
            }
        });

        artists_infos.forEach((artist) => {
            const obj = aggregate_artists.find(o => o._id === artist._id);
            all_artists.push({
                artist: artist,
                count: obj.count,
            });
        });

        // FINISH

        recommended_tracks = all_tracks.filter(x => spotify_fav_artists.includes(x.track.artist.toString()));
        recommended_artists = all_artists.filter(x => spotify_fav_artists.includes(x.artist._id.toString()));

        return {
            trend_artist,
            recommended_tracks,
            recommended_artists,
            all_tracks,
            all_artists,
            all_podcasts,
        };
    } catch(err) {
        throw err;
    }
}
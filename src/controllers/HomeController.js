const User = require('../models/UserModel');

const Error = require('./ErrorController');

class HomeController {

    async home(req, res) {
        try {
            const logged_id = req._id;
            const logged_user = await User.findById(logged_id).select('spotify_fav_artists').lean();
  
            /*const { trend_artist, recommended_tracks, recommended_artists, all_tracks, all_artists, all_podcasts } = await fetchDatas(logged_user.spotify_fav_artists);

            return res.status(200).json({
                success: true,
                trend_artist: trend_artist,
                recommended_tracks: recommended_tracks,
                recommended_artists: recommended_artists,
                all_tracks: all_tracks,
                all_artists: all_artists,
                all_podcasts: all_podcasts,
            });*/

            return res.status(200).json({
                success: true,
                trend_artist: [],
                recommended_tracks: [],
                all_tracks: [],
                all_podcasts: []
            });

        } catch(err) {
            console.log(err);
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

            /*const aggregate = await User.aggregate([
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

            aggregate.forEach(element => { if(element) count = element.count; });*/

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

/*async function fetchDatas(spotify_fav_artists) {
    try {
        var trend_artist;

        var recommended_tracks = [];
        var recommended_artists = [];

        var all_tracks = [];
        var all_artists = [];
        var all_podcasts = [];

        // DB DE EN ÇOK DİNLENEN SANATÇI
        // DB DE DİNLENEN TÜM ŞARKILAR
        // DB DE DİNLENEN TÜM SANATÇILAR

        const _aggregate_artist = User.aggregate([
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

        const _aggregate_tracks = User.aggregate([
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

        const _aggregate_artists = User.aggregate([
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
        const fetch_promises = await Promise.all([_aggregate_artist, _aggregate_tracks, _aggregate_artists]);
        console.timeEnd('fetch_all_listeners');

        const aggregate_trend_artist = fetch_promises[0];
        const aggregate_tracks = fetch_promises[1];
        const aggregate_artists = fetch_promises[2];

        var aggregate_track_ids = [];
        aggregate_tracks.forEach(e => aggregate_track_ids.push(e._id));

        var aggregate_artist_ids = [];
        aggregate_artists.forEach(e => aggregate_artist_ids.push(e._id));

        // DB DEN ÇEKİLEN ŞARKI/SANATÇILARIN BİLGİLERİNİ DB DEN ALIYORUM (AGGREGATE DE LOOKUP İLE ALABİLİRDİM AMA ÇÖZEMEDİM)
        const fetch_track_and_artist_list = await Promise.all([
            Track.find({ _id: { $in: aggregate_track_ids }}),
            Artist.find({ _id: { $in: aggregate_artist_ids }}),
        ]);

        const tracks_infos = fetch_track_and_artist_list[1];
        const artists_infos = fetch_track_and_artist_list[2];

        // TREND SANATÇI VARSA ONUN GEREKLİ BİLGİLERİNİ AL
        if(aggregate_trend_artist.length > 0) {
            const _trend_artist = aggregate_trend_artist[0];

            // BU SANATÇININ TOP 10 ŞARKILARINI GETIR
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
                var track_ids = [];
                _trend_tracks.forEach(track => track_ids.push(track._id));

                const promises = await Promise.all([
                    Artist.findById(_trend_artist._id).lean(),
                    Track.find({ _id: { $in: track_ids }}).lean(),
                ]);

                const listen_artist = {
                    artist: promises[0],
                    count: _trend_artist.count,
                };

                var tracks = [];

                promises[1].forEach((track) => {
                    const obj = _trend_tracks.find(o => o._id === track._id);
                    tracks.push({
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

        // KULLANICININ SPOTIFY FAVORİLERİNE GÖRE ÖNERİLEN ŞARKI VE SANATÇILARINI AYARLIYORUM
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
}*/
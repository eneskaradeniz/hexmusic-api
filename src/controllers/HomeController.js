const User = require('../models/UserModel');

const Error = require('./ErrorController');

const Track = require('../models/TrackModel');
const Artist = require('../models/ArtistModel');
const shared = require('../shared');

class HomeController {

    // HOME

    async home(req, res) {
        try {
            const loggedId = req._id;

            console.time('fetch_user_data');
            const loggedUser = await User.findById(loggedId).select('spotify_fav_artists').lean();
            console.timeEnd('fetch_user_data');
            
            /*console.time('fetch_datas');
            const { trend_artist, recommended_tracks, recommended_artists, popular_tracks, popular_artists } = await fetchDatas(loggedUser.spotify_fav_artists);
            console.timeEnd('fetch_datas');*/

            return res.status(200).json({
                success: true,
                trend_artist: [],
                recommended_tracks: [],
                recommended_artists: [],
                popular_tracks: [],
                popular_artists: [],
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

        var recommended_tracks;
        var recommended_artists;

        var popular_tracks;
        var popular_artists;

        // DB DE EN ÇOK DİNLENEN SANATÇI VE TOP 10 ŞARKISI (SAYISI İLE BİRLİKTE)
        // DB DE TÜM DİNLENEN ŞARKILAR (SAYISI İLE BİRLİKTE)
        // DB DE TÜM DİNLENEN SANATÇILAR (SAYISI İLE BİRLİKTE)

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
            },
        ]);

        console.time('fetch_all_listeners');
        const values = await Promise.all([_trend_artist, _all_tracks, _all_artists]);
        console.timeEnd('fetch_all_listeners');

        var _trend_artist_id;
        if(values[0].length > 0) _trend_artist_id = values[0][0]._id.toString();

        // FINISH

        trend_artist = {
            listenArtist: values2[1].trend_artist,
            tracks: values2[0].trend_tracks,
        };

        recommended_tracks = all_tracks.filter(x => spotify_fav_artists.includes(x.track.artistId));
        popular_tracks = all_tracks.filter(x => !spotify_fav_artists.includes(x.track.artistId));

        recommended_artists = all_artists.filter(x => spotify_fav_artists.includes(x.artist.id));
        popular_artists = all_artists.filter(x => !spotify_fav_artists.includes(x.artist.id));

        return {
            trend_artist,
            recommended_tracks,
            recommended_artists,
            popular_tracks,
            popular_artists
        }
    } catch(err) {
        throw err;
    }
}
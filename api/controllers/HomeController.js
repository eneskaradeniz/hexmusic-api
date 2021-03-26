const User = require('../models/UserModel');

const Error = require('./ErrorController');

const InstantListeners = require('../shared/InstantListeners').getInstance();
const SpotifyAPI = require('../shared/SpotifyAPI').getInstance();

class HomeController {

    async home(req, res) {
        try {
            const logged_id = req._id;
            const logged_user = await User.findById(logged_id).select('spotify_fav_artists').lean();
  
            const { _trend_artist, _all_tracks, _all_podcasts } = InstantListeners.getHome();

            await SpotifyAPI.getAccessToken();

            const promises = await Promise.all([
                SpotifyAPI.getArtist(_trend_artist != null ? _trend_artist.id : null),
                SpotifyAPI.getTracksWithCount(Object.keys(_all_tracks), _all_tracks),
                SpotifyAPI.getPodcastsWithCount(Object.keys(_all_podcasts), _all_podcasts),
            ]);

            var trend_artist;
            var recommended_tracks = [];
            var all_podcasts = promises[2];
            var all_tracks = promises[1];

            if(promises[0] != null) {
                trend_artist = {
                    artist: promises[0],
                    tracks: []
                };

                all_tracks.forEach((x) => {
                    if(x.track.artist === trend_artist.artist.id) trend_artist.tracks.push(x);
                    if(logged_user.spotify_fav_artists.includes(x.track.artist)) recommended_tracks.push(x);
                });

                trend_artist.tracks.sort((a,b) => b.count - a.count);
                trend_artist.tracks = trend_artist.tracks.slice(0, 9);

                recommended_tracks = shuffle(recommended_tracks);
                all_podcasts = shuffle(all_podcasts);
                all_tracks = shuffle(all_tracks);
            }

            return res.status(200).json({
                success: true,
                trend_artist,
                recommended_tracks,
                all_tracks,
                all_podcasts
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
            let count = InstantListeners.size || 0;

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

// UTILS

function shuffle(array) {
    if(array.length === 0) return array;

    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
}


module.exports = new HomeController();
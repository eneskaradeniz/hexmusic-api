require('dotenv').config();

const SpotifyWebApi = require('spotify-web-api-node');

const lodash = require("lodash");

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
});

const ONE_HOUR = 60 * 60 * 1000;

const refresh_token = "AQD3RYmMsfZXwgA6xM0k-zGFmqvqpoFeMXlYFUv7rz249MTxxSeR0890fd0hUJKz38aOb4pq0za0tWKi1y1hQdQfq0GCo82-l3fzdmnkW5AOf0_BQ15TU__bWEACXDebWb4";

var access_token;
var timestamp;

class SpotifyController {

    // AUTH

    static async getAuthorizationCodeGrant(code) {
        try {
            const data = await spotifyApi.authorizationCodeGrant(code);

            const access_token = data.body['access_token'];
            const refresh_token = data.body['refresh_token'];

            return { access_token, refresh_token }; 
        } catch (err) {
            if(err.body.error === 'invalid_grant') return null;
            throw err;
        }
    }

    static async getSpotifyId(access_token) {
        try {
            spotifyApi.setAccessToken(access_token);
            const data = await spotifyApi.getMe();
            return data.body.id;
        } catch (err) {
            if(err.body.error === 'invalid_grant') return null;
            throw err;
        }
    }

    static async refreshAccessToken(refresh_token) {
        try {
            spotifyApi.setRefreshToken(refresh_token);

            const data = await spotifyApi.refreshAccessToken();
            return data.body['access_token']; 
        } catch(err) {
            if(err.body.error === 'invalid_grant') return null;
            throw err;
        }
    } 

    static async getAccessToken() {
        try {
            spotifyApi.setRefreshToken(refresh_token);

            if(!timestamp || ((Date.now()) - timestamp) >= ONE_HOUR) {
                const data = await spotifyApi.refreshAccessToken();
                access_token = data.body['access_token'];
                timestamp = Date.now();

                console.log('spotify refresh access_token kullanıldı.');
            } else {
                console.log('cache access_token kullanıldı.');
            }

            return access_token;   
        } catch(err) {
            throw err;
        }
    } 

    // TRACK/PODCAST/ARTIST
    
    static async getTrack(id) {
        try {
            if(!id) return null;

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTrack(id);
            const track = data.body;

            var artists = [];
            track.artists.forEach(artist => artists.push(artist.name));

            return {
                id: track.id,
                name: track.name,
                artist: track.artists[0].id,
                artists: artists,
                album_name: track.album.name,
                album_image: track.album.images[0] != null ? track.album.images[0].url : null,
                is_podcast: false,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getPodcast(id) {
        try {
            if(!id) return null;

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getEpisode(id);
            const podcast = data.body;

            var artists = [];
            artists.push(podcast.show.publisher);

            return {
                id: podcast.id,
                name: podcast.name,
                artist: podcast.show.id,
                artists: artists,
                album_name: podcast.show.name,
                album_image: podcast.images[0] != null ? podcast.images[0].url : null,
                is_podcast: true,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getArtist(id) {
        try {
            if(!id) return null;

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getArtist(id);
            const artist = data.body;

            return {
                id: artist.id,
                name: artist.name,
                image: artist.images[0] != null ? artist.images[0].url : null,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getTracks(ids) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getTracks(ids));

            const result = await Promise.all(promises);

            var tracks = [];
            result.map((data) => tracks = [...tracks, ...data.body.tracks]);
    
            var results = [];

            tracks.forEach(track => {
                var artists = [];
                track.artists.forEach(artist => artists.push(artist.name));
    
                results.push({
                    id: track.id,
                    name: track.name,
                    artist: track.artists[0].id,
                    artists: artists,
                    album_name: track.album.name,
                    album_image: track.album.images[0] != null ? track.album.images[0].url : null,
                    is_podcast: false,
                });
            });
            
            return results;
        } catch (err) {
            throw err;
        }
    }
    
    static async getArtists(ids) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getArtists(ids));

            const result = await Promise.all(promises);

            var artists = [];
            result.map((data) => artists = [...artists, ...data.body.artists]);
        
            var results = [];
        
            artists.forEach(artist => {
                results.push({
                    id: artist.id,
                    name: artist.name,
                    image: artist.images[0] != null ? artist.images[0].url : null,
                });
            });   
        
            return results;
        } catch(err) {
            throw err;
        }
    }

    static async getPodcasts(ids) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getEpisodes(ids));

            const result = await Promise.all(promises);

            var podcasts = [];
            result.map((data) => podcasts = [...podcasts, ...data.body.episodes]);
    
            var results = [];

            podcasts.forEach(podcast => {
                var artists = [];
                artists.push(podcast.show.publisher);
    
                results.push({
                    id: podcast.id,
                    name: podcast.name,
                    artist: podcast.show.id,
                    artists: artists,
                    album_name: podcast.show.name,
                    album_image: podcast.images[0] != null ? podcast.images[0].url : null,
                    is_podcast: true,
                });
            });
            
            return results;
        } catch (err) {
            throw err;
        }
    }

    // HOME

    static async getTracksWithCount(ids, arr) {
        try {
            if(ids.length === 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getTracks(ids));

            const result = await Promise.all(promises);

            var tracks = [];
            result.map((data) => tracks = [...tracks, ...data.body.tracks]);
    
            var results = [];

            tracks.forEach(track => {
                var artists = [];
                track.artists.forEach(artist => artists.push(artist.name));
    
                results.push({
                    track: {
                        id: track.id,
                        name: track.name,
                        artist: track.artists[0].id,
                        artists: artists,
                        album_name: track.album.name,
                        album_image: track.album.images[0] != null ? track.album.images[0].url : null,
                        is_podcast: false,
                    },
                    count: arr[track.id]
                });
            });
            
            return results;
        } catch (err) {
            throw err;
        }
    }

    static async getPodcastsWithCount(ids, arr) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getEpisodes(ids));

            const result = await Promise.all(promises);

            var podcasts = [];
            result.map((data) => podcasts = [...podcasts, ...data.body.episodes]);
    
            var results = [];

            podcasts.forEach(podcast => {
                var artists = [];
                artists.push(podcast.show.publisher);
    
                results.push({
                    track: {
                        id: podcast.id,
                        name: podcast.name,
                        artist: podcast.show.id,
                        artists: artists,
                        album_name: podcast.show.name,
                        album_image: podcast.images[0] != null ? podcast.images[0].url : null,
                        is_podcast: true,
                    },
                    count: arr[podcast.id]
                });
            });
            
            return results;
        } catch (err) {
            throw err;
        }
    }

    static async getArtistsWithCount(ids, arr) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);

            const chunks = lodash.chunk(ids, 50);
            const promises = chunks.map((ids) => spotifyApi.getArtists(ids));

            const result = await Promise.all(promises);

            var artists = [];
            result.map((data) => artists = [...artists, ...data.body.artists]);
        
            var results = [];
        
            artists.forEach(artist => {
                results.push({
                    artist: {
                        id: artist.id,
                        name: artist.name,
                        image: artist.images[0] != null ? artist.images[0].url : null,
                    },
                    count: arr[artist.id]
                });
            });   
        
            return results;
        } catch(err) {
            throw err;
        }
    }

    // MY TOPS
    
    static async getMyTopTracks(access_token) {
        try {
            var spotify_fav_tracks = [];
            var fav_tracks = [];

            spotifyApi.setAccessToken(access_token);
            
            const data = await spotifyApi.getMyTopTracks({
                limit: 50,
                time_range: 'medium_term',
            });

            const topTracks = data.body.items;
            topTracks.forEach(track => spotify_fav_tracks.push(track.id));

            fav_tracks = spotify_fav_tracks.slice(0, 10);

            return { spotify_fav_tracks, fav_tracks };
        } catch (err) {
            throw err;
        }     
    }

    static async getMyTopArtists(access_token) {
        try {
            var spotify_fav_artists = [];
            var fav_artists = [];
            
            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.getMyTopArtists({
                limit: 50,
                time_range: 'medium_term',
            });

            const topArtists = data.body.items;
            topArtists.forEach(artist => spotify_fav_artists.push(artist.id));

            fav_artists = spotify_fav_artists.slice(0, 10);

            return { spotify_fav_artists, fav_artists };
        } catch (err) {
            throw err;
        }     
    }
}

module.exports = SpotifyController;
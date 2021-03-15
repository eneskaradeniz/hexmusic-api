require('dotenv').config();

const SpotifyWebApi = require('spotify-web-api-node');
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
});

class Spotify {

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

    static async getSpotifyId(access_token) {
        try {
            spotifyApi.setAccessToken(access_token);
            const data = await spotifyApi.getMe();
            return data.body.id;
        } catch (err) {
            throw err;
        }
    }

    // TRACK/ARTIST/PODCAST

    static async getPodcast(access_token, id) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getEpisode(id);
            const podcast = data.body;

            var artists = [];
            artists.push(podcast.show.publisher);

            return {
                _id: podcast.id,
                name: podcast.name,
                artist: podcast.show.id,
                artists: artists,
                album_name: podcast.show.name,
                album_images: podcast.images,
                is_podcast: true,
            };
        } catch (err) {
            throw err;
        }
    }
    
    static async getTrack(access_token, id) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTrack(id);
            const track = data.body;

            var artists = [];
            track.artists.forEach(artist => artists.push(artist.name));

            return {
                _id: track.id,
                name: track.name,
                artist: track.artists[0].id,
                artists: artists,
                album_name: track.album.name,
                album_images: track.album.images,
                is_podcast: false,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getArtist(access_token, id) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getArtist(id);
            const artist = data.body;

            return {
                _id: artist.id,
                name: artist.name,
                images: artist.images,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getTracks(access_token, ids) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTracks(ids);
            const tracks = data.body.tracks;
        
            var results = [];
        
            tracks.forEach(track => {
                var artists = [];
                track.artists.forEach(artist => artists.push(artist.name));

                results.push({
                    _id: track.id,
                    name: track.name,
                    artist: track.artists[0].id,
                    artists: artists,
                    album_name: track.album.name,
                    album_images: track.album.images,
                    is_podcast: false,
                });
            }); 
            
            return results;
        } catch (err) {
            throw err;
        }
    }
    
    static async getArtists(access_token, ids) {
        try {
            if(ids.length == 0) return [];

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getArtists(ids);
            const artists = data.body.artists;
        
            var results = [];
        
            artists.forEach(artist => {
                results.push({
                    _id: artist.id,
                    name: artist.name,
                    images: artist.images,
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
            var spotify_fav_track_ids = [];
            var spotify_fav_tracks = [];

            spotifyApi.setAccessToken(access_token);
            
            const data = await spotifyApi.getMyTopTracks({
                limit: 50,
                time_range: 'medium_term',
            });

            const topTracks = data.body.items;

            if(topTracks.length > 0) {
                topTracks.forEach(track => {
                    spotify_fav_track_ids.push(track.id);

                    var artists = [];
                    track.artists.forEach(artist => artists.push(artist.name));
    
                    spotify_fav_tracks.push({
                        _id: track.id,
                        name: track.name,
                        artist: track.artists[0].id,
                        artists: artists,
                        album_name: track.album.name,
                        album_images: track.album.images,
                        is_podcast: false,
                    });
                });
            }

            return { spotify_fav_track_ids, spotify_fav_tracks };

        } catch (err) {
            throw err;
        }     
    }

    static async getMyTopArtists(access_token) {
        try {
            var spotify_fav_artist_ids = [];
            var spotify_fav_artists = [];
            
            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.getMyTopArtists({
                limit: 50,
                time_range: 'medium_term',
            });

            const topArtists = data.body.items;

            if(topArtists.length > 0) {
                topArtists.forEach(artist => {
                    spotify_fav_artist_ids.push(artist.id);
    
                    spotify_fav_artists.push({
                        _id: artist.id,
                        name: artist.name,
                        images: artist.images,
                    });
                });
            }

            return { spotify_fav_artist_ids, spotify_fav_artists };

        } catch (err) {
            throw err;
        }     
    }

    // SEARCH ITEMS

    static async searchTracks(refresh_token, query) {
        try {
            const access_token = await this.refreshAccessToken(refresh_token);
            if(!access_token) return null;

            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.searchTracks(query, { limit: 10 });
            const tracks = data.body.tracks.items;
    
            var results = [];
            
            tracks.forEach(track => {

                var artists = [];
                track.artists.forEach(artist => artists.push(artist.name));

                if(track.name.toLowerCase().includes(query)) {
                    results.push({
                        _id: track.id,
                        name: track.name,
                        artist: track.artists[0].id,
                        artists: artists,
                        album_name: track.album.name,
                        album_images: track.album.images,
                        is_podcast: false,
                    });
                }
            }); 

            return results;
        } catch (err) {
            throw err;
        }
    }

    static async searchArtists(refresh_token, searchField) {
        try {
            const access_token = await this.refreshAccessToken(refresh_token);
            if(!access_token) return null;

            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.searchArtists(searchField, { limit: 10 });
            const artists = data.body.artists.items;
    
            var results = [];
            
            artists.forEach(artist => {
                if(artist.name.toLowerCase().includes(searchField)) {
                    results.push({
                        _id: artist.id,
                        name: artist.name,
                        images: artist.images,
                    });
                }
            }); 

            return results;
        } catch (err) {
            throw err;
        }
    }

    static async searchPodcasts(refresh_token, query) {
        try {
            const access_token = await this.refreshAccessToken(refresh_token);
            if(!access_token) return null;

            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.searchPodcasts(query, { limit: 10 });
            const podcasts = data.body.tracks.items;
    
            var results = [];
            
            podcasts.forEach(podcast => {

                var artists = [];
                artists.push(podcast.show.publisher);

                if(podcast.name.toLowerCase().includes(query)) {
                    results.push({
                        _id: podcast.id,
                        name: podcast.name,
                        artist: podcast.show.id,
                        artists: artists,
                        album_name: podcast.show.name,
                        album_images: podcast.images,
                        is_podcast: true,
                    });
                }
            }); 

            return results;
        } catch (err) {
            throw err;
        }
    }
}

module.exports = Spotify;
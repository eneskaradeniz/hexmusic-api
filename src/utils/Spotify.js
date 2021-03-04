require('dotenv').config();

const SpotifyWebApi = require('spotify-web-api-node');
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
});

const User = require('../models/UserModel');

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

    // TRACKS AND ARTISTS
    
    static async getTrack(access_token, id) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTrack(id);
            const track = data.body;

            return {
                id: track.id,
                artistId: track.artists[0].id,
                name: track.name,
                artistName: track.artists[0].name,
                imageURL: track.album.images[0] != null ? track.album.images[0].url : null,
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
                id: artist.id,
                name: artist.name,
                imageURL: artist.images[0] != null ? artist.images[0].url : null,
            };
        } catch (err) {
            throw err;
        }
    }

    static async getTracks(access_token, trackIds) {
        try {
            if(trackIds.length == 0) return [];

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTracks(trackIds);
            const tracks = data.body.tracks;
        
            var results = [];
        
            if(tracks.length > 0) {
                tracks.forEach(track => {
                    results.push({
                        id: track.id,
                        artistId: track.artists[0].id,
                        name: track.name,
                        artistName: track.artists[0].name,
                        imageURL: track.album.images[0] != null ? track.album.images[0].url : null,
                    });
                }); 
            }
            
            return results;
        } catch (err) {
            throw err;
        }
    }
    
    static async getArtists(access_token, artistIds) {
        try {
            if(artistIds.length == 0) return [];

            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getArtists(artistIds);
            const artists = data.body.artists;
        
            var results = [];
        
            if(artists.length > 0) {
                artists.forEach(artist => {
                    results.push({
                        id: artist.id,
                        name: artist.name,
                        imageURL: artist.images[0] != null ? artist.images[0].url : null,
                    });
                });    
            }
        
            return results;
        } catch(err) {
            throw err;
        }
    }

    // MY TOPS

    static async getMyTopArtists(access_token) {
        try {
            var spotifyFavArtistIds = [];
            var spotifyFavArtists = [];
            
            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.getMyTopArtists({
                limit: 1000,
                time_range: 'medium_term',
            });

            const topArtists = data.body.items;

            if(topArtists.length > 0) {
                topArtists.forEach(artist => {
                    spotifyFavArtistIds.push(artist.id);
    
                    spotifyFavArtists.push({
                        id: artist.id,
                        name: artist.name,
                        imageURL: artist.images[0] != null ? artist.images[0].url : null,
                    });
                });
            }

            return { spotifyFavArtistIds, spotifyFavArtists };

        } catch (err) {
            throw err;
        }     
    }

    static async getMyTopTracks(access_token) {
        try {
            var spotifyFavTrackIds = [];
            var spotifyFavTracks = [];

            spotifyApi.setAccessToken(access_token);
            
            const data = await spotifyApi.getMyTopTracks({
                limit: 1000,
                time_range: 'medium_term',
            });

            const topTracks = data.body.items;

            if(topTracks.length > 0) {
                topTracks.forEach(track => {
                    spotifyFavTrackIds.push(track.id);
    
                    spotifyFavTracks.push({
                        id: track.id,
                        artistId: track.artists[0].id,
                        name: track.name,
                        artistName: track.artists[0].name,
                        imageURL: track.album.images[0] ? track.album.images[0].url : null,
                    });
                });
            }

            return { spotifyFavTrackIds, spotifyFavTracks };

        } catch (err) {
            throw err;
        }     
    }

    // LISTEN ITEMS

    static async getTracksWithCount(access_token, trackIds, _tracks) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getTracks(trackIds);
            const tracks = data.body.tracks;
        
            var results = [];
        
            if(tracks.length > 0) {
                tracks.forEach(track => {
                    let obj = _tracks.find(o => o._id === track.id);
            
                    results.push({
                        track: {
                            id: track.id,
                            artistId: track.artists[0].id,
                            name: track.name,
                            artistName: track.artists[0].name,
                            imageURL: track.album.images[0] ? track.album.images[0].url : null,
                        },
                        count: obj.count,
                    });
                }); 
            }
            
            return results;
        } catch (err) {
            throw err;
        }
    }

    static async getArtistsWithCount(access_token, artistIds, _artists) {
        try {
            spotifyApi.setAccessToken(access_token);
    
            const data = await spotifyApi.getArtists(artistIds);
            const artists = data.body.artists;
        
            var results = [];
        
            if(artists.length > 0) {
                artists.forEach(artist => {
                    let obj = _artists.find(o => o._id === artist.id);
            
                    results.push({
                        artist: {
                            id: artist.id,
                            name: artist.name,
                            imageURL: artist.images[0] != null ? artist.images[0].url : null,
                        },
                        count: obj.count,
                    });
                }); 
            }
            
            return results;
        } catch (err) {
            throw err;
        }
    }

    // SEARCH ITEMS

    static async searchTracks(refresh_token, searchField) {
        try {
            const access_token = await this.refreshAccessToken(refresh_token);
            if(!access_token) return null;

            spotifyApi.setAccessToken(access_token);

            const data = await spotifyApi.searchTracks(searchField, {
                market: 'TR',
                limit: 10
            });
    
            const tracks = data.body.tracks.items;
    
            var results = [];
            
            if(tracks.length > 0) {
                tracks.forEach(track => {
                    if(track.name.toLowerCase().includes(searchField)) {
                        results.push({
                            id: track.id,
                            artistId: track.artists[0].id,
                            name: track.name,
                            artistName: track.artists[0].name,
                            imageURL: track.album.images[0] != null ? track.album.images[0].url : null,
                        });
                    }
                }); 
            }

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

            const data = await spotifyApi.searchArtists(searchField, {
                market: 'TR',
                limit: 10
            });

            const artists = data.body.artists.items;
    
            var results = [];
            
            if(artists.length > 0) {
                artists.forEach(artist => {
                    if(artist.name.toLowerCase().includes(searchField)) {
                        results.push({
                            id: artist.id,
                            name: artist.name,
                            imageURL: artist.images[0] != null ? artist.images[0].url : null,
                        });
                    }
                }); 
            }

            return results;
        } catch (err) {
            throw err;
        }
    }
}

module.exports = Spotify;
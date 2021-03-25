
class InstantListenersController {

    static instant_listeners = new Map();

    static toArray() {
        return [...this.instant_listeners.values()];
    }

    static set({ user_id, track_id, artist_id, is_podcast }) {
        this.instant_listeners.set(user_id, { track_id, artist_id, is_podcast });
    }

    static delete(user_id) {
        this.instant_listeners.delete(user_id);
    }

    static get(user_id) {
        return this.instant_listeners.get(user_id);
    }

    static getTrackListeners(user_id, id) {
        var listeners = [];

        this.instant_listeners.forEach((value, key) => {
            if(key != user_id)
                if(value.track_id === id) listeners[key] = value;
        });

        return listeners;
    }

    static getArtistListeners(user_id, id) {
        var listeners = [];

        this.instant_listeners.forEach((value, key) => {
            if(key != user_id)
                if(value.artist_id === id) listeners[key] = value;
        });

        return listeners;
    }

    static getHome() {
        const fetch = deneme(this.toArray());
        return {
            _trend_artist: fetch.trend_artist,
            _all_podcasts: fetch.all_podcasts,
            _all_tracks: fetch.all_tracks
        };
    }

    static getTotalCount() {
        return this.instant_listeners.size;
    }
}

// UTILS

function deneme(arr) {
    var all_artists = [];
    var all_tracks = [];
    var all_podcasts = [];
    
    arr.forEach((value) => {
        if(value.is_podcast) {
            all_podcasts[value.track_id] = (all_podcasts[value.track_id] || 0) + 1;
        } else {
            const index = all_artists.findIndex(x => x.id === value.artist_id);
            if(index === -1) {
                all_artists.push({ id: value.artist_id, count: 1 });
            } else {
                all_artists[index].count = all_artists[index].count + 1;
            }
           
            all_tracks[value.track_id] = (all_tracks[value.track_id] || 0) + 1;
        }
    });

    all_artists.sort((a,b) => b.count - a.count);
    const trend_artist = all_artists[0];

    return { trend_artist, all_tracks, all_podcasts };
}

module.exports = InstantListenersController;
class PrivateInstantListeners {

    constructor() {
        this.instant_listeners = new Map();
    }

    get toArray() {
        return [...this.instant_listeners.values()];
    }

    get size() {
        return this.instant_listeners.size;
    }

    set({ user_id, track_id, artist_id, is_podcast }) {
        this.instant_listeners.set(user_id, { track_id, artist_id, is_podcast });
    }

    delete(user_id) {
        this.instant_listeners.delete(user_id);
    }

    get(user_id) {
        return this.instant_listeners.get(user_id);
    }

    getTrackListeners(user_id, id) {
        var listeners = {};

        this.instant_listeners.forEach((value, key) => {
            if(key != user_id)
                if(value.track_id === id) listeners[key] = value;
        });

        return listeners;
    }

    getArtistListeners(user_id, id) {
        var listeners = {};

        this.instant_listeners.forEach((value, key) => {
            if(key != user_id)
                if(value.artist_id === id) listeners[key] = value;
        });

        return listeners;
    }

    getHome() {
        var all_artists = [];
        var all_tracks = [];
        var all_podcasts = [];
        
        this.toArray.forEach((value) => {
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

        return {
            _trend_artist: trend_artist,
            _all_podcasts: all_podcasts,
            _all_tracks: all_tracks
        };
    }
}

class InstantListeners {
    constructor() {
        throw new Error('Use InstantListeners.getInstance()');
    }
    static getInstance() {
        if (!InstantListeners.instance) {
            InstantListeners.instance = new PrivateInstantListeners();
        }
        return InstantListeners.instance;
    }
}

module.exports = InstantListeners;
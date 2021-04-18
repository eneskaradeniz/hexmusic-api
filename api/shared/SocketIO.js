require('dotenv').config();

const InstantListeners = require('../shared/InstantListeners').getInstance();

const db = require('mongoose');
const User = require('../models/UserModel');

const Error = require('../controllers/ErrorController');

class PrivateSocketIO {

    // SOCKET.IO CONFIGURATION

    constructor() {
        this.io = null;
    }

    connect_socket(socket) {
        try {
            var user_id = socket.decoded_token._id;
            console.log(`(${this.count})`, "CONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);

            // BU USERID LI BAŞKA SOCKET VARMI KONTROL ET
            var find_sockets = this.findSockets(user_id);

            find_sockets.forEach(x => {
                if(x.id !== socket.id) {
                    console.log('LOGOUT:', x.id);

                    x.emit('logout');
                    x.disconnect();
                }
            });  
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'connect_socket',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

    disconnect_socket(socket) {
        try {
            var user_id = socket.decoded_token._id;
            console.log(`(${this.count})`, "DISCONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);

            setTimeout(() => {
                const find_socket = this.findSocket(user_id);
                if(!find_socket) {
                    InstantListeners.delete(user_id);
                
                    this.stop_music(user_id);
                }
            }, 2000);
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'disconnect_socket',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

    start_typing(socket, data) {
        try {
            const user_id = socket.decoded_token._id;
            const { chat_id, participants } = data;
        
            const find_sockets = this.findSocketsByIds(participants);
            find_sockets.forEach(x => {
                x.emit('typing', {
                    is_typing: true,
                    chat_id,
                    user_id
                });

                setTimeout(() => {
                    x.emit('typing', {
                        is_typing: false,
                        chat_id,
                        user_id
                    });
                }, 2000);
            });
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'start_typing',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

    async stop_music(user_id) {
        const session = await db.startSession();

        try {
            await session.withTransaction(async () => {
                await User.updateOne({ _id: user_id, 'current_play.is_playing': true }, { 
                    'current_play.is_playing': false,
                    'current_play.timestamp': Date.now(),
                }).session(session);
            });
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'stop_music',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        } finally {
            session.endSession();
        }
    }

    // SOCKET.IO CLIENTS

    get count() {
        return this.io.engine.clientsCount;
    }

    findSocket(user_id) {
        var find_socket;

        for(let x in this.io.sockets.sockets) {
            const socket = this.io.sockets.sockets[x];
            if(socket.decoded_token._id === user_id) {
                find_socket = socket;
                break;
            }
        }

        return find_socket;
    }

    findSockets(user_id) {
        var find_sockets = [];

        for(let x in this.io.sockets.sockets) {
            const find_socket = this.io.sockets.sockets[x];
            if(find_socket.decoded_token._id === user_id) find_sockets.push(find_socket);  
        }

        return find_sockets;
    }

    findSocketsByIds(user_ids) {
        var find_sockets = [];

        for(let x in this.io.sockets.sockets) {
            const find_socket = this.io.sockets.sockets[x];
            if(user_ids.includes(find_socket.decoded_token._id)) find_sockets.push(find_socket);  
        }

        return find_sockets;
    }
}

class SocketIO {
    constructor() {
        throw new Error('Use SocketIO.getInstance()');
    }
    static getInstance() {
        if (!SocketIO.instance) {
            SocketIO.instance = new PrivateSocketIO();
        }
        return SocketIO.instance;
    }
}

module.exports = SocketIO;
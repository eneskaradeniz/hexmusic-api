require('dotenv').config();

const InstantListeners = require('../shared/InstantListeners').getInstance();

const db = require('mongoose');
const User = require('../models/UserModel');

const Error = require('../controllers/ErrorController');

class PrivateSocketIO {

    // SOCKET.IO CONFIGURATION

    constructor() {
        this.socket_io = null;
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

            InstantListeners.delete(logged_id);
            
            this.stop_music(user_id);

            console.log(`(${this.count})`, "DISCONNECT SOCKETID:USERID: " + socket.id + ":" + user_id);
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'leftUser',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

    start_typing(socket, data) {
        try {
            const user_id = socket.decoded_token._id;
            const { to } = data;
        
            const target_socket = this.findSocket(to);

            if(target_socket) {
                target_socket.emit('typing', {
                    is_typing: true,
                    user_id: user_id,
                });

                setTimeout(() => {
                    target_socket.emit('typing', {
                        is_typing: false,
                        user_id: user_id,
                    });
                }, 2000);
            }
        } catch(err) {
            Error({
                file: 'server.js',
                method: 'startTyping',
                title: err.toString(),
                info: err,
                type: 'critical',
            });
        }
    }

    async stop_music(logged_id) {
        const session = await db.startSession();

        try {
            await session.withTransaction(async () => {
                await User.updateOne({ _id: logged_id }, { 
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
        return this.socket_io.engine.clientsCount;
    }

    findSocket(user_id) {
        var find_socket;

        for(let x in this.socket_io.sockets.sockets) {
            const socket = this.socket_io.sockets.sockets[x];
            if(socket.decoded_token._id === user_id) {
                find_socket = socket;
                break;
            }
        }

        return find_socket;
    }

    findSockets(user_id) {
        var find_sockets = [];

        for(let x in this.socket_io.sockets.sockets) {
            const find_socket = this.socket_io.sockets.sockets[x];
            if(find_socket.decoded_token._id === user_id) find_sockets.push(find_socket);  
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
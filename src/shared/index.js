class Socket {

    static socket_io;

    static getSocketCount() {
        return this.socket_io.engine.clientsCount;
    }

    static findSocket(user_id) {
        const find_socket_id = Object.keys(this.socket_io.sockets.sockets).find(x => x.decoded_token._id === user_id);
        return this.socket_io.sockets.sockets[find_socket_id];
    }

    static findSockets(user_id) {
        var find_sockets = [];

        Object.keys(this.socket_io.sockets.sockets).forEach((x) => {
            const find_socket = this.socket_io.sockets.sockets[x];
            if(find_socket.decoded_token._id === user_id) find_sockets.push(find_socket);           
        });

        return find_sockets;
    }
}

module.exports = Socket;
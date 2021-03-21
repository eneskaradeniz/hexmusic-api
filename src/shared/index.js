class Socket {

    static socket_io;

    static getSocketCount() {
        return this.socket_io.engine.clientsCount;
    }

    static findSocket(user_id) {
        var find_socket;

        for(let x in this.socket_io.sockets.sockets) {
            console.log('helloo:', x);
            const socket = this.socket_io.sockets.sockets[x];
            if(socket.decoded_token._id === user_id) {
                console.log('buldu h.o');
                find_socket = socket;
                break;
            }
        }

        return find_socket;
    }

    static findSockets(user_id) {
        var find_sockets = [];

        for(let x in this.socket_io.sockets.sockets) {
            console.log('denemee:', x);

            const find_socket = this.socket_io.sockets.sockets[x];
            if(find_socket.decoded_token._id === user_id) find_sockets.push(find_socket);  
        }

        return find_sockets;
    }
}

module.exports = Socket;
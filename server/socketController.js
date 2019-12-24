// store refs to connected clients' RTC connections
const clientRTCConns = {};

function PeerInfo (peerId, socket) {
  this.peerId = peerId;
  this.socket = socket;
  this.layNo;
}

function socketController(server, socketLimit) {
  /**
   * server: Node Server
   * socketLimit: # of socket.io connections to keep
   */
  this.io = require('socket.io')(server);
  // will store socket connections to Viewers
  this.sockets = []; 
  
  /// all peer in this lalm.
  this.peers = new Map();

  this.io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // check # of clients
    // kick socket off client if full
    const checkClientNum = (err, clients) => {
      if (err) throw err;

      if (clients.length <= socketLimit) {
        // keep socket connection
        this.sockets.push(socket);
        console.log('Added sockets:', this.sockets.map(socket => socket.id));
      } else {
        socket.emit('full');
      }
    }

    this.io.sockets.clients(checkClientNum);

    // variable to bind socketController context in socket handlers
    // so that 'this' in socket handlers can access socket
    const self = this;

    // callee receives offer from new client
    socket.on('offer', function (offer) {
      // get socket id to send offer to
      const calleeSocket = getTargetSocket(self.sockets);
      const calleeId = calleeSocket && calleeSocket.id;

      // emit to root of client chain
      // callee socket's id maintained throughout signaling
      if (calleeId) {
        // get this socket's id
        const callerId = this.id;
        console.log('Emitting offer to callee:', calleeId);
        socket.to(calleeId).emit('offer', {
          callerId: this.id, 
          offer,
        });
      }
    });

    // caller receives answer from callee
    socket.on('answer', function (callerId, answer) {
      // emit this (callee) socket's id and answer to root of client chain
      // callee socket's id maintained throughout signaling
      console.log('Emitting answer to caller:', callerId);
      socket.to(callerId).emit('answer', {
        // MAKE TO: calleeId: this.id,
        calleeId: this.id,
        answer,
      });
    });

    // send peers in a WebRTC connection new ICE candidates
    socket.on('candidate', (peerId, candidate) => {
      console.log('Emitting candidate to peer:', peerId); 
      socket.to(peerId).emit('candidate', candidate);
    });

    socket.on('disconnect', function() {
      console.log(this.id, 'disconnected');
      self.sockets = self.sockets.filter(keptSocket => this.id !== keptSocket.id);
      console.log('Updated sockets:', self.sockets.map(socket => socket.id));
    });



    socket.on('signal', (from, to, data) => {
      console.log('signal to peer: ', peerId);
      let peer = peers.get(to);            
      peer && peer.socket.emit('signal', from, data);
    });

    socket.on('create', (peerId, almId) => {
      console.log(peerId, 'create a lalm');
      
      let pi = new PeerInfo;
      pi.peerId = peerId;
      pi.socket = socket;
      pi.layNo = 0;
      peers.set(peerId, pi);

      /// only support a lalm by now.
      socket.emit('createResp', 'success');
    });
    
    socket.on('join', (peerId, almId) => {
      console.log(peerId, 'join a lalm');
     
      /// only support a lalm by now.
      let layNo = 1;      
      socket.emit('joinResp', 'success', layNo, [...this.peers.keys()]);

      let pi = new PeerInfo;
      pi.peerId = peerId;
      pi.socket = socket;
      pi.layNo = layNo;
      peers.set(peerId, pi);
    });

    socket.on('quit', (peerId) => {
      console.log('quit, for peer: ', peerId);
      peers.delete(peerId);                  
    });
  });
}

socketController.prototype.emitNewMagnet = function(magnetURI) {
  this.io.emit('magnetURI', magnetURI);
}

// Determines socket of chain to connect to
// TODO: dummy func right now
function getTargetSocket(sockets) {
  return sockets[0];
}

module.exports = socketController;
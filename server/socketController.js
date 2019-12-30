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


    // 这里监听 disconnect，就可以知道谁断开连接了
    socket.on('disconnect',  () => {
        for (var value of this.peers.values()) {        
            if (value.socket == socket) {
                console.log('clear peer for quit socket, peer: ', value.peerId);
                this.peers.delete(value.peerId);
                return;
            }
        }
    });


    socket.on('signal', (from, to, data) => {
      console.log('signal from ' + from + ' to ', to);
      let peer = this.peers.get(to);            
      peer && peer.socket.emit('signal', from, data);
    });

    socket.on('create', (peerId, almId) => {
      console.log(peerId, 'create a lalm');
      
      let pi = new PeerInfo;
      pi.peerId = peerId;
      pi.socket = socket;
      pi.layNo = 0;
      this.peers.set(peerId, pi);

      /// only support a lalm by now.
      socket.emit('createResp', 'success');
    });
    
    socket.on('join', (peerId, almId) => {
      console.log(peerId, 'join a lalm');
     
      /// only support a lalm by now.
      let layNo = this.peers.length;      
      socket.emit('joinResp', 'success', layNo, [...this.peers.keys()]);

      let pi = new PeerInfo;
      pi.peerId = peerId;
      pi.socket = socket;
      pi.layNo = layNo;
      this.peers.set(peerId, pi);
    });

    
    /// send by peer node when quit.
    socket.on('quit', (peerId) => {
      console.log('quit, for peer: ', peerId);
      this.peers.delete(peerId);                  
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
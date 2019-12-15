import Message from './message';

// set peer connection to Mozilla PeerConnection if in Firefox
RTCPeerConnection = RTCPeerConnection || mozRTCPeerConnection;


/**
 * Wrapper class for RTC connection between parent and child viewers
 */
class Lalm {
  constructor(
    socket,
    isRoot,    
    opts
  ) {
    this.opts_ = opts;
    /*opts: {
      maxConns: Number, // Max number of connections
      nodeId: String|Buffer, // DHT protocol node ID (default=randomly generated)
      peerId: String|Buffer, // Wire protocol peer ID (default=randomly generated) 
      dht: Boolean|Object, // Enable DHT (default=true), or options object for DHT 
      }
*/
    // use as command transport
    this.socket_ = socket;

    // indicates whether this node is the root connecting to the server
    this.isRoot_ = isRoot;
    
    // event handlers for DataChannel messages
    this.messageHandlers_ = messageHandlers;
        
    // RTC DataChannel  use as media transport
    this.channel_;
    
    // Peer's socket ID
    this.peerId_;

    this.almId_;
  }
  
  create() {    
  }

  join(almId) {
  }
  
  getId() {
    return this.almId_;
  }

  //client.on('create', function (id) {}) 
  //client.on('error', function (err) {})

  quit(callback) {
    callback && callback(err);
  }

  // Total download speed , in bytes/sec.
  downloadSpeed() {}
  // Total upload speed , in bytes/sec.
  uploadSpeed() {}


  // send message by socket.io
  sendBySocket(event, ...args) {
    this.socket.emit(event, ...args);
  }

  logError(err) {
    console.error(err);
  }
}

export default Lalm;
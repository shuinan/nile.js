import Message from './message';
import Peer from 'simple-peer';

// set peer connection to Mozilla PeerConnection if in Firefox
RTCPeerConnection = RTCPeerConnection || mozRTCPeerConnection;

class PeerNode {
  constructor(id, layerNo, isInitiator, socket, onData) {
    this.socket_ = socket;
    this.id_ = id;
    this.layerNo_ = layerNo;
    this.isInitiator_ = isInitiator;
    this.dataChannelIsOk_ = false;     

    this.simplePeer_ = new SimplePeer({ initiator: !isInitiator });
    this.simplePeer_.on('signal', data => {
      // send signal to this peer by server(sock.io)
      this.sendBySocket('signal', this.id_, data);
      //peer2.signal(data)
    });

    this.simplePeer_.on('connect', () => {
      this.dataChannelIsOk_ = true;
    });
    this.simplePeer_.on('data', onData);
    this.simplePeer_.on('error', err => console.log('error', err));
  }

  
  // send message by socket.io  to server
  sendBySocket(event, ...args) {
    this.socket_.emit(event, ...args);
  }


  /// relied send mode
  sendMessage(msg) {
    this.simplePeer_.send(msg);
  }
  /// unrelied send mode
  sendData(data) {
    this.simplePeer_.send(data);
  }
}

/**
 * Wrapper class for RTC connection between parent and child viewers
 */
class Lalm {
  constructor(
    socket,    
    opts,
    onData
  ) {
    this.opts_ = opts;
    /*opts: {
      maxConns: Number, // Max number of connections
      nodeId: String|Buffer, // DHT protocol node ID (default=randomly generated)
      peerId: String|Buffer, // Wire protocol peer ID (default=randomly generated) 
      dht: Boolean|Object, // Enable DHT (default=true), or options object for DHT 
      }
*/
    this.almId_;    

    // indicates whether this node is the root connecting to the server
    this.isRoot_;
    
    // Peer's node ID
    this.peerId_;
    
    this.pusher_;// = new PeerNode();
    this.backupPusher_;// = new PeerNode();  
    this.partners_ = new Map(); /// id, PeerNode
    //this.
    this.receivers_ = new Set();  /// PeerNode

    this.socket_ = io.connect();
  

    /// cache data
    this.datas_ = new Map();  /// seq: data
  }
  
  create(almId) {    
    this.almId_ = almId;
    this.sendBySocket('create', peerId_, almId);
    isRoot_ = true;
    this.socket.on('createResp', this._onCreate.bind(this));
  }
  _onCreate(ret) {
    if (ret == 'success') {

    }
  }

  join(almId) {
    this.almId_ = almId;
    isRoot_ = false;
    this.socket.on('joinResp', this._onJoin.bind(this));
  }
  _onJoin(ret, layerNo, members) {
    if (ret == 'success') {
      
    }
  }
  
  getId() {
    return this.almId_;
  }

  //client.on('create', function (id) {}) 
  //client.on('error', function (err) {})

  quit(callback) {
    allback && callback();

    for (let peer of this.receivers_.values()) {
      peer.sendMessage('quit');
    }

    /// tell rp(server)
    this.sendBySocket('quit');
  }

  _onReceivedData(blob) 
  {
    /// chceck repeat;
    
    /// send to app;
    onData_ && onData(blob);

    /// send to receivers
    for (let peer of this.receivers_.values()) {
      peer.send(data);
    }
  }

  // Total download speed , in bytes/sec.
  downloadSpeed() {}
  // Total upload speed , in bytes/sec.
  uploadSpeed() {}
  

  logError(err) {
    console.error(err);
  }

  // send message by socket.io  to server
  sendBySocket(event, ...args) {
    this.socket_.emit(event, ...args);
  }
}

export default Lalm;
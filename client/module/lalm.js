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
    // indicates whether this node is the root connecting to the server
    this.isRoot_ = isRoot;
    
    // Peer's socket ID
    this.peerId_;

    this.almId_;

    // creates func to clear client connection when it disconnects
    this._createIceDisconnHandler = (connName) => () => {
    // have variable 
    // close client's RTC Peer Connection

      console.log('ICE disconnecting on:', connName);
      if (this[connName]) {
        this[connName].closeRTC();
        // clear connection
        this[connName] = null;

        // open socket if not already open and if from parent
        if (connName === 'connToParent') this.socket.disconnected && this.socket.open();
      }
    };

    // telling neighboring clients to reconnect
    const reconnectNeighbors = (event) => {
      // sending disconnecting message to each client
      for (let conn of ['connToParent', 'connToChild']) {
        if (this[conn]) {
          // if the connection exists, use opposite connection name
          // for example, if sending to parent on connToParent,
          // parent would be receiving message on connToChild so we'd use connToChild
          const oppConn = (conn === 'connToParent') ? 'connToChild' : 'connToParent';
          // send disconnection message telling peer on other end to disable the connection between this and them

          this[conn].sendMessage('disconnecting', {
            // will allow disconnected root to reassign root role to next client
            isRoot: this.isRoot,
            // tells neighboring clients which connection to disconnect
            disconnector: oppConn,
          });
        }
      };
    };

    // event handlers to pass to child client's DataChannel connection
    const childEventHandlers = {
      disconnecting: this._reconnectWithNeighbor.bind(this),
    };

    this.socket_ = io.connect();
    addedIceServers_ = [];
    // sending ICE disconnection handler
    // connToChild b/c this client will be a child for the parent it's connecting to
    const iceDisconnHandlerForParent = this._createIceDisconnHandler('connToParent');

    // create child connection
    this.dataChannel_ = new ViewerConnection(
      this.socket,
      this.isRoot,
      childEventHandlers,
      this.addedIceServers,
      iceDisconnHandlerForChild
    );
  }
  
  create() {    
    this.sendBySocket();
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
  

  logError(err) {
    console.error(err);
  }
}

export default Lalm;
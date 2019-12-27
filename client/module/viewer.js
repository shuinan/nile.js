// Install this.socket.io-client
// io object exposed from injected this.socket.io.js

// Have to require WebTorrent and not import, or there is a fs error from node.js
import WebTorrent from './webtorrent.min.js';
import io from 'socket.io-client';
import Lalm from './lalm.js';
import ViewerConnection from './viewerConnection';

// use WebRTC Adapter shim
require('webrtc-adapter');

/**
 * Viewer class concerned with streaming video from torrents
 * and managing WebSocket connection to server
 */

class Viewer {
  constructor(
    ID_of_NodeToRenderVideo, // location on the DOM where the live feed will be rendered
    addedIceServers = [], // array of ICE servers to use in WebRTC signaling
  ) {

    this.total = {
      'downloaded': 0,
      'uploaded': 0
    }
    
    // grab DOM elements where the torrent video will be rendered to
    this.ID_of_NodeToRenderVideo = ID_of_NodeToRenderVideo;
    // store list of ICE servers
    this.addedIceServers = addedIceServers;

    this.socket = io.connect();

    this.selfPeerId = "viewer" + Math.round(Math.random() * 100000);

    // initiate new  connection
    this.almClient = new Lalm(this.socket, {peerId: this.selfPeerId});
    
    // limit of child clients per client
    this.childLimit = 1;
    
    // progress trackers
    // this.$numPeers = document.querySelector('#numPeers')
    this.$downloaded = document.querySelector('#download')
    this.$uploaded = document.querySelector('#upoload')

    // create the video players on the document    
    this.createViewer();    
    this.$play = document.getElementById('viewer');
            
    // this.onProgress = this.onProgress.bind(this);

    this.setUpInitialConnection();

    // adding document unload listener : fires when this client's browser closes the page
    window.addEventListener('unload', ()=>{
      this.almClient.quit();
    });

    this.almClient.join("demo-alm");

    this.almClient.on('data', (data) => {
      this.$play1.src = window.URL.createObjectURL(data);
  
      // appends total uploaded to the value      
      this.total.uploaded = this.almClient.uploaded();
      this.total.downloaded = this.almClient.downloaded();
      
      // Trigger statistics refresh
      // setInterval(onProgress(torrent), 500);   
    });
    
    this.almClient.on('join', ret => console.log('Join result: ', ret) );
    this.almClient.on('error', err => console.log('Have error: ', err) );
  }

  setUpInitialConnection() {
    this.socket.on('connect', () => {
      console.log('Socket connected');
    });
    
    this.socket.on('disconnect', () => {});
  }
  
   
   // return the totals upload/download
  returnTotals() {
    return this.total;
  }

  createViewer() {
    let video = document.createElement('video');
    video.setAttribute('id', 'viewer');
    document.getElementById(this.ID_of_NodeToRenderVideo).appendChild(video);
  }
}

// export default Viewer
module.exports = Viewer
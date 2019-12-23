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
    
    // initiate new  connection
    this.almClient = new Lalm()
    
    // limit of child clients per client
    this.childLimit = 1;
    
    // progress trackers
    // this.$numPeers = document.querySelector('#numPeers')
    this.$downloaded = document.querySelector('#download')
    this.$uploaded = document.querySelector('#upoload')

    // create the video players on the document
    let players = document.createElement('div');
    let play1 = document.createElement('video');
    play1.setAttribute('id', 'player1');
    players.appendChild(play1);
    document.getElementById(this.ID_of_NodeToRenderVideo).appendChild(players);

    // video tag ID from html page
    this.$play1 = document.getElementById('player1');
        
    // this.onProgress = this.onProgress.bind(this);

    this.setUpInitialConnection();

    // adding document unload listener : fires when this client's browser closes the page
    window.addEventListener('unload', ()=>{
      this.almClient.quit();
    });

    this.almClient.join();
    this.almClient.on("", (data) => {

    });
  }

  setUpInitialConnection() {
    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    // start playing next in video tag trio
    this.socket.on('magnetURI', this._magnetURIHandler.bind(this));
        //offer: this._receiveOffer.bind(this),
    });
    
    // this.socket.on('disconnect', () => {});
  }

  _magnetURIHandler(magnetURI) {
    console.log('Got magnet');
    this.startStreaming('video#player1');    
  }

      this.connToChild.sendMessage('offer', { callerId, offer });
  
  
  // torrentId will change whenever the viewer is notified of the new magnet via websockets or WebRTC
  // this will also trigger event to check if this.isPlay1Playing true or false
  // and then it will either run the first download or the second download, torrent ID must be different

  // Function for downloading the torrent
  startStreaming(renderTo) {
    const $play1 = this.$play1; 
    let total = this.total;
  
     // appends total uploaded to the value
     total['uploaded'] = this.almClient.uploaded;

      // Stream the file in the browser
      if (first === 1) {
        window.setTimeout(() => file.renderTo(renderTo, { autoplay: true }), 7000);
      } else {
        file.renderTo(renderTo, { autoplay: false })
      }

       total['downloaded'] = this.almClient.downloaded;
      
      // Trigger statistics refresh
      // setInterval(onProgress(torrent), 500);
    

    // listen to when video ends, immediately play the other video
    currPlayer.onended = function () {
      curPlayer.play();
    };
  }
  
    // return the totals upload/download
  returnTotals() {
    return this.total;
  }
}

// export default Viewer
module.exports = Viewer
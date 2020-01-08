// Install this.socket.io-client
// io object exposed from injected this.socket.io.js

// Have to require WebTorrent and not import, or there is a fs error from node.js
import WebTorrent from './webtorrent.min.js';
import io from 'socket.io-client';
import Lalm from './lalm.js';


// use WebRTC Adapter shim
//require('webrtc-adapter');

/**
 * Viewer class concerned with streaming video from torrents
 * and managing WebSocket connection to server
 */

class Viewer {
    constructor(
        ID_of_NodeToRenderVideo, // location on the DOM where the live feed will be rendered
        addedIceServers = [] // array of ICE servers to use in WebRTC signaling
    ) {
        this.total = {
            downloaded: 0,
            uploaded: 0
        };

        // grab DOM elements where the torrent video will be rendered to
        this.ID_of_NodeToRenderVideo = ID_of_NodeToRenderVideo;
        // store list of ICE servers
        this.addedIceServers = addedIceServers;

        this.socket = io.connect();

        this.selfPeerId = "viewer" + Math.round(Math.random() * 100000);

        // initiate new  connection
        this.almClient = new Lalm(this.socket, { peerId: this.selfPeerId });

        // progress trackers
        // this.$numPeers = document.querySelector('#numPeers')
        this.$downloaded = document.querySelector("#download");
        this.$uploaded = document.querySelector("#upoload");

        // create the video players on the document
        this.createViewer();
        this.$play = document.getElementById("viewer");

        this.mediaSource = new MediaSource();
        this.sourceBuffer;
        this.mediaSource.addEventListener("sourceopen", event => {
            this.sourceBuffer = this.mediaSource.addSourceBuffer(
                "video/webm; codecs=opus,vp8"
            );
            console.log(
                "MediaSource opened, source buffer: ",
                this.sourceBuffer
            );
            this.sourceBuffer.mode = "sequence";
        });
        this.$play.src = window.URL.createObjectURL(this.mediaSource);
        //this.$play.play();

        // this.onProgress = this.onProgress.bind(this);

        this.setUpInitialConnection();

        // adding document unload listener : fires when this client's browser closes the page
        window.addEventListener("unload", () => {
            this.almClient.quit();
        });

        this.almClient.join("demo-alm");

        this.startPlay = false;
        this.waitForPlayDatas = [];
        this.haveKeyFrame = false;
        this.almClient.on("data", (isKeyFrame, data) => {
            if (!this.haveKeyFrame) {
                this.haveKeyFrame = isKeyFrame;                
            }
            //this.$play.src = window.URL.createObjectURL(data);
            if (this.haveKeyFrame) {
                this.showView(data);    
            }            

            // appends total uploaded to the value
            this.total.uploaded = this.almClient.uploaded();
            this.total.downloaded = this.almClient.downloaded();

            // Trigger statistics refresh
            // setInterval(onProgress(torrent), 500);
        });

        this.$play.onended = () => {
            if (this.waitForPlayDatas.length > 0) {
                this.$play.src = window.URL.createObjectURL(
                    this.waitForPlayDatas.shift()
                );
            }
        };

        this.almClient.on("join", ret => console.log("Join result: ", ret));
        this.almClient.on("error", err => console.log("Have error: ", err));
    }

    setUpInitialConnection() {
        this.socket.on("connect", () => {
            console.log("Socket connected");
        });

        this.socket.on("disconnect", () => {});
    }

    showView(data) {
        this.waitForPlayDatas.push(data);

        let that = this;
        that.sourceBuffer.addEventListener("updateend", () => {
            console.log("end of update.....");

            if (!that.sourceBuffer.updating) {
                //设置持续时间
                try {
                    that.mediaSource.duration = 500; //初始加载5s
                } catch (e) {
                    console.log(e);
                }
            }
        });

        if (that.$play.paused) {
            console.log(
                "paused, media source state: ",
                this.mediaSource.readyState
            );
            //that.$play.play();
        }

        const buffered_time_limit = 2000;
        if (that.$play.buffered.length &&
            that.$play.buffered.end(that.$play.buffered.length - 1) - that.$play.buffered.start(0) > buffered_time_limit) {
            console.log(
                "clear buffer from 0 to " +
                    (that.$play.buffered.end(that.$play.buffered.length - 1) -
                        buffered_time_limit)
            );
            that.sourceBuffer.remove(
                0,
                that.$play.buffered.end(that.$play.buffered.length - 1) -
                    buffered_time_limit
            );
        }

        if (!that.sourceBuffer.updating) {
        //that.fetchAB(data, buf => {
            console.log("media source state: ", that.mediaSource.readyState);
            console.log("data len: " + data.byteLength);
            //that.sourceBuffer.appendBuffer(buf);
            that.sourceBuffer.appendBuffer(this.waitForPlayDatas.shift());
        //});
        }
    }

    // return the totals upload/download
    returnTotals() {
        return this.total;
    }

    createViewer() {
        let video = document.createElement("video");
        video.setAttribute("id", "viewer");
        video.width = 640;
        video.height = 480;
        video.autoplay = true;
        video.controls = true;
        //    video.playsinline = true;
        document
            .getElementById(this.ID_of_NodeToRenderVideo)
            .appendChild(video);
    }
}

// export default Viewer
module.exports = Viewer

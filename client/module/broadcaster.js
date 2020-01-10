// import * as WebTorrent from 'webtorrent';
// import * as MediaStreamRecorder from 'msr';
import WebTorrent from './webtorrent.min.js';
import MediaStreamRecorder from 'msr';
import io from 'socket.io-client';
import Lalm from './lalm.js';


class Broadcaster {
  constructor(
    recordInterval, // the Interval that the webcam recording should seed each segment of the video
    ID_of_NodeToRenderVideo, // The id where the video node is being appended to
    startStreamID, // The id of the button node that BEGINS the recording/live streaming
    stopStreamID // The id of the button node that ENDS the recording/live streaming
  ) {
    this.recordInterval = recordInterval; // interval to record video at (in ms)
    this.ID_of_NodeToRenderVideo = ID_of_NodeToRenderVideo;
    this.startStreamID = startStreamID;
    this.stopStreamID = stopStreamID;

    this.videoStream = null;

    this.socket = io.connect();

    this.selfPeerId = "broadcaster" + Math.round(Math.random() * 100000);
    
    this.createBroadcast();

    this.$video = document.getElementById('broadcaster');

/*
    this.mediaSource = new MediaSource();
    this.sourceBuffer;
    this.mediaSource.addEventListener('sourceopen', (event) => {
        this.sourceBuffer = this.mediaSource.addSourceBuffer('video/webm; codecs=opus,vp8');
        console.log('MediaSource opened, source buffer: ', this.sourceBuffer);  
        this.sourceBuffer.mode = 'sequence';
      });
    this.$video.src = window.URL.createObjectURL(this.mediaSource);
    //this.$video.play();
*/
    this.count = 0;
    this.startStream();
  }
    
  /// create lalm
  startStream() {
    const _recordInterval = this.recordInterval;    
    let videoStream = this.videoStream;
    let $video = this.$video;

    let almBroadcaster;
    let dataNo = 1;

    // mute audio
    this.$video.defaultMuted = true;

    // when pressing the play button, start recording
    document.getElementById(`${this.startStreamID}`).addEventListener('click', () => {
      almBroadcaster = new Lalm(this.socket, {peerId: this.selfPeerId});

      // check for if an error occurs, if it does, garbage collection and return error
      almBroadcaster.on('error', function (err) {
        console.log('lalm has encountered an error', err)
      })

      almBroadcaster.create("demo-alm");
      almBroadcaster.on('create', ret => console.log('Create result: ', ret) );
      almBroadcaster.on('error', err => console.log('Have error: ', err) );

      var mediaConstraints = {
        audio: true,
        video: true
      };

      // begin using the webcam
      navigator.getUserMedia(mediaConstraints, onMediaSuccess, onMediaError);
      
      function startRecording(stream) {        
        let options = {mimeType: 'video/webm;codecs=vp8'};
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.error(`${options.mimeType} is not Supported`);
            options = {mimeType: 'video/webm;codecs=vp9'};
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.error(`${options.mimeType} is not Supported`);
                options = {mimeType: 'video/webm'};
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.error(`${options.mimeType} is not Supported`);
                    options = {mimeType: ''};
                }
            }
        }

        let mediaRecorder;
        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            console.error('Exception while creating MediaRecorder:', e);      
            return;
        }           

        console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
        mediaRecorder.ondataavailable = (e) => {
            // make unique no for this blob 
            //blob.seq = dataNo++;
            if (e.data.size <= 1) {
                console.log('data size is too litle: ', e.data.size);
             //   return;
            }
            almBroadcaster.send(e.data);            
        };
        mediaRecorder.start(); // collect 100ms of data
        console.log('MediaRecorder started', mediaRecorder);

//        function RecordLoop(){
 //           mediaRecorder.stop();
  //          mediaRecorder.start();            
    //    }
      //  window.setInterval(RecordLoop, 500);
      }

      
      function onMediaSuccess(stream) {
          console.log("start media.");
  //        startRecording(stream);

        let mediaRecorder = new MediaStreamRecorder(stream);
        mediaRecorder.mimeType = 'video/webm';
        // every _recordInterval, make a new torrent file and start seeding it
        mediaRecorder.ondataavailable = function (blob) {
          // make unique no for this blob 
          //blob.seq = dataNo++;
          almBroadcaster.send(blob);          
        };
        // record a blob every _recordInterval amount of time      
        mediaRecorder.start(_recordInterval);


        // retrieve the devices that are being used to record
        videoStream = stream.getTracks();

        // play back the recording to the almBroadcaster
        try{
          $video.src = window.URL.createObjectURL(stream);
        }catch(e){
          $video.srcObject = stream;
        }        
        $video.play();
      }

      function onMediaError(e) {
        console.error('media error', e);
      }
    })

    // when the user pauses the video, stop the stream and send data to server
    document.getElementById(`${this.stopStreamID}`).addEventListener('click', () => {
      // Pause the video
      $video.pause();

      // stops the the audio and video from recording
      videoStream.forEach((stream) => stream.stop());

      // destroys the broadcasting client and starts back at the beginning
      almBroadcaster.quit(function () {
        console.log('Stop broadcast.')
      })
    });
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

  createBroadcast() {
    let video = document.createElement('video');
    video.setAttribute('id', 'broadcaster');
    video.autoplay = true
    video.controls = true
    document.getElementById(this.ID_of_NodeToRenderVideo).appendChild(video);
  }
}

// export default Broadcaster
module.exports = Broadcaster

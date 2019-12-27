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

      function onMediaSuccess(stream) {
          console.log("start media.");

        let mediaRecorder = new MediaStreamRecorder(stream);
        // record a blob every _recordInterval amount of time
        mediaRecorder.start(_recordInterval);
        mediaRecorder.mimeType = 'video/webm';

        // every _recordInterval, make a new torrent file and start seeding it
        mediaRecorder.ondataavailable = function (blob) {
          // make unique no for this blob 
          blob.seq = dataNo++;
          almBroadcaster.send(blob);          
        };

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

  createBroadcast() {
    let video = document.createElement('video');
    video.setAttribute('id', 'broadcaster');
    document.getElementById(this.ID_of_NodeToRenderVideo).appendChild(video);
  }
}

// export default Broadcaster
module.exports = Broadcaster
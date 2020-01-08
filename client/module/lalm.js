import Message from "./message";
import SimplePeer from "simple-peer";
import EventEmitter from "wolfy87-eventemitter";

// set peer connection to Mozilla PeerConnection if in Firefox
RTCPeerConnection = RTCPeerConnection || mozRTCPeerConnection;

// / for push response
const PUSH_RESP_OK = 0; // ok or repeat
const PUSH_RESP_LAYER_LOW = 1;
const PUSH_RESP_PUSHER = 2;
const PUSH_RESP_NO_RESOURCE = 3;

class PeerNode {
    constructor(hostId, peerId, layerNo, isInitiator, callbacks) {
        this.hostId_ = hostId;
        this.peerId_ = peerId;
        this.layerNo_ = layerNo;
        this.isInitiator_ = isInitiator;
        this.dataChannelIsOk_ = false;
        this.callbacks_ = callbacks;
        this.isKeyFrame = false;

        this.simplePeer_ = new SimplePeer({ initiator: isInitiator });
        this.simplePeer_.on("signal", data => {
            console.log("send signal");

            // send signal to this peer by server(sock.io)
            this.callbacks_.onSignal(this.peerId_, data);
            // peer2.signal(data)
        });

        this.simplePeer_.on("connect", () => {
            this.dataChannelIsOk_ = true;
            this.callbacks_.onConnect && this.callbacks_.onConnect(this);           
        });
        this.simplePeer_.on("error", (err) => {
            this.dataChannelIsOk_ = false;
            this.callbacks_.onError && this.callbacks_.onError(this, err);
        });
        this.simplePeer_.on("data", data => {
            if (data.type && data.type != "data") {
                if (data.type == 'isKeyFrame') {
                    this.isKeyFrame = true;
                } else {
                    this.callbacks_.onMsg && this.callbacks_.onMsg(this, data);
                }
            } else {
                this.callbacks_.onData && this.callbacks_.onData(this, this.isKeyFrame, data);
                this.isKeyFrame = false;
            }
        });
        
        this.simplePeer_.on("close", () => {
            this.callbacks_.onClose && this.callbacks_.onClose(this);
        });
    }
    isInitiator() {
        return this.isInitiator_;
    }
    getPeerId() {
        return this.peerId_;
    }
    getLayerNo() {
        return this.layerNo_;
    }
    setLayerNo(layerno) {
        this.layerNo_ = layerno;
    }

    signal(data) {
        console.log("received signal");
        this.simplePeer_.signal(data);
    }

    // / relied send mode
    sendMessage(msg) {
        this.simplePeer_.send(msg);
    }
    // / unrelied send mode
    sendData(data) {
        this.simplePeer_.send(data);
    }
}

/**
 * provide alm transform
 * interface:
 *      create  create this alm
 *      join    join this alm
 *      quit    stop this alm
 *      send    send data by alm
 * event:
 *      'create', ret
 *      'join', ret
 *      'error', err
 *      'data', blob
 */
class Lalm extends EventEmitter {
    constructor(socket, opts = {}) {
        super();
        this.opts_ = opts;
        /* opts: {
            maxConns: Number, // Max number of connections
            nodeId: String|Buffer, // DHT protocol node ID (default=randomly generated)
            peerId: String|Buffer, // Wire protocol peer ID (default=randomly generated) 
            dht: Boolean|Object, // Enable DHT (default=true), or options object for DHT       
            }
        */
        this.almId_;
        this.layerNo_ = 1;  // 层次的模糊计算

        // indicates whether this node is the root connecting to the server
        this.isRoot_;

        this.total = {
            downloaded: 0,
            uploaded: 0
        };

        // Peer's node ID
        if (typeof opts.peerId === "string") {
            this.selfPeeId_ = opts.peerId;
        } /* else if (Buffer.isBuffer(opts.peerId)) {
            this.selfPeeId_ = opts.peerId.toString('hex')
            } else {
            this.selfPeeId_ = Buffer.from(VERSION_PREFIX + randombytes(9).toString('base64')).toString('hex')
            } */

        // / 数据源：下面的互不交叉
        this.pusher_; // = new PeerNode();
        this.backupPusher_; // = new PeerNode();
        this.partners_ = new Map(); // id, PeerNode; active and webrtc datachannel is ok;
        // this.hisPeers = new Set();      // lrumap

        this.receivers_ = new Map(); // PeerNode

        this.candidates_ = new Map(); // peerNodes, all peer get from server or partners;

        this.socket_ = socket;
        this.socket_.on("signal", (from, data) => {
            let peer = this._findPeerNode(from);
            if (!peer) {
                console.log("Received signal from RP, create peer node for not find user: ", from);

                // / if receive offer ...
                peer = new PeerNode(
                    this.selfPeeId_,
                    from,
                    -1,
                    false,
                    this.peerCallbacks_
                );
                this.candidates_.set(from, peer);
                console.log('find this peer:', this.candidates_.has(from));
                console.log('onSignal,candidate size： ', this.candidates_.size);
            }
            peer.signal(data);
        });

        this.peerCallbacks_ = {
            onSignal: this._onPeerSignal.bind(this),
            onData: this._onPeerReceivedData.bind(this),
            onMsg: this._onPeerReceivedMessage.bind(this),
            onConnect: this._onPeerConnect.bind(this),
            onError: this._onPeerError.bind(this),
            onClose: this._onPeerClose.bind(this)            
        };

        this.lastSeq_ = 0; // 收到的数据包最后的一个编号，  以后考虑中间补包的情况， 如果是0表示下发者可以从当前收包编号开始

        // / cache data
        this.datas_ = new Map(); // / seq: data

        const SELF_CHECK_TIME = 500; // ms
        this.timerId = setInterval(() => this._onTimeCheck, SELF_CHECK_TIME);
    }
    deconstructor() {
        clearInterval(this.timerId);
    }

    _isPeerExisted(peer) {
        return (
            (this.pusher_ && peer == this.pusher_.getPeerId()) ||
            (this.backupPusher_ &&
                peer == this.backupPusher_.getPeerId()) ||
            this.partners_.has(peer) ||
            this.candidates_.has(peer) ||
            this.receivers_.has(peer)
        );
    }
    _findPeerNode(peerId) {
        if (this.pusher_ && peerId == this.pusher_.getPeerId())
            return this.pusher_;
        if (this.backupPusher_ && peerId == this.backupPusher_.getPeerId()) {
            return this.backupPusher_;
        }
        if (this.partners_.has(peerId)) return this.partners_.get(peerId);
        if (this.candidates_.has(peerId)) return this.candidates_.get(peerId);
        if (this.receivers_.has(peerId)) return this.receivers_.get(peerId);
    }

    create(almId) {
        this.almId_ = almId;
        this.sendBySocket("create", this.selfPeeId_, almId);
        this.isRoot_ = true;
        this.layerNo_ = 0;
        this.socket_.on("createResp", this._onCreate.bind(this));
    }
    _onCreate(ret) {
        console.log("received create response.");
        this.emit("create", ret);
    }

    join(almId) {
        this.almId_ = almId;
        this.isRoot_ = false;
        this.sendBySocket("join", this.selfPeeId_, almId);
        this.socket_.on("joinResp", this._onJoin.bind(this));
    }
    _onJoin(ret, layerNo, members) {
        console.log("received join response, members: ", members.length);

        this.emit("join", ret);

        this.layerNo_ = layerNo;

        if (ret == "success") {            
            for (const peerInfo of members) {  
                if (peerInfo.peerId == this.selfPeeId_) {
                    console.log('Why self info!');
                    continue;
                }              
                if (!this._isPeerExisted(peerInfo.peerId)) {
                    const peerNode = new PeerNode(
                        this.selfPeeId_,
                        peerInfo.peerId,
                        peerInfo.layerNo,
                        true,
                        this.peerCallbacks_
                    );
                    this.candidates_.set(peerInfo.peerId, peerNode);

                    console.log("Add a candidate: ", peerInfo);
                } else {
                    console.log("Peer is already existed: ", peerInfo);
                }
            }
        }
    }

    getId() {
        return this.almId_;
    }

    quit(callback) {
        callback && callback();

        for (const peer of this.receivers_.values()) {
            peer.sendMessage({ type: "quit" });
        }

        // / tell rp(server)
        this.sendBySocket("quit");
    }

    _onTimeCheck() {}

    _onPeerClose(peer) {
        console.log('close for user', peer.getPeerId());
        this._peerQuit(peer);
    }
    _onPeerError(peer, err) {
        console.log('error', err);        
        this._peerQuit(peer);
    }
    _onPeerConnect(peer) {
        const peerId = peer.getPeerId();

        if (peer.isInitiator()) {
            peer.sendMessage({ type: "desc", info: {layerNo: this.layerNo_} });
        }

        // avoid loop
        // 先安排好，后续根据响应情况来确定是否替换； 要有超时机制
        // 发现，viewer peer connection onopen后， 对方（例如broadcast）还没有onopen，先收到对方的pushreq，后onopen
        console.log('onopenconnect, candidate size： ', this.candidates_.size);
        if (!this.isRoot_ && this.candidates_.has(peerId)) {        
            if (peer.isInitiator() && (peer.getLayerNo() < this.layerNo_)) {
                if (!this.pusher_) {
                    // peer
                    peer.sendMessage({
                        type: "pushReq",
                        layer: this.layerNo_,
                        startSeq: this.lastSeq_
                    });
                    this.pusher_ = peer;
                } else if (!this.backupPusher_) {
                    this.backupPusher_ = peer;
                } else {
                   //  assert(!this.partners_.has(peerId));
                    this.partners_.set(peerId, peer);
                }

                this.candidates_.delete(peerId);
            }

            console.log('A peer with id:'+ peerId +', data channel is ok, my layno is '+this.layerNo_+', candidate of layno is '+peer.getLayerNo());            
        } else {
            if (!this.isRoot_) {
                console.log("user is not candicated, when user connect: ", peerId);
            }
        }
    }
    _onPeerSignal(peerId, data) {
        this.sendBySocket("signal", this.selfPeeId_, peerId, data);
    }
    _onPeerReceivedMessage(from, msg) {
        const fromId = from.getPeerId();
        console.log(`Received peer message: ${msg.type} from: ${fromId}`);
        switch (msg.type) {
            case "quit":
                this._peerQuit(from);                
                break;

            case "pushReq":
                if ((this.pusher_ && from == this.pusher_) ||
                    (this.backupPusher_ && from == this.backupPusher_)) {
                    console.log("pusher can not be receiver: ", fromId);
                    from.sendMessage({
                        type: "pushResp",
                        code: PUSH_RESP_PUSHER,
                        info: "Is pusher"
                    });
                } else if (this.partners_.has(fromId) || this.candidates_.has(fromId)) {
                    console.log(`receive push req from user: ${fromId}, layno: ${msg.layer}.`);
                    from.setLayerNo(msg.layer);
                    if (msg.layer >= this.layerNo_) {
                        if (this.receivers_.size > 2) {
                            from.sendMessage({
                                type: "pushResp",
                                code: PUSH_RESP_NO_RESOURCE
                            });
                        } else {
                            from.sendMessage({
                                type: "pushResp",
                                code: PUSH_RESP_OK
                            });

                            /// move to receivers
                            console.log('add a receive: ', fromId);
                            this.receivers_.set(fromId, from);
                            this.candidates_.delete(fromId);
                            this.partners_.delete(fromId);

                            /// push data from msg.startSeq from cache
                        }
                    } else {
                        from.sendMessage({
                            type: "pushResp",
                            code: PUSH_RESP_LAYER_LOW
                        });
                    }
                }

                if (this.receivers_.has(fromId)) {
                    console.log('send pushresp');
                    from.sendMessage({ type: "pushResp", code: PUSH_RESP_OK });
                } else {
                    console.log("User is not existed when handle pushReq.");
                }
                break;

            case "pushResp":
                switch (msg.code) {
                    case PUSH_RESP_OK:
                        break;
                    case PUSH_RESP_PUSHER:
                    case PUSH_RESP_LAYER_LOW:
                    case PUSH_RESP_NO_RESOURCE:
                        if (this.pusher_ && from == this.pusher_) {
                            this.pusher_ = null;
                            this.partners_.set(fromId, this.pusher_);
                        } else if (this.backupPusher_ && from == this.backupPusher_) {
                            this.partners_.set(fromId, this.backupPusher_);
                            this.backupPusher_ = null;
                        } else {
                            console.log(
                                "send push req at invalid peer ",
                                fromId
                            );
                        }

                        this._updatePusher();

                        break;
                }
                break;
            case "desc":
                from.setLayerNo(msg.info.layerNo);
                break;
            default:
        }
    }
    _onPeerReceivedData(from, isKeyFrame, data) {
        // / chceck repeat;
        ///console.log(`Received data from ${from} with seq: `, blob.seq);
        console.log('received data');

        // / send to app; 
        this.emit("data", isKeyFrame, data);
        //var blob = new Blob([data], {type: "video/webm; codecs=opus,vp8"});               
        //this.emit("data", blob);

        // 以后考虑乱序的情况，需要根据buffer来确定。
        ///this.lastSeq_ = data.seq;

        this._relay(isKeyFrame, data);
    }    
    _relay(isKeyFrame, data)
    {
        // / send to receivers
        console.log('relay data to receivers: ', this.receivers_.size);
        for (const peer of this.receivers_.values()) {
            if (isKeyFrame) {
                peer.sendMessage({type: "isKeyFrame"});
            }
            peer.sendData(data);
        }
    }
    send(isKeyFrame, data) {        
        ///this.lastSeq_ = data.seq;
        ///console.log("Send data with seq: ", data.seq);
        //data.type = "data";    
     
        console.log('send data, len: ', data.size);   
        
        this.fetchAB(data, (buf) => {             
            this._relay(isKeyFrame, buf);
        });        
    }

    fetchAB (file, cb) {
        let reader = new FileReader();
        reader.onload = function(e) {
            console.log(e.target.result);
            if(e.target.result.byteLength > 0) {        
                cb(new Uint8Array(e.target.result));
            }
        }
        reader.readAsArrayBuffer(file);
    }

    _peerQuit(peer) {
        const peerId = peer.getPeerId();
        if (this.pusher_ && peer == this.pusher_) {
            this.pusher_ = null;
        } else if (this.backupPusher_ && peer == this.backupPusher_) {                    
            this.backupPusher_ = null;
        } else if (this.partners_.has(peerId)) {
            this.partners_.delete(peerId);
        } else if (this.candidates_.has(peerId))
            this.candidates_.delete(peerId);
        else if (this.receivers_.has(peerId)) {
            this.receivers_.delete(peerId);
        }
        this._updatePusher();
    }

    _updatePusher() {
        if (!this.pusher_) {
            if (this.backupPusher_) {
                this.pusher_ = this.backupPusher_;
            }
            else if (this.partners_.length > 0) {
                const firstKey = this.partners_.keys().next().value;
                this.pusher_ = this.partners_.get(firstKey);
                this.partners_.delete(firstKey);
            }

            if (this.pusher_) {
                console.log('Select a new pusher.');
                
                this.pusher_.sendMessage({
                    type: "pushReq",
                    layer: this.layerNo_,
                    startSeq: this.lastSeq_
                });
            }
        }
        
        return;        
        if (!this.backupPusher_) {
            if (this.partners_.length > 0) {
                this.pusher_ = this.partners_;
                this.partners_.delete();
            }
            peer.sendMessage({
                type: "pushReq",
                layer: this.layerNo_,
                startSeq: this.lastSeq_
            });
        }
    }

    // Total download speed , in bytes/sec.
    downloadSpeed() {}
    // Total upload speed , in bytes/sec.
    uploadSpeed() {}
    downloaded() {
        return this.total.downloaded;
    }
    uploaded() {
        return this.total.uploaded;
    }

    logError(err) {
        console.error(err);
    }

    // send message by socket.io  to server
    sendBySocket(event, ...args) {
        this.socket_.emit(event, ...args);
    }
}

export default Lalm;

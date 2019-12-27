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

        this.simplePeer_ = new SimplePeer({ initiator: isInitiator });
        this.simplePeer_.on("signal", data => {
            console.log("send signal");

            // send signal to this peer by server(sock.io)
            this.callbacks_.onSignal(this.peerId_, data);
            // peer2.signal(data)
        });

        this.simplePeer_.on("connect", () => {
            this.dataChannelIsOk_ = true;
            this.callbacks_.onConnect && this.callbacks_.onConnect(this.peerId_);
        });
        this.simplePeer_.on("error", () => {
            this.dataChannelIsOk_ = false;
            this.callbacks_.onError && this.callbacks_.onError(this.peerId_);
        });
        this.simplePeer_.on("data", data => {
            if (data.type && data.type != "data") {
                this.callbacks_.onData && this.callbacks_.onMsg(this, data);
            } else {
                this.callbacks_.onMsg && this.callbacks_.onData(this, data);
            }
        });
        this.simplePeer_.on("error", err => console.log("error", err));
    }

    getPeerId() {
        return this.peerId_;
    }
    getLayerNo() {
        return this.layerNo_;
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
                console.log("Received signal from RP, can not find user: ", from);

                // / if receive offer ...
                peer = new PeerNode(
                    this.selfPeeId_,
                    from,
                    -1,
                    false,
                    this.peerCallbacks_
                );
                this.candidates_.set(from, peer);
            }
            peer.signal(data);
        });

        this.peerCallbacks_ = {
            onSignal: this._onPeerSignal.bind(this),
            onData: this._onPeerReceivedData.bind(this),
            onMsg: this._onPeerReceivedMessage.bind(this),
            onConnect: this._onPeerConnect.bind(this),
            onError: this._onPeerError.bind(this)
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
            (this.pubackupPusher_ &&
                peer == this.pubackupPusher_.getPeerId()) ||
            this.partners_.has(peer) ||
            this.candidates_.has(peer) ||
            this.receivers_.has(peer)
        );
    }
    _findPeerNode(peer) {
        if (this.pusher_ && peer == this.pusher_.getPeerId())
            return this.pusher_;
        if (this.pubackupPusher_ && peer == this.pubackupPusher_.getPeerId()) {
            return this.pubackupPusher_;
        }
        if (this.partners_.has(peer)) return this.partners_.get(peer);
        if (this.candidates_.has(peer)) return this.candidates_.get(peer);
        if (this.receivers_.has(peer)) return this.receivers_.get(peer);
    }

    create(almId) {
        this.almId_ = almId;
        this.sendBySocket("create", this.selfPeeId_, almId);
        this.isRoot_ = true;
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
            /// peer ....   peerInfo
            for (const peer of members) {
                if (!peer) {
                    console.log("peer is invalid.");
                    continue;
                }

                if (!this._isPeerExisted(peer)) {
                    const peerNode = new PeerNode(
                        this.selfPeeId_,
                        peer,
                        layerNo,
                        true,
                        this.peerCallbacks_
                    );
                    this.candidates_.set(peer, peerNode);

                    console.log("find a candidate: ", peer);
                } else {
                    console.log("peer is already existed: ", peer);
                }
            }
        }
    }

    getId() {
        return this.almId_;
    }

    quit(callback) {
        allback && callback();

        for (const peer of this.receivers_.values()) {
            peer.sendMessage({ type: "quit" });
        }

        // / tell rp(server)
        this.sendBySocket("quit");
    }

    _onTimeCheck() {}
    _onPeerError(peerId, err) {}
    _onPeerConnect(peerId) {
        // avoid loop
        // 先安排好，后续根据响应情况来确定是否替换； 要有超时机制
        if (this.candidates_.has(peerId)) {
            const peer = this.candidates_.get(peerId);
            if (peer.getLayerNo() >= this.layerNo_) {
                if (!this.pusher_) {
                    // peer
                    peer.sendMessage({
                        type: "pushReq",
                        startSeq: this.lastSeq_
                    });
                    this.pusher_ = peer;
                } else if (!this.backupPusher_) {
                    this.backupPusher_ = peer;
                } else {
                    assert(!this.partners_.has(peerId));
                    this.partners_.set(peerId, peer);
                }
            }

            console.log(
                "A peer with id: ${peerId}, data channel is ok, my layno is ${this.layerNo_}, candidate of layno is ",
                peer.getLayerNo()
            );
            this.candidates_.delete(peerId);
        } else {
            console.log("user is not existed, when user connect: ", peerId);
        }
    }
    _onPeerSignal(peerId, data) {
        this.sendBySocket("signal", this.selfPeeId_, peerId, data);
    }
    _onPeerReceivedMessage(from, msg) {
        const fromId = from.getPeerId();
        console.log(`Received peer message: ${msg} from: ${fromId}`);
        switch (msg.type) {
            case "quit":
                if (this.pusher_ && from == this.pusher_) {
                    this.pusher_ = this.pubackupPusher_;
                } else if (
                    this.pubackupPusher_ &&
                    from == this.pubackupPusher_
                ) {
                    this.backupPusher_ = selectBackupPusher();
                } else if (this.partners_.has(fromId)) {
                    this.partners_.delete(fromId);
                } else if (this.candidates_.has(fromId))
                    this.candidates_.delete(fromId);
                else if (this.receivers_.has(fromId))
                    this.receivers_.delete(fromId);
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
                    if (from.getLayerNo() < this.layerNo_) {
                        if (this.receivers_.size() > 2) {
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
                            this.receivers_.set(fromId, from);
                            this.candidates_.delete(fromId);
                            this.partners_.delete(fromId);

                            // / push data from msg.startSeq from cache
                        }
                    } else {
                        from.sendMessage({
                            type: "pushResp",
                            code: PUSH_RESP_LAYER_LOW
                        });
                    }
                }
                if (this.receivers_.has(from)) {
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
                            this.pusher_ = this.pubackupPusher_;
                        } else if (
                            this.pubackupPusher_ &&
                            from == this.pubackupPusher_
                        ) {
                            this.backupPusher_ = selectBackupPusher();
                        } else if (this.partners_.has(fromId)) {
                            //this.partners_.delete(fromId);
                        } else {
                            console.log(
                                "send push req at invalid peer ",
                                fromId
                            );
                        }
                        break;
                }
                break;

            default:
        }
    }
    _onPeerReceivedData(from, blob) {
        // / chceck repeat;
        console.log("Received data with seq: ", blob.seq);

        // / send to app;
        this.emit("data", blob);

        this.send(blob);
    }

    send(data) {
        // 以后考虑乱序的情况，需要根据buffer来确定。
        this.lastSeq_ = data.seq;
        console.log("Send data with seq: ", data.seq);

        //data.type = "data";

        // / send to receivers
        for (const peer of this.receivers_.values()) {
            peer.sendData(data);
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

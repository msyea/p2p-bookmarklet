const { encodeToken, decodeToken } = require("./utils");

const MODE_REQUESTOR = "MODE_REQUESTOR";
const MODE_RESPONDER = "MODE_RESPONDER";
module.exports = class Client {
  constructor(config) {
    const rtcConfig = {}; // { iceServers: [{ url: "stun:stun.gmx.net" }] };
    this.pc = new RTCPeerConnection(rtcConfig);
    this.dc;
    this.addPcEvents();
    this.state = {
      mode: null
    };
    this.plugins = [];
  }
  addPcEvents() {
    this.pc.addEventListener("icecandidate", this.onIceCandidate.bind(this));
    this.pc.addEventListener("datachannel", this.onDataChannel.bind(this));
    this.pc.addEventListener("track", this.onTrack.bind(this))
  }
  async onIceCandidate(evt) {
    if (evt.candidate == null) {
      prompt(
        "Please share this token to your partner and click [OK].",
        encodeToken(this.pc.localDescription)
      );
      if (this.state.mode === MODE_REQUESTOR) {
        await this.receiveToken()
      }
    }
  }
  onDataChannel(evt) {
    if (this.state.mode === MODE_RESPONDER) {
      this.dc = evt.channel || evt;
      console.log("seting dc", this.state.mode, "dc");
      this.dc.addEventListener("open", this.onChannelOpen.bind(this));
      this.dc.addEventListener("message", this.onMessage.bind(this));
    }
  }
  onTrack(evt) {
    console.log("pcontrack", evt);
  }
  onMessage(evt) {
    const payload = JSON.parse(evt.data);
    // call each plugin with incoming message
    const plugins = this.plugins.filter(plugin => plugin(payload));
    if (payload.message) {
      console.log(`[Partner] ${payload.message}`);
    } else if (!plugins.length) {
      // only 🤮 evt if it's not picked up by plugin
      console.log(evt);
    }
  }
  onChannelOpen() {
    console.log("channel open");
    this.setupPlugins();
    this.setupAudio();
  }
  async connect() {
    const requestOrRespond = confirm(
      [
        "Welcome to P2P Bookmarklet!",
        "First of all you need to exchange tokens with your partner.",
        "Do you want to create a new token?",
        "Or click [Cancel] if someone sent you a token."
      ].join("\n")
    );
    if (requestOrRespond) {
      await this.request();
    } else {
      await this.respond();
    }
  }
  async request() {
    this.state.mode = MODE_REQUESTOR;
    this.dc = this.pc.createDataChannel("test", { reliable: true });
    console.log("seting dc", this.state.mode, "dc");
    this.dc.addEventListener("open", this.onChannelOpen.bind(this));
    this.dc.addEventListener("message", this.onMessage.bind(this));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
  }
  async respond() {
    this.state.mode = MODE_RESPONDER;
    await this.receiveToken()
    const answerDesc = await this.pc.createAnswer();
    this.pc.setLocalDescription(answerDesc);
  }
  async receiveToken() {
    const offer = prompt(
      "Please enter the token your partner shared with you and click [OK]."
    );
    const offerDesc = new RTCSessionDescription(decodeToken(offer));
    await this.pc.setRemoteDescription(offerDesc);
  }
  setupPlugins() {
    // initialise each plugin with client
    this.plugins = this.plugins.map(plugin => plugin(this));
  }
  addPlugin(plugin) {
    this.plugins.push(plugin);
  }
  send(data) {
    this.dc.send(JSON.stringify(data));
  }
  async setupAudio() {
    console.log(this.state.mode);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      // video: true
    });
    stream.getTracks().forEach(track => this.pc.addTrack(track, stream));
  }
};

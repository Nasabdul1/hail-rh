import { WS_URL, TURN_USERNAME, TURN_CREDENTIAL } from './config.js'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:a.relay.metered.ca:80' },
    { urls: 'turn:a.relay.metered.ca:80', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:a.relay.metered.ca:443', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turns:a.relay.metered.ca:443?transport=tcp', username: TURN_USERNAME, credential: TURN_CREDENTIAL },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
}

const RING_TIMEOUT_MS = 60000
const DISCONNECT_GRACE_MS = 5000
const MAX_RECONNECT_ATTEMPTS = 5

export class VoiceCallManager {
  constructor(onRemoteStream, onStateChange) {
    this.pc = null
    this.localStream = null
    this.ws = null
    this.onRemoteStream = onRemoteStream
    this.onStateChange = onStateChange
    this.remoteAddress = null
    this.callId = null
    this.token = null
    this.pendingOffer = null
    this.pendingCandidates = []
    this.ringTimer = null
    this.disconnectTimer = null
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.closed = false
    this.muted = false
    this.callAnswered = false
  }

  initWebSocket(token) {
    this.token = token
    this.closed = false
    this.reconnectAttempts = 0
    return new Promise((resolve, reject) => {
      this.openSocket(resolve, reject)
    })
  }

  openSocket(onFirstOpen, onFirstError) {
    // VITE_WS_URL is expected to include the /ws path; append it only if missing.
    const base = WS_URL.replace(/\/+$/, '')
    const ws = new WebSocket(base.endsWith('/ws') ? base : `${base}/ws`)
    this.ws = ws

    ws.onopen = () => {
      this.reconnectAttempts = 0
      ws.send(JSON.stringify({ type: 'auth', token: this.token }))
      if (onFirstOpen) onFirstOpen()
      this.onStateChange?.('ws_open')
    }

    ws.onerror = (e) => {
      if (onFirstError) onFirstError(e)
      else console.error('WS error', e)
    }

    ws.onclose = () => {
      if (this.closed) return
      console.warn('WS closed, scheduling reconnect')
      if (this.pc) {
        this.onStateChange('ended', { reason: 'signaling lost' })
        this.cleanup()
      }
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.onStateChange('error', { reason: 'Connection to call server lost' })
        return
      }
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 16000)
      this.reconnectAttempts += 1
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => this.openSocket(), delay)
    }

    ws.onmessage = async (event) => {
      let msg
      try { msg = JSON.parse(event.data) } catch { return }
      console.log('WS:', msg.type)

      if (msg.type === 'incoming_call') {
        this.remoteAddress = msg.from
        this.callId = msg.callId
        this.startRingTimeout()
        this.onStateChange('incoming', msg)
      } else if (msg.type === 'signal' && msg.data) {
        await this.handleSignal(msg.data)
      } else if (msg.type === 'end_call') {
        this.clearRingTimeout()
        this.onStateChange('ended', msg)
        this.cleanup()
      } else if (msg.type === 'error') {
        console.error('WS error:', msg.reason)
        this.onStateChange('error', msg)
      }
    }
  }

  startRingTimeout() {
    this.clearRingTimeout()
    this.ringTimer = setTimeout(() => {
      if (!this.callAnswered) {
        this.onStateChange('unreachable', { reason: 'no answer' })
        this.cleanup()
      }
    }, RING_TIMEOUT_MS)
  }

  clearRingTimeout() {
    clearTimeout(this.ringTimer)
    this.ringTimer = null
  }

  setupPeerConnection() {
    this.pc = new RTCPeerConnection(ICE_SERVERS)
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))
    this.pc.ontrack = (e) => this.onRemoteStream(e.streams[0])
    this.pc.onicecandidate = (e) => { if (e.candidate) this.sendSignal({ candidate: e.candidate }) }
    this.pc.onconnectionstatechange = () => this.handleConnectionState()
  }

  handleConnectionState() {
    const state = this.pc?.connectionState
    console.log('WebRTC state:', state)
    clearTimeout(this.disconnectTimer)
    if (state === 'connected') {
      this.callAnswered = true
      this.clearRingTimeout()
      this.onStateChange('connected')
    } else if (state === 'failed') {
      this.onStateChange('ended', { reason: 'connection failed' })
      this.cleanup()
    } else if (state === 'disconnected') {
      this.disconnectTimer = setTimeout(() => {
        if (this.pc && this.pc.connectionState !== 'connected') {
          this.onStateChange('ended', { reason: 'connection lost' })
          this.cleanup()
        }
      }, DISCONNECT_GRACE_MS)
    }
  }

  async prepareCall(remoteAddress, callId) {
    this.remoteAddress = remoteAddress
    this.callId = callId
    this.onStateChange('calling')

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.setupPeerConnection()

    await this.createAndSendOffer()
    this.notifyCall(remoteAddress, callId)
    this.startRingTimeout()
  }

  async createAndSendOffer() {
    if (!this.pc) return
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.sendSignal({ sdp: offer })
  }

  async answerCall(remoteAddress, callId) {
    this.remoteAddress = remoteAddress
    this.callId = callId
    this.clearRingTimeout()
    this.onStateChange('connecting')

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    this.setupPeerConnection()

    if (this.pendingOffer) {
      const offer = this.pendingOffer
      this.pendingOffer = null
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer))
      await this.flushPendingCandidates()
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.sendSignal({ sdp: answer })
    }
  }

  async handleSignal(data) {
    if (!this.pc) {
      if (data.sdp?.type === 'offer') this.pendingOffer = data.sdp
      if (data.candidate) this.pendingCandidates.push(data.candidate)
      return
    }
    try {
      if (data.sdp?.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        await this.flushPendingCandidates()
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.sendSignal({ sdp: answer })
      } else if (data.sdp?.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        await this.flushPendingCandidates()
        this.callAnswered = true
        this.clearRingTimeout()
        this.onStateChange('connected')
      } else if (data.candidate) {
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } else {
          this.pendingCandidates.push(data.candidate)
        }
      }
    } catch (e) {
      console.error('Signal handling failed:', e)
    }
  }

  async flushPendingCandidates() {
    const queued = this.pendingCandidates
    this.pendingCandidates = []
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (e) {
        console.error('addIceCandidate failed:', e)
      }
    }
  }

  sendSignal(data) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'signal', to: this.remoteAddress, callId: this.callId, data }))
    }
  }

  notifyCall(to, callId) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'call', to, callId }))
  }

  notifyEnd(to, callId) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'end_call', to, callId }))
  }

  setMuted(muted) {
    this.muted = muted
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = !muted })
    }
  }

  cleanup() {
    clearTimeout(this.ringTimer)
    clearTimeout(this.disconnectTimer)
    this.ringTimer = null
    this.disconnectTimer = null
    if (this.pc) { this.pc.close(); this.pc = null }
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null }
    this.remoteAddress = null
    this.callId = null
    this.pendingOffer = null
    this.pendingCandidates = []
    this.muted = false
    this.callAnswered = false
  }

  end() {
    this.notifyEnd(this.remoteAddress, this.callId)
    this.cleanup()
  }

  close() {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.cleanup()
    if (this.ws) {
      try { this.ws.close() } catch { /* already closed */ }
      this.ws = null
    }
  }
}

import React from "react"

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
}

export class VoiceCallManager {
  constructor(onRemoteStream, onStateChange) {
    this.pc = null
    this.localStream = null
    this.ws = null
    this.onRemoteStream = onRemoteStream
    this.onStateChange = onStateChange
    this.remoteAddress = null
    this.callId = null
    this.myAddress = null
    this.pendingOffer = null
  }

  async initWebSocket(myAddress) {
    this.myAddress = myAddress
    const wsUrl = (import.meta.env.VITE_WS_URL || 'ws://localhost:4000') + '/ws'
    this.ws = new WebSocket(wsUrl)

    return new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: 'register', address: myAddress }))
        resolve()
      }
      this.ws.onerror = (e) => reject(e)
      this.ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        console.log('WS:', msg.type, msg)

        if (msg.type === 'signal' && msg.data) await this.handleSignal(msg.data)
        if (msg.type === 'incoming_call') this.onStateChange('incoming', msg)
        if (msg.type === 'call_accepted') await this.createAndSendOffer()
        if (msg.type === 'call_ended') { this.onStateChange('ended', msg); this.cleanup() }
      }
    })
  }

  async prepareCall(remoteAddress, callId) {
    this.remoteAddress = remoteAddress
    this.callId = callId
    this.onStateChange('calling')

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

    this.pc = new RTCPeerConnection(ICE_SERVERS)
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))
    this.pc.ontrack = (e) => this.onRemoteStream(e.streams[0])
    this.pc.onicecandidate = (e) => { if (e.candidate) this.sendSignal({ candidate: e.candidate }) }

    // MONITOR CONNECTION STATE
    this.pc.onconnectionstatechange = () => {
      console.log('WebRTC state:', this.pc.connectionState)
      if (this.pc.connectionState === 'connected') {
        this.onStateChange('connected')
      }
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.onStateChange('ended')
        this.cleanup()
      }
    }

    this.notifyCall(remoteAddress, callId)
  }

  async createAndSendOffer() {
    if (!this.pc) return
    console.log('Creating offer...')
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.sendSignal({ sdp: offer })
  }

  async answerCall(remoteAddress, callId) {
    this.remoteAddress = remoteAddress
    this.callId = callId
    this.onStateChange('connecting')

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

    this.pc = new RTCPeerConnection(ICE_SERVERS)
    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream))
    this.pc.ontrack = (e) => this.onRemoteStream(e.streams[0])
    this.pc.onicecandidate = (e) => { if (e.candidate) this.sendSignal({ candidate: e.candidate }) }

    this.pc.onconnectionstatechange = () => {
      console.log('WebRTC state:', this.pc.connectionState)
      if (this.pc.connectionState === 'connected') this.onStateChange('connected')
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected') {
        this.onStateChange('ended')
        this.cleanup()
      }
    }

    this.sendAccept(remoteAddress)
  }

  sendAccept(to) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'call_accepted', to }))
    }
  }

  async handleSignal(data) {
    if (!this.pc) {
      if (data.sdp?.type === 'offer') this.pendingOffer = data.sdp
      return
    }
    if (data.sdp?.type === 'offer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      this.sendSignal({ sdp: answer })
      this.onStateChange('connected')
    } else if (data.sdp?.type === 'answer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      this.onStateChange('connected')
    } else if (data.candidate) {
      await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
    }
  }

  sendSignal(data) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'signal', to: this.remoteAddress, data }))
    }
  }

  notifyCall(to, callId) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'call', to, callId }))
  }

  notifyEnd(to) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'end_call', to }))
  }

  cleanup() {
    if (this.pc) { this.pc.close(); this.pc = null }
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null }
    this.pendingOffer = null
  }

  end() {
    this.notifyEnd(this.remoteAddress)
    this.cleanup()
  }
}
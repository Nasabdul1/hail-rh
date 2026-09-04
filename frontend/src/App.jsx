import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useDisconnect, useWriteContract } from 'wagmi'
import { getLocalWallet, getLocalWalletClient, removeLocalWallet } from './lib/wallet.js'
import { ensureAuthToken, getSignFn } from './lib/auth.js'
import { VoiceCallManager } from './lib/webrtc.js'
import { DIAL_PROTOCOL_ADDRESS, DIAL_PROTOCOL_ABI } from './lib/contracts.js'
import Hero from './components/Hero.jsx'
import Stats from './components/Stats.jsx'
import Features from './components/Features.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import AppSection from './components/AppSection.jsx'
import Footer from './components/Footer.jsx'

const GAS_LIMIT = 200000n

let ringCtx = null
function playRing() {
  try {
    if (!ringCtx) ringCtx = new (window.AudioContext || window.webkitAudioContext)()
    if (ringCtx.state === 'suspended') ringCtx.resume()
    const osc = ringCtx.createOscillator()
    const gain = ringCtx.createGain()
    osc.connect(gain)
    gain.connect(ringCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ringCtx.currentTime)
    gain.gain.setValueAtTime(0.3, ringCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ringCtx.currentTime + 0.5)
    osc.start()
    osc.stop(ringCtx.currentTime + 0.5)
  } catch (e) { console.log('Ring sound failed', e) }
}

export default function App() {
  const { address: wagmiAddress, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { writeContractAsync } = useWriteContract()
  const [localWallet, setLocalWallet] = useState(() => getLocalWallet())
  const [toast, setToast] = useState(null)
  const [callState, setCallState] = useState({ status: 'idle' })
  const [remoteStream, setRemoteStream] = useState(null)
  const [appTab, setAppTab] = useState('home')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const callManagerRef = useRef(null)
  const audioRef = useRef(null)
  const toastTimer = useRef(null)
  const ringTimer = useRef(null)

  const address = wagmiAddress || localWallet?.address || null
  const isAuthed = !!address
  const isIncoming = callState.status === 'incoming'
  const inCall = ['calling', 'connecting', 'connected'].includes(callState.status)

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    if (isIncoming) {
      playRing()
      ringTimer.current = setInterval(playRing, 1500)
    } else {
      clearInterval(ringTimer.current)
    }
    return () => clearInterval(ringTimer.current)
  }, [isIncoming])

  useEffect(() => {
    if (callState.status === 'connected') {
      setSeconds(0)
      const t = setInterval(() => setSeconds(s => s + 1), 1000)
      return () => clearInterval(t)
    }
  }, [callState.status])

  useEffect(() => {
    if (audioRef.current) {
      if (remoteStream) {
        audioRef.current.srcObject = remoteStream
        audioRef.current.play().catch(() => {})
      } else {
        audioRef.current.srcObject = null
      }
    }
  }, [remoteStream])

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const mgr = new VoiceCallManager(
      (stream) => setRemoteStream(stream),
      (status, data) => {
        if (status === 'incoming') setCallState({ status: 'incoming', from: data.from, callId: data.callId })
        else if (status === 'ended') {
          setCallState({ status: 'idle' })
          setRemoteStream(null)
          setMuted(false)
          showToast(data?.reason ? `Call ended: ${data.reason}` : 'Call ended')
        } else if (status === 'unreachable') {
          setCallState({ status: 'idle' })
          setRemoteStream(null)
          setMuted(false)
          showToast('No answer', 'error')
        } else if (status === 'error') {
          showToast(data?.reason || 'Connection error', 'error')
        } else setCallState((s) => ({ ...s, status }))
      }
    )
    callManagerRef.current = mgr
    ;(async () => {
      try {
        const token = await ensureAuthToken(address, getSignFn(isConnected))
        if (cancelled) return
        await mgr.initWebSocket(token)
      } catch (e) {
        console.error('WS init failed', e)
        if (!cancelled) showToast('Could not sign in to call server', 'error')
      }
    })()
    return () => {
      cancelled = true
      mgr.close()
      callManagerRef.current = null
    }
  }, [address, isConnected, showToast])

  function handleLogout() {
    if (isConnected) disconnect()
    removeLocalWallet()
    setLocalWallet(null)
    setAppTab('home')
    setCallState({ status: 'idle' })
    setMuted(false)
    showToast('Logged out')
  }

  function handleWalletCreated(w) { setLocalWallet(w); showToast('Wallet ready') }

  async function answerCallOnChain(callId) {
    if (isConnected) {
      return writeContractAsync({
        address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
        functionName: 'answerCall', args: [BigInt(callId)], gas: GAS_LIMIT
      })
    }
    const client = getLocalWalletClient()
    return client.writeContract({
      address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
      functionName: 'answerCall', args: [BigInt(callId)], gas: GAS_LIMIT
    })
  }

  async function answerIncoming() {
    const mgr = callManagerRef.current
    const { from, callId } = callState
    try {
      await answerCallOnChain(callId)
    } catch (e) {
      console.error('on-chain answerCall failed:', e)
      const msg = e?.shortMessage || e?.message || ''
      showToast(/expired|timeout/i.test(msg) ? 'Call expired' : `On-chain answer failed: ${msg.slice(0, 60)}`, 'error')
      mgr?.notifyEnd(from, callId)
      setCallState({ status: 'idle' })
      return
    }
    setCallState({ status: 'connecting', to: from, callId })
    try {
      await mgr.answerCall(from, callId)
    } catch (err) {
      console.error('Could not start call audio:', err)
      showToast('Could not access microphone', 'error')
      setCallState({ status: 'idle' })
    }
  }

  function declineIncoming() {
    callManagerRef.current?.notifyEnd(callState.from, callState.callId)
    setCallState({ status: 'idle' })
  }

  async function endCallOnChain(callId) {
    try {
      if (isConnected) {
        await writeContractAsync({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'endCall', args: [BigInt(callId)], gas: GAS_LIMIT
        })
      } else {
        const client = getLocalWalletClient()
        await client.writeContract({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'endCall', args: [BigInt(callId)], gas: GAS_LIMIT
        })
      }
    } catch (e) {
      console.error('endCall failed:', e)
      showToast(`On-chain end failed: ${(e?.shortMessage || e?.message || '').slice(0, 60)}`, 'error')
    }
  }

  function hangUp() {
    const { callId } = callState
    callManagerRef.current?.end()
    setCallState({ status: 'idle' })
    setMuted(false)
    if (callId != null) endCallOnChain(callId)
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    callManagerRef.current?.setMuted(next)
  }

  function formatTimer(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0')
    const s = String(sec % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="page">
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {/* ===== GLOBAL INCOMING CALL OVERLAY ===== */}
      {isIncoming && (
        <div className="call-overlay">
          <div className="call-avatar ringing">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </div>
          <div className="call-status">Incoming hail</div>
          <div className="call-address">{callState.from}</div>
          <div className="call-actions">
            <div className="call-action-col">
              <button className="call-action-btn decline" onClick={declineIncoming}>
                <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
              </button>
              <span className="call-action-label">Decline</span>
            </div>
            <div className="call-action-col">
              <button className="call-action-btn answer" onClick={answerIncoming}>
                <svg viewBox="0 0 24 24" fill="#000"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              </button>
              <span className="call-action-label">Answer</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== GLOBAL ACTIVE CALL OVERLAY ===== */}
      {inCall && !isIncoming && (
        <div className="call-overlay">
          <div className={`call-avatar ${callState.status === 'calling' ? 'ringing' : ''}`}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </div>
          <div className="call-status">
            {callState.status === 'calling' && 'Hailing…'}
            {callState.status === 'connecting' && 'Connecting…'}
            {callState.status === 'connected' && 'On call'}
          </div>
          <div className="call-address">{callState.to || callState.from}</div>
          {callState.status === 'connected' && <div className="call-timer">{formatTimer(seconds)}</div>}
          <div className="call-actions">
            {callState.status === 'connected' && (
              <div className="call-action-col">
                <button className={`call-action-btn ${muted ? 'decline' : ''}`} onClick={toggleMute}>
                  {muted ? (
                    <svg viewBox="0 0 24 24" fill="#fff"><path d="M19 11h-1.7c0 .74-.16 1.44-.43 2.08l1.23 1.23c.56-.98.9-2.09.9-3.31zm-4.02 0c0 .12-.01.23-.03.34l1.99 1.99V11c0-2.34-1.03-4.43-2.65-5.86l-1.42 1.42c1.13.8 1.88 2.12 2.11 3.44zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="#000"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                  )}
                </button>
                <span className="call-action-label">{muted ? 'Unmute' : 'Mute'}</span>
              </div>
            )}
            <div className="call-action-col">
              <button className="call-action-btn end" onClick={hangUp}>
                <svg viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>
              </button>
              <span className="call-action-label">End</span>
            </div>
          </div>
        </div>
      )}

      {/* ===== SITE HEADER ===== */}
      <header className="site-header">
        <div className="header-inner">
          <a href="#" className="header-logo">
            <img src="/logo.png" alt="Hail.rh" className="header-logo-img" />
            Hail.rh
          </a>
          <nav className="header-nav">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#app">App</a>
          </nav>
          {isAuthed ? (
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              {isConnected ? 'Disconnect' : 'Log Out'}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => document.getElementById('app').scrollIntoView({ behavior: 'smooth' })}>
              Launch App
            </button>
          )}
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main>
        <Hero isAuthed={isAuthed} onCreate={() => document.getElementById('app').scrollIntoView({ behavior: 'smooth' })} />
        <Stats />
        <Features />
        <HowItWorks />
        <AppSection
          id="app"
          address={address}
          isAuthed={isAuthed}
          isExternalWallet={isConnected}
          callManagerRef={callManagerRef}
          callState={callState}
          setCallState={setCallState}
          appTab={appTab}
          setAppTab={setAppTab}
          onWalletCreated={handleWalletCreated}
          onLogout={handleLogout}
          showToast={showToast}
        />
      </main>

      <Footer />

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '✕ '}
          {toast.message}
        </div>
      )}
    </div>
  )
}

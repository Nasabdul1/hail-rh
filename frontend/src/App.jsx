import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { getLocalWallet, removeLocalWallet } from './lib/wallet.js'
import { VoiceCallManager } from './lib/webrtc.js'
import Hero from './components/Hero.jsx'
import Stats from './components/Stats.jsx'
import Features from './components/Features.jsx'
import HowItWorks from './components/HowItWorks.jsx'
import AppSection from './components/AppSection.jsx'
import Footer from './components/Footer.jsx'

// Ring sound (simple beep loop using Web Audio API)
function playRing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch (e) { console.log('Ring sound failed', e) }
}

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '' }

export default function App() {
  const { address: wagmiAddress, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [localWallet, setLocalWallet] = useState(() => getLocalWallet())
  const [toast, setToast] = useState(null)
  const [callState, setCallState] = useState({ status: 'idle' })
  const [remoteStream, setRemoteStream] = useState(null)
  const [appTab, setAppTab] = useState('home')
  const [seconds, setSeconds] = useState(0)
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

  // Ring sound loop on incoming
  useEffect(() => {
    if (isIncoming) {
      playRing()
      ringTimer.current = setInterval(playRing, 1500)
    } else {
      clearInterval(ringTimer.current)
    }
    return () => clearInterval(ringTimer.current)
  }, [isIncoming])

  // Call duration timer
  useEffect(() => {
    if (callState.status === 'connected') {
      setSeconds(0)
      const t = setInterval(() => setSeconds(s => s + 1), 1000)
      return () => clearInterval(t)
    }
  }, [callState.status])

  // Attach remote audio
  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream
      audioRef.current.play().catch(() => {})
    }
  }, [remoteStream])

  // WebSocket lifecycle
  useEffect(() => {
    if (!address) return
    const mgr = new VoiceCallManager(
      (stream) => setRemoteStream(stream),
      (status, data) => {
        if (status === 'incoming') setCallState({ status: 'incoming', from: data.from, callId: data.callId })
        else if (status === 'ended') {
          setCallState({ status: 'idle' })
          setRemoteStream(null)
          showToast('Call ended')
        } else setCallState((s) => ({ ...s, status }))
      }
    )
    mgr.initWebSocket(address).catch((e) => console.error('WS init failed', e))
    callManagerRef.current = mgr
    return () => { mgr.cleanup(); mgr.ws?.close(); callManagerRef.current = null }
  }, [address, showToast])

  function handleLogout() {
    if (isConnected) disconnect()
    removeLocalWallet()
    setLocalWallet(null)
    setAppTab('home')
    setCallState({ status: 'idle' })
    showToast('Logged out')
  }

  function handleWalletCreated(w) { setLocalWallet(w); showToast('Wallet created') }

  async function answerIncoming() {
    const mgr = callManagerRef.current
    const { from, callId } = callState
    try {
      try {
        if (isConnected) {
          const { writeContract } = await import('wagmi/actions')
          await writeContract({
            address: import.meta.env.VITE_DIAL_PROTOCOL,
            abi: [{ inputs: [{ internalType: 'uint256', name: 'callId', type: 'uint256' }], name: 'answerCall', outputs: [], stateMutability: 'nonpayable', type: 'function' }],
            functionName: 'answerCall', args: [BigInt(callId || 0)]
          })
        }
      } catch (e) { console.warn('on-chain answer skipped:', e) }
      setCallState({ status: 'connecting', to: from })
      await mgr.answerCall(from, callId)
    } catch (err) {
      showToast('Could not access microphone', 'error')
      setCallState({ status: 'idle' })
    }
  }

  function declineIncoming() {
    callManagerRef.current?.notifyEnd(callState.from)
    setCallState({ status: 'idle' })
  }

  function hangUp() {
    callManagerRef.current?.end()
    setCallState({ status: 'idle' })
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
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </div>
          <div className="call-status">
            {callState.status === 'calling' && 'Hailing…'}
            {callState.status === 'connecting' && 'Connecting…'}
            {callState.status === 'connected' && 'On call'}
          </div>
          <div className="call-address">{callState.to || callState.from}</div>
          {callState.status === 'connected' && <div className="call-timer">{formatTimer(seconds)}</div>}
          <div className="call-actions">
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
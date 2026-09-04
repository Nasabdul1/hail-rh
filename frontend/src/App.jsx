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

export default function App() {
  const { address: wagmiAddress, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [localWallet, setLocalWallet] = useState(() => getLocalWallet())
  const [toast, setToast] = useState(null)
  const [callState, setCallState] = useState({ status: 'idle' })
  const [remoteStream, setRemoteStream] = useState(null)
  const [appTab, setAppTab] = useState('home')
  const callManagerRef = useRef(null)
  const audioRef = useRef(null)
  const toastTimer = useRef(null)

  const address = wagmiAddress || localWallet?.address || null
  const isAuthed = !!address

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream
      audioRef.current.play().catch(() => {})
    }
  }, [remoteStream])

  useEffect(() => {
    if (!address) return
    const mgr = new VoiceCallManager(
      (stream) => setRemoteStream(stream),
      (status, data) => {
        if (status === 'incoming') {
          setCallState({ status: 'incoming', from: data.from, callId: data.callId })
        } else if (status === 'ended') {
          setCallState({ status: 'idle' })
          setRemoteStream(null)
          showToast('Call ended')
        } else {
          setCallState((s) => ({ ...s, status }))
        }
      }
    )
    mgr.initWebSocket(address).catch((e) => console.error('WS init failed', e))
    callManagerRef.current = mgr
    return () => {
      mgr.cleanup()
      mgr.ws?.close()
      callManagerRef.current = null
    }
  }, [address, showToast])

  function handleLogout() {
    if (isConnected) disconnect()
    removeLocalWallet()
    setLocalWallet(null)
    setAppTab('home')
    setCallState({ status: 'idle' })
    showToast('Logged out')
  }

  function handleWalletCreated(w) {
    setLocalWallet(w)
    showToast('Wallet created')
  }

  return (
    <div className="page">
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

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
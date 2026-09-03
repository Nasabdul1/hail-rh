import React from 'react'
import { openWalletModal } from '../modal.js'

export default function Hero({ isAuthed, onCreate }) {
  return (
    <section className="hero">
      <div className="hero-glow" />
      <div className="container">
        <div className="hero-badge">
          <span className="status-dot online" />
          Live on Robinhood Chain
        </div>
        <h1 className="hero-title">
          Hail any<br />wallet address.
          <span className="green"> On-chain.</span>
        </h1>
        <p className="hero-lead">
          The first voice calling layer for wallets. No phone numbers. No accounts.
          Just paste an address and talk — peer to peer, settled on-chain.
        </p>
        <div className="hero-ctas">
          {!isAuthed ? (
            <>
              <button className="btn btn-primary btn-xl" onClick={onCreate}>
                Create Wallet
              </button>
              <button className="btn btn-ghost btn-xl" onClick={() => openWalletModal()}>
                Connect Wallet
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-xl" onClick={() => document.getElementById("app").scrollIntoView({ behavior: "smooth" })}>
              Open Dialer
            </button>
          )}
        </div>
        <div className="hero-trust">
          <span className="trust-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Self-custody
          </span>
          <span className="trust-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Gas only
          </span>
          <span className="trust-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            WebRTC encrypted
          </span>
        </div>
      </div>
    </section>
  )
}
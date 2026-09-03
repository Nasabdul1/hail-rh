import React from "react"

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="logo-dot" />
            <span>Hail.rh</span>
          </div>
          <p className="footer-tag">On-chain voice for Robinhood Chain · Chain ID 4663</p>
        </div>
        <div className="footer-bottom">
          <span>Keys stay in your browser. Nothing leaves your device.</span>
          <span className="dim">© 2026 Hail.rh</span>
        </div>
      </div>
    </footer>
  )
}
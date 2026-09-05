import React from "react"

const SOCIALS = [
  {
    name: "Twitter / X",
    url: "https://x.com/hail_rh",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )
  },



]

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <img src="/logo.png" alt="Hail.rh" className="footer-logo-img" />
            <span>Hail.rh</span>
          </div>
          <p className="footer-tag">On-chain voice for Robinhood Chain · Chain ID 4663</p>

          <div className="socials">
            {SOCIALS.map(s => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="social-link" title={s.name}>
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        <div className="footer-bottom">
          <span>Keys stay in your browser. Nothing leaves your device.</span>
          <span className="dim">© 2026 Hail.rh</span>
        </div>
      </div>
    </footer>
  )
}
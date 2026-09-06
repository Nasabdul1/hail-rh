import React from "react"

const PLATFORMS = [
  {
    name: "Android",
    store: "Google Play",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.6 11.6 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/>
      </svg>
    )
  },
  {
    name: "iOS",
    store: "App Store",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.5.96 1.39 2.1 2.94 3.6 2.88 1.45-.06 2-.93 3.74-.93s2.24.93 3.77.9c1.56-.03 2.55-1.41 3.5-2.8 1.1-1.61 1.55-3.17 1.58-3.25-.04-.02-3.03-1.16-3.07-4.6zM14.15 4.06c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.73-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.62z"/>
      </svg>
    )
  }
]

export default function DownloadApp() {
  return (
    <section className="download" id="download">
      <div className="container">
        <div className="section-head">
          <span className="section-kicker">Mobile App</span>
          <h2 className="section-title">Take Hail<br />everywhere.</h2>
          <p className="download-lead">
            Native apps with full-screen incoming calls — hails ring your phone like a real call,
            even when the app is closed.
          </p>
        </div>
        <div className="download-buttons">
          {PLATFORMS.map((p) => (
            <button key={p.name} className="store-btn" disabled>
              <span className="store-icon">{p.icon}</span>
              <span className="store-text">
                <span className="store-coming">Coming soon</span>
                <span className="store-name">{p.name} · {p.store}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

import React from "react"

export default function Stats() {
  return (
    <section className="stats">
      <div className="container">
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-num">0.00</div>
            <div className="stat-label">ETH per call</div>
          </div>
          <div className="stat">
            <div className="stat-num">4663</div>
            <div className="stat-label">Chain ID</div>
          </div>
          <div className="stat">
            <div className="stat-num">P2P</div>
            <div className="stat-label">Encrypted voice</div>
          </div>
          <div className="stat">
            <div className="stat-num">∞</div>
            <div className="stat-label">Free calls</div>
          </div>
        </div>
      </div>
    </section>
  )
}
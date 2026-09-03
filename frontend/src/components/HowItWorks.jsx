import React from "react"

const STEPS = [
  { num: "01", title: "Create or Connect", body: "Generate a wallet instantly in your browser, or connect MetaMask, Robinhood Wallet, or any WalletConnect app." },
  { num: "02", title: "Enter an Address", body: "Paste any Robinhood Chain address into the dialer, or pick from your saved contacts." },
  { num: "03", title: "Hail Them", body: "Initiate the call. The recipient gets a real-time ring. Answer, and talk — peer to peer, encrypted." }
]

export default function HowItWorks() {
  return (
    <section className="how" id="how">
      <div className="container">
        <div className="section-head">
          <span className="section-kicker">How it works</span>
          <h2 className="section-title">Three steps.<br />Zero friction.</h2>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={i}>
              <div className="step-num">{s.num}</div>
              <div className="step-body">
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
import React, { useState, useEffect, useRef } from 'react'
import { openWalletModal } from '../modal.js'
import { useWriteContract, useBalance } from 'wagmi'
import { createLocalWallet, getLocalWalletClient, exportWalletData } from '../lib/wallet.js'
import { DIAL_PROTOCOL_ADDRESS, DIAL_PROTOCOL_ABI } from '../lib/contracts.js'

const GAS_LIMIT = 200000n
const CALL_VALUE = 0n

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '' }
function formatTimer(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}
function contactsKey(address) { return `hail_contacts_${address.toLowerCase()}` }
function loadContacts(address) {
  try { return JSON.parse(localStorage.getItem(contactsKey(address))) || [] } catch { return [] }
}
function saveContacts(address, list) { localStorage.setItem(contactsKey(address), JSON.stringify(list)) }

function AuthPrompt({ onWalletCreated, showToast }) {
  const [showKey, setShowKey] = useState(false)
  const [newWallet, setNewWallet] = useState(null)
  const [copied, setCopied] = useState(false)

  function handleCreate() {
    const w = createLocalWallet()
    setNewWallet(w)
    setShowKey(true)
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(newWallet.privateKey); setCopied(true); showToast('Copied'); setTimeout(() => setCopied(false), 2000) } catch { showToast('Copy failed', 'error') }
  }

  return (
    <div className="auth-prompt">
      <div className="auth-icon">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
</div>
      <h3>Connect to start calling</h3>
      <p>Create a wallet in one tap, or connect your existing wallet to hail any address on Robinhood Chain.</p>
      <div className="auth-actions">
        <button className="btn btn-primary" onClick={handleCreate}>Create Wallet</button>
        <button className="btn btn-ghost" onClick={() => openWalletModal()}>Connect Wallet</button>
      </div>
      {showKey && newWallet && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && null}>
          <div className="modal">
            <div className="modal-title">Save your private key</div>
            <div className="modal-sub">This key is the only way to recover your wallet. Store it somewhere safe.</div>
            <div className="key-box">{newWallet.privateKey}</div>
            <div className="modal-actions">
              <button className="btn btn-dark" onClick={copyKey}>{copied ? 'Copied ✓' : 'Copy Key'}</button>
              <button className="btn btn-primary" onClick={() => onWalletCreated(newWallet)}>I've saved it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HomeTab({ address, callManagerRef, callState, setCallState, showToast, isExternalWallet }) {
  const { writeContractAsync } = useWriteContract()
  const [recipient, setRecipient] = useState('')
  const [contacts, setContacts] = useState(() => loadContacts(address))
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [placing, setPlacing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const timerRef = useRef(null)

  const inCall = ['calling', 'connecting', 'connected'].includes(callState.status)
  const isIncoming = callState.status === 'incoming'

  useEffect(() => {
    if (callState.status === 'connected') {
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else { clearInterval(timerRef.current) }
    return () => clearInterval(timerRef.current)
  }, [callState.status])

  async function pasteAddress() {
    try {
      const text = await navigator.clipboard.readText()
      if (text?.trim().startsWith('0x')) setRecipient(text.trim())
      else showToast('Clipboard has no address', 'error')
    } catch { showToast('Clipboard access denied', 'error') }
  }

  function addContact() {
    const name = contactName.trim()
    const addr = recipient.trim()
    if (!name) return showToast('Enter a name', 'error')
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return showToast('Enter a valid address first', 'error')
    if (contacts.some(c => c.address.toLowerCase() === addr.toLowerCase())) return showToast('Contact already exists', 'error')
    const next = [...contacts, { name, address: addr }]
    saveContacts(address, next)
    setContacts(next)
    setContactName('')
    setShowAddContact(false)
    showToast(`${name} added`)
  }

  function removeContact(addr) {
    const next = contacts.filter(c => c.address !== addr)
    saveContacts(address, next)
    setContacts(next)
  }

  async function startCall(target) {
    const to = (target || recipient).trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return showToast('Enter a valid 0x address', 'error')
    if (to.toLowerCase() === address.toLowerCase()) return showToast("Can't call yourself", 'error')
    if (inCall || placing) return

    setPlacing(true)
    try {
      const mgr = callManagerRef.current
      if (!mgr) throw new Error('Call service not ready')

      if (isExternalWallet) {
        await writeContractAsync({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'initiateCall', args: [to, '0x'],
          value: CALL_VALUE, gas: GAS_LIMIT
        })
      } else {
        const client = getLocalWalletClient()
        await client.writeContract({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'initiateCall', args: [to, '0x'],
          value: CALL_VALUE, gas: GAS_LIMIT
        })
      }

      const callId = Date.now()
      setCallState({ status: 'calling', to })
      await mgr.prepareCall(to, callId)
    } catch (err) {
      console.error(err)
      const msg = err?.shortMessage || err?.message || 'Call failed'
      if (/insufficient|gas/i.test(msg)) showToast('Not enough ETH for gas', 'error')
      else if (/user rejected|denied/i.test(msg)) showToast('Transaction cancelled')
      else showToast(msg.slice(0, 80), 'error')
      setCallState({ status: 'idle' })
    } finally { setPlacing(false) }
  }

  async function answerIncoming() {
    const mgr = callManagerRef.current
    const { from, callId } = callState
    try {
      try {
        if (isExternalWallet) {
          await writeContractAsync({ address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
            functionName: 'answerCall', args: [BigInt(callId || 0)], gas: GAS_LIMIT })
        }
      } catch (e) { console.warn('on-chain answer skipped:', e?.shortMessage) }
      setCallState({ status: 'connecting', to: from })
      await mgr.answerCall(from, callId)
    } catch (err) {
      showToast('Could not access microphone', 'error')
      setCallState({ status: 'idle' })
    }
  }

  function hangUp() { callManagerRef.current?.end(); setCallState({ status: 'idle' }) }
  function declineIncoming() { callManagerRef.current?.notifyEnd(callState.from); setCallState({ status: 'idle' }) }

  return (
    <>
      <div className="dialer-card">
        <div className="dialer-badge">All calls free · gas only</div>
        <div className="dialer-label">Recipient Address</div>
        <div className="address-input-wrap">
          <input className="input mono" style={{ paddingRight: 70 }} placeholder="0x…" value={recipient} onChange={e => setRecipient(e.target.value)} spellCheck={false} autoComplete="off" />
          <button className="paste-btn" onClick={pasteAddress}>Paste</button>
        </div>
        <button className="btn btn-primary call-btn" disabled={placing || inCall} onClick={() => startCall()}>
          {placing ? <span className="spinner" /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          )}
          {placing ? 'Hailing…' : 'Call Free'}
        </button>
        <button className="btn btn-dark btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => setShowAddContact(true)}>+ Save to Contacts</button>
      </div>

      {contacts.length > 0 && (
        <div className="contacts-section">
          <div className="contacts-header">
            <span className="section-kicker" style={{ margin: 0 }}>Contacts</span>
            <span className="dim small">{contacts.length} saved</span>
          </div>
          <div className="contacts-grid">
            {contacts.map(c => (
              <button key={c.address} className="contact-chip" onClick={() => setRecipient(c.address)}>
                <span className="contact-avatar">{c.name[0].toUpperCase()}</span>
                <span className="contact-name">{c.name}</span>
                <span className="contact-del" role="button" onClick={e => { e.stopPropagation(); removeContact(c.address) }}>×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showAddContact && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowAddContact(false)}>
          <div className="modal">
            <div className="modal-title">Add contact</div>
            <div className="modal-sub">Saving <span style={{ color: 'var(--green)' }}>{shortAddr(recipient)}</span></div>
            <input className="input" placeholder="Name (e.g. Mom)" value={contactName} onChange={e => setContactName(e.target.value)} maxLength={20} autoFocus />
            <div className="modal-actions">
              <button className="btn btn-dark" onClick={() => setShowAddContact(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addContact}>Add</button>
            </div>
          </div>
        </div>
      )}

      {isIncoming && (
        <div className="call-overlay">
          <div className="call-avatar ringing">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
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

      {inCall && (
        <div className="call-overlay">
          <div className={`call-avatar ${callState.status === 'calling' ? 'ringing' : ''}`}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </div>
          <div className="call-status">
            {callState.status === 'calling' && 'Hailing…'}
            {callState.status === 'connecting' && 'Connecting…'}
            {callState.status === 'connected' && 'On call'}
          </div>
          <div className="call-address">{callState.to}</div>
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
    </>
  )
}

function HistoryTab({ address }) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
// ... then in the fetch:
      fetch(`${API_URL}/api/calls/${address}`)
      .then(r => r.json())
      .then(data => { setCalls(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [address])

  if (loading) return <div className="empty-state"><strong>Loading…</strong></div>
  if (calls.length === 0) return <div className="empty-state"><strong>No calls yet</strong><br />Hail a wallet and your calls will show up here.</div>

  return (
    <div className="history-list">
      {calls.map((call, i) => {
        const isIncoming = call.recipient?.toLowerCase() === address.toLowerCase()
        const other = isIncoming ? call.caller : call.recipient
        return (
          <div className="history-item" key={call.id || i}>
            <div className={`history-icon ${isIncoming ? 'in' : 'out'}`}>
              {isIncoming ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="22 12 16 12 14 15 10 9 8 12 2 12"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              )}
            </div>
            <div className="history-info">
              <div className="history-addr">{shortAddr(other)}</div>
              <div className="history-meta">{new Date(call.timestamp).toLocaleDateString()}</div>
            </div>
            <span className={`history-status ${call.answered ? 'answered' : 'missed'}`}>
              {call.answered ? 'Answered' : 'Missed'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ProfileTab({ address, isExternalWallet, onLogout, showToast }) {
  const { data: balance } = useBalance({ address })
  const [keyRevealed, setKeyRevealed] = useState(false)
  const localWallet = exportWalletData()
  const bal = balance ? parseFloat(balance.formatted).toFixed(5) : '0.00000'

  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); showToast('Address copied') } catch { showToast('Copy failed', 'error') }
  }

  async function copyKey() {
    try { await navigator.clipboard.writeText(localWallet.privateKey); showToast('Private key copied') } catch { showToast('Copy failed', 'error') }
  }

  return (
    <div className="profile-tab">
      <div className="profile-card">
        <div className="profile-avatar">{address[2].toUpperCase()}</div>
        <div className="profile-name">Wallet</div>
        <div className="profile-addr">
          {shortAddr(address)}
          <button className="copy-btn" onClick={copyAddress}>Copy</button>
        </div>
      </div>

      <div className="profile-card balance-row">
        <div>
          <div className="field-label" style={{ margin: 0 }}>Balance · Robinhood Chain</div>
          <div className="balance-value">{bal} <span>ETH</span></div>
        </div>
        <span className="status-pill"><span className="status-dot online" />4663</span>
      </div>

      {!isExternalWallet && localWallet && (
        <div className="profile-card">
          <div className="field-label">Wallet export</div>
          <div className={`key-box ${keyRevealed ? '' : 'blurred'}`} style={{ margin: '0 0 12px' }}>
            {localWallet.privateKey}
          </div>
          <div className="row">
            <button className="btn btn-dark btn-sm" onClick={() => setKeyRevealed(!keyRevealed)}>
              {keyRevealed ? 'Hide' : 'Reveal'}
            </button>
            {keyRevealed && <button className="btn btn-primary btn-sm" onClick={copyKey}>Copy Key</button>}
          </div>
        </div>
      )}

      <div className="profile-card danger-zone">
        <div className="danger-title">Log out</div>
        <div className="danger-text">
          {isExternalWallet ? 'Disconnects your wallet from Hail.rh.' : 'Removes this wallet from your browser. Make sure your private key is saved first.'}
        </div>
        <button className="btn btn-danger btn-sm" onClick={onLogout}>
          {isExternalWallet ? 'Disconnect' : 'Log Out'}
        </button>
      </div>
    </div>
  )
}

export default function AppSection({ id, address, isAuthed, isExternalWallet, callManagerRef, callState, setCallState, appTab, setAppTab, onWalletCreated, onLogout, showToast }) {
  return (
    <section className="app-section" id={id}>
      <div className="container">
        <div className="section-head">
          <span className="section-kicker">Dialer</span>
          <h2 className="section-title">Start hailing.</h2>
        </div>

        <div className="app-card">
          {!isAuthed ? (
            <AuthPrompt onWalletCreated={onWalletCreated} showToast={showToast} />
          ) : (
            <>
              <div className="app-tabs">
                <button className={`app-tab ${appTab === 'home' ? 'active' : ''}`} onClick={() => setAppTab('home')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Call
                </button>
                <button className={`app-tab ${appTab === 'history' ? 'active' : ''}`} onClick={() => setAppTab('history')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  History
                </button>
                <button className={`app-tab ${appTab === 'profile' ? 'active' : ''}`} onClick={() => setAppTab('profile')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Profile
                </button>
              </div>
              <div className="app-tab-body">
                {appTab === 'home' && <HomeTab address={address} callManagerRef={callManagerRef} callState={callState} setCallState={setCallState} showToast={showToast} isExternalWallet={isExternalWallet} />}
                {appTab === 'history' && <HistoryTab address={address} />}
                {appTab === 'profile' && <ProfileTab address={address} isExternalWallet={isExternalWallet} onLogout={onLogout} showToast={showToast} />}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
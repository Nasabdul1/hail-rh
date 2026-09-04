import React, { useState, useEffect } from 'react'
import { openWalletModal } from '../modal.js'
import { useWriteContract, useBalance } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { parseEventLogs } from 'viem'
import { config } from '../wagmi.js'
import { createEncryptedWallet, unlockLocalWallet, hasLocalWallet, getLocalWalletClient } from '../lib/wallet.js'
import { apiFetch, getSignFn } from '../lib/auth.js'
import { DIAL_PROTOCOL_ADDRESS, DIAL_PROTOCOL_ABI } from '../lib/contracts.js'

const GAS_LIMIT = 200000n

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '' }
function contactsKey(address) { return `hail_contacts_${address.toLowerCase()}` }
function loadContacts(address) {
  try { return JSON.parse(localStorage.getItem(contactsKey(address))) || [] } catch { return [] }
}
function saveContacts(address, list) { localStorage.setItem(contactsKey(address), JSON.stringify(list)) }

function AuthPrompt({ onWalletCreated, showToast }) {
  const [showModal, setShowModal] = useState(false)
  const [mode, setMode] = useState('create')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const walletExists = hasLocalWallet()

  function openCreate() { setMode('create'); setPassword(''); setConfirm(''); setShowModal(true) }
  function openUnlock() { setMode('unlock'); setPassword(''); setShowModal(true) }

  async function submit() {
    if (mode === 'create') {
      if (password.length < 8) return showToast('Password must be at least 8 characters', 'error')
      if (password !== confirm) return showToast('Passwords do not match', 'error')
      setBusy(true)
      try {
        const w = await createEncryptedWallet(password)
        onWalletCreated(w)
      } catch {
        showToast('Could not create wallet', 'error')
      } finally { setBusy(false) }
    } else {
      setBusy(true)
      try {
        const w = await unlockLocalWallet(password)
        onWalletCreated(w)
      } catch {
        showToast('Wrong password', 'error')
      } finally { setBusy(false) }
    }
  }

  const isCreate = mode === 'create'

  return (
    <div className="auth-prompt">
      <div className="auth-icon">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
</div>
      <h3>Connect to start calling</h3>
      <p>Create a wallet in one tap, or connect your existing wallet to hail any address on Robinhood Chain.</p>
      <div className="auth-actions">
        {walletExists ? (
          <button className="btn btn-primary" onClick={openUnlock}>Unlock Wallet</button>
        ) : (
          <button className="btn btn-primary" onClick={openCreate}>Create Wallet</button>
        )}
        <button className="btn btn-ghost" onClick={() => openWalletModal()}>Connect Wallet</button>
      </div>
      {showModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">{isCreate ? 'Set a password for your wallet' : 'Unlock your wallet'}</div>
            <div className="modal-sub">
              {isCreate
                ? 'Your wallet is encrypted with this password and stored only in this browser. There is no recovery without it.'
                : 'Enter your password to decrypt your wallet for this session.'}
            </div>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isCreate && submit()}
              autoFocus
            />
            {isCreate && (
              <input
                className="input"
                type="password"
                placeholder="Confirm password"
                style={{ marginTop: 10 }}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
              />
            )}
            <div className="modal-actions">
              <button className="btn btn-dark" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>
                {busy ? <span className="spinner" /> : (isCreate ? 'Create & Encrypt' : 'Unlock')}
              </button>
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

  const inCall = ['calling', 'connecting', 'connected'].includes(callState.status)

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

      let receipt
      if (isExternalWallet) {
        const hash = await writeContractAsync({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'initiateCall', args: [to, '0x'], gas: GAS_LIMIT
        })
        receipt = await waitForTransactionReceipt(config, { hash })
      } else {
        const client = getLocalWalletClient()
        const hash = await client.writeContract({
          address: DIAL_PROTOCOL_ADDRESS, abi: DIAL_PROTOCOL_ABI,
          functionName: 'initiateCall', args: [to, '0x'], gas: GAS_LIMIT
        })
        receipt = await client.waitForTransactionReceipt({ hash })
      }

      const logs = parseEventLogs({ abi: DIAL_PROTOCOL_ABI, logs: receipt.logs, eventName: 'CallInitiated' })
      const log = logs.find(
        l => l.args.caller?.toLowerCase() === address.toLowerCase() && l.args.recipient?.toLowerCase() === to.toLowerCase()
      )
      if (!log) throw new Error('CallInitiated event not found in receipt')
      const callId = log.args.callId

      setCallState({ status: 'calling', to, callId })
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

    </>
  )
}

function HistoryTab({ address, isExternalWallet }) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiFetch(address, getSignFn(isExternalWallet), `/api/calls/${address}`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => {
        if (cancelled) return
        setCalls(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch((e) => {
        console.error('History fetch failed:', e)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [address, isExternalWallet])

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
  const bal = balance ? parseFloat(balance.formatted).toFixed(5) : '0.00000'

  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); showToast('Address copied') } catch { showToast('Copy failed', 'error') }
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

      {!isExternalWallet && (
        <div className="profile-card">
          <div className="field-label">Local wallet</div>
          <div className="dim small">Stored encrypted in this browser. Unlock it with your password each session.</div>
        </div>
      )}

      <div className="profile-card danger-zone">
        <div className="danger-title">Log out</div>
        <div className="danger-text">
          {isExternalWallet ? 'Disconnects your wallet from Hail.rh.' : 'Removes this wallet from your browser. Without your password there is no way to recover it.'}
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
                {appTab === 'history' && <HistoryTab address={address} isExternalWallet={isExternalWallet} />}
                {appTab === 'profile' && <ProfileTab address={address} isExternalWallet={isExternalWallet} onLogout={onLogout} showToast={showToast} />}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

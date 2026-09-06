import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pool } from './db.js';
import { parseToken } from './auth.js';
import { isAddress, isUint256 } from './validate.js';
import profiles from './routes/profiles.js';
import calls from './routes/calls.js';
import contacts from './routes/contacts.js';
import tokens from './routes/tokens.js';
import auth from './routes/auth.js';
import push from './routes/push.js';
import { init as initPush, sendToAddress } from './push.js';
import { initFcm, sendCallToAddress, sendCallEndToAddress } from './fcm.js';

dotenv.config();
initPush();
await initFcm();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

app.use('/api/auth', auth);
app.use('/api/profiles', profiles);
app.use('/api/calls', calls);
app.use('/api/contacts', contacts);
app.use('/api/tokens', tokens);
app.use('/api/push', push);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ca', (req, res) => {
  const ca = process.env.HAIL_TOKEN_CA || '';
  res.json({ ca, active: !!ca });
});

// WebSocket registry: address -> ws. Address always comes from a verified
// login token, never from client-supplied fields.
const sockets = new Map();

// Pending-call re-delivery: when a call's recipient is offline, remember the
// ringing call and buffer its signaling so a device that comes online within
// the TTL (e.g. the Android app cold-starting from a push) still receives the
// incoming_call and the caller's offer/ICE candidates.
const PENDING_CALL_TTL_MS = 60000;
const MAX_BUFFERED_SIGNALS = 100;
const pendingCalls = new Map(); // to -> { from, callId, expiresAt }
const bufferedSignals = new Map(); // `${to}:${callId}` -> { signals: [], expiresAt }

function sweepPending() {
  const now = Date.now();
  for (const [key, entry] of pendingCalls) {
    if (entry.expiresAt <= now) pendingCalls.delete(key);
  }
  for (const [key, entry] of bufferedSignals) {
    if (entry.expiresAt <= now) bufferedSignals.delete(key);
  }
}
setInterval(sweepPending, 15000).unref();

// Diagnostic: which addresses currently have a live call-server connection.
// Open in a browser while debugging "recipient offline" calls.
app.get('/api/ws/online', (req, res) => {
  res.json({ online: [...sockets.keys()] });
});

function sendError(ws, reason) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', reason }));
}

wss.on('connection', (ws) => {
  let userAddress = null;
  let authenticated = false;
  ws.isAlive = true;

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      sendError(ws, 'authentication timeout');
      ws.close();
    }
  }, 10 * 1000);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed JSON
    }
    if (!msg || typeof msg !== 'object') return;

    if (!authenticated) {
      if (msg.type === 'auth' && typeof msg.token === 'string') {
        const parsed = parseToken(msg.token);
        if (!parsed) {
          sendError(ws, 'invalid token');
          return;
        }
        authenticated = true;
        userAddress = parsed.address;
        clearTimeout(authTimeout);

        const old = sockets.get(userAddress);
        if (old && old !== ws && old.readyState === 1) {
          sendError(old, 'connected elsewhere');
          old.close();
        }
        sockets.set(userAddress, ws);
        ws.send(JSON.stringify({ type: 'authenticated', address: userAddress }));
        console.log('WS authenticated:', userAddress);

        // Re-deliver a call that started ringing while this device was
        // offline, together with any buffered offer/ICE candidates.
        sweepPending();
        const pending = pendingCalls.get(userAddress);
        if (pending) {
          pendingCalls.delete(userAddress);
          ws.send(JSON.stringify({
            type: 'incoming_call',
            from: pending.from,
            callId: pending.callId
          }));
          const buffered = bufferedSignals.get(`${userAddress}:${pending.callId}`);
          if (buffered) {
            bufferedSignals.delete(`${userAddress}:${pending.callId}`);
            for (const data of buffered.signals) {
              ws.send(JSON.stringify({ type: 'signal', from: pending.from, data }));
            }
          }
        }
      } else if (msg.type === 'register') {
        sendError(ws, 'use token auth');
      } else {
        sendError(ws, 'not authenticated');
      }
      return;
    }

    const to = typeof msg.to === 'string' && isAddress(msg.to)
      ? msg.to.toLowerCase()
      : null;

    switch (msg.type) {
      case 'register':
        return sendError(ws, 'use token auth');
      case 'call': {
        if (!to) return sendError(ws, 'invalid recipient address');
        if (!isUint256(msg.callId)) return sendError(ws, 'invalid callId');
        const recipientWs = sockets.get(to);
        if (recipientWs && recipientWs.readyState === 1) {
          recipientWs.send(JSON.stringify({
            type: 'incoming_call',
            from: userAddress,
            callId: msg.callId.toString()
          }));
        } else {
          sendError(ws, 'recipient offline');
          // Remember the ringing call so a device coming online within the TTL
          // (e.g. the Android app cold-starting from a push) gets the call.
          pendingCalls.set(to, {
            from: userAddress,
            callId: msg.callId.toString(),
            expiresAt: Date.now() + PENDING_CALL_TTL_MS
          });
          // Notify the recipient's registered devices via Web Push so an
          // offline tab/app still surfaces the incoming call.
          sendToAddress(to, {
            title: 'Incoming call',
            body: 'from ' + userAddress,
            url: '/',
            tag: 'hail-call',
            callId: msg.callId.toString()
          }).catch((err) => console.error('Push send failed:', err.message));
          // Native devices (Android app) get a high-priority FCM data message
          // that triggers the system incoming-call UI.
          sendCallToAddress(to, {
            from: userAddress,
            callId: msg.callId.toString()
          }).catch((err) => console.error('FCM send failed:', err.message));
        }
        break;
      }
      case 'signal': {
        if (!to) return sendError(ws, 'invalid recipient address');
        if (!msg.data || typeof msg.data !== 'object') return sendError(ws, 'invalid signal data');
        const peerWs = sockets.get(to);
        if (peerWs && peerWs.readyState === 1) {
          peerWs.send(JSON.stringify({
            type: 'signal',
            from: userAddress,
            data: msg.data
          }));
        } else {
          // Buffer the signal so it can be flushed if the recipient comes
          // online while the call is still ringing (cold-start answer).
          if (isUint256(msg.callId)) {
            const key = `${to}:${msg.callId.toString()}`;
            let entry = bufferedSignals.get(key);
            if (!entry) {
              entry = { signals: [], expiresAt: Date.now() + PENDING_CALL_TTL_MS };
              bufferedSignals.set(key, entry);
            }
            if (entry.signals.length < MAX_BUFFERED_SIGNALS) entry.signals.push(msg.data);
          }
          sendError(ws, 'recipient offline');
        }
        break;
      }
      case 'end_call': {
        if (!to) return sendError(ws, 'invalid recipient address');
        if (!isUint256(msg.callId)) return sendError(ws, 'invalid callId');
        const peerWs = sockets.get(to);
        if (peerWs && peerWs.readyState === 1) {
          peerWs.send(JSON.stringify({
            type: 'end_call',
            from: userAddress,
            callId: msg.callId.toString()
          }));
        } else {
          sendError(ws, 'recipient offline');
          // The peer is offline: drop any pending ring for this call and tell
          // native devices to dismiss their incoming-call UI.
          const pend = pendingCalls.get(to);
          if (pend && pend.callId === msg.callId.toString()) pendingCalls.delete(to);
          bufferedSignals.delete(`${to}:${msg.callId.toString()}`);
          sendCallEndToAddress(to, { callId: msg.callId.toString() })
            .catch((err) => console.error('FCM end_call send failed:', err.message));
        }
        break;
      }
      default:
        sendError(ws, 'unknown message type');
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (userAddress && sockets.get(userAddress) === ws) {
      sockets.delete(userAddress);
    }
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    clearTimeout(authTimeout);
    if (userAddress && sockets.get(userAddress) === ws) {
      sockets.delete(userAddress);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30 * 1000);
heartbeat.unref();

const PORT = process.env.PORT || 4000;

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`🚀 Hail backend running on port ${PORT}`);
  console.log(`🔗 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔗 Chain: Robinhood (4663)`);
});

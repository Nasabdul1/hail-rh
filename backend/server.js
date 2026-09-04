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

dotenv.config();

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ca', (req, res) => {
  const ca = process.env.HAIL_TOKEN_CA || '';
  res.json({ ca, active: !!ca });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// WebSocket registry: address -> ws. Address always comes from a verified
// login token, never from client-supplied fields.
const sockets = new Map();

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
        }
        break;
      }
      case 'signal': {
        if (!to) return sendError(ws, 'invalid recipient address');
        if (!isUint256(msg.callId)) return sendError(ws, 'invalid callId');
        const targetWs = sockets.get(to);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({
            type: 'signal',
            from: userAddress,
            callId: msg.callId.toString(),
            data: msg.data ?? null
          }));
        } else {
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
server.listen(PORT, () => {
  console.log(`🚀 Hail backend running on port ${PORT}`);
  console.log(`🔗 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔗 Chain: Robinhood (4663)`);
});

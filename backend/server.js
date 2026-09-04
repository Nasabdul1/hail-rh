import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import profiles from './routes/profiles.js';
import calls from './routes/calls.js';
import contacts from './routes/contacts.js';
import tokens from './routes/tokens.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

app.use('/api/profiles', profiles);
app.use('/api/calls', calls);
app.use('/api/contacts', contacts);
app.use('/api/tokens', tokens);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/ca', (req, res) => {
  const ca = process.env.HAIL_TOKEN_CA || '';
  res.json({ ca, active: !!ca });
});

// WebSocket registry: address -> ws
const sockets = new Map();

wss.on('connection', (ws) => {
  let userAddress = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'register' && msg.address) {
        userAddress = msg.address.toLowerCase();
        sockets.set(userAddress, ws);
        ws.send(JSON.stringify({ type: 'registered', address: userAddress }));
        console.log('WS registered:', userAddress);
      }

      if (msg.type === 'call' && msg.to && msg.callId) {
        const recipientWs = sockets.get(msg.to.toLowerCase());
        if (recipientWs && recipientWs.readyState === 1) {
          recipientWs.send(JSON.stringify({
            type: 'incoming_call',
            from: userAddress,
            callId: msg.callId,
            timestamp: Date.now()
          }));
          console.log('WS call notified:', msg.to);
        } else {
          console.log('WS recipient offline:', msg.to);
        }
      }

      if (msg.type === 'call_accepted' && msg.to) {
        const callerWs = sockets.get(msg.to.toLowerCase());
        if (callerWs && callerWs.readyState === 1) {
          callerWs.send(JSON.stringify({
            type: 'call_accepted',
            from: userAddress,
            timestamp: Date.now()
          }));
          console.log('WS call accepted forwarded to:', msg.to);
        }
      }

      if (msg.type === 'signal' && msg.to && msg.data) {
        const targetWs = sockets.get(msg.to.toLowerCase());
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({
            type: 'signal',
            from: userAddress,
            data: msg.data
          }));
        }
      }

      if (msg.type === 'end_call' && msg.to) {
        const targetWs = sockets.get(msg.to.toLowerCase());
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({ type: 'call_ended', from: userAddress }));
        }
      }
    } catch (e) {
      console.error('WS message error:', e.message);
    }
  });

  ws.on('close', () => {
    if (userAddress) sockets.delete(userAddress);
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    if (userAddress) sockets.delete(userAddress);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Hail backend running on port ${PORT}`);
  console.log(`🔗 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`🔗 Chain: Robinhood (4663)`);
});

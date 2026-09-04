import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const secret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) {
  console.warn('⚠️  AUTH_SECRET not set — generated a random secret; sessions will reset on restart');
}

export const TOKEN_TTL_SECONDS = 24 * 60 * 60;

// Token format: hail.<expiryUnix>.<address>.<hmac>
// where hmac = HMAC-SHA256(`${expiryUnix}.${address}`, AUTH_SECRET).
// The address is embedded in the payload so the token is self-contained:
// verification recovers the address instead of requiring the caller to
// supply a claim to check against.
export function mintToken(address) {
  const addr = address.toLowerCase();
  const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(`${expiry}.${addr}`)
    .digest('hex');
  return `hail.${expiry}.${addr}.${hmac}`;
}

export function parseToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'hail') return null;
  const [, expiryStr, addr, hmac] = parts;
  if (!/^\d+$/.test(expiryStr)) return null;
  const expiry = parseInt(expiryStr, 10);
  if (expiry * 1000 <= Date.now()) return null;
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return null;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${expiry}.${addr}`)
    .digest('hex');
  const a = Buffer.from(hmac, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { address: addr, expiry };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Unauthorized' });
  const parsed = parseToken(m[1]);
  if (!parsed) return res.status(401).json({ error: 'Unauthorized' });
  req.address = parsed.address;
  next();
}

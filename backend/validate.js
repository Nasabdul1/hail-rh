export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const UINT256_RE = /^\d+$/;

export function isAddress(value) {
  return typeof value === 'string' && ADDRESS_RE.test(value);
}

export function normalizeAddress(value) {
  return isAddress(value) ? value.toLowerCase() : null;
}

// Accepts uint256 as string or number; rejects negatives, decimals,
// leading-plus and values outside the BigInt range.
export function isUint256(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0;
  }
  if (typeof value !== 'string') return false;
  if (!UINT256_RE.test(value)) return false;
  try {
    const bi = BigInt(value);
    return bi >= 0n && bi <= 2n ** 256n - 1n;
  } catch {
    return false;
  }
}

export function isStringOfMaxLen(value, max) {
  return typeof value === 'string' && value.length <= max;
}

// Optional-string fields: absent or string within max length.
export function isOptionalStringOfMaxLen(value, max) {
  return value === undefined || value === null || isStringOfMaxLen(value, max);
}

export function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

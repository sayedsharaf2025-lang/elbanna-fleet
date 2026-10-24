// توكن جلسة السائق: payload.signature (HMAC-SHA256). مفيش JWT ولا مكتبات — Web Crypto بس.
// payload = { sub: driverId, pv: نسخة الرقم السري وقت الدخول, exp: ثواني Unix }
// لو المكتب غيّر الرقم السري أو ألغى الدخول بيتغيّر/يختفي pv فالتوكن بيبطل فورًا.

export interface DriverTokenPayload { sub: string; pv: number; exp: number }

export const DRIVER_TOKEN_TTL_SECONDS = 14 * 24 * 3600;

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64u = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signDriverToken(secret: string, payload: DriverTokenPayload): Promise<string> {
  const body = toB64u(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${toB64u(sig)}`;
}

export async function verifyDriverToken(secret: string, token: unknown, nowMs: number): Promise<DriverTokenPayload | null> {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64u(parts[1]), enc.encode(parts[0]));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(fromB64u(parts[0])));
    if (typeof p?.sub !== 'string' || typeof p?.pv !== 'number' || typeof p?.exp !== 'number') return null;
    if (p.exp * 1000 <= nowMs) return null;
    return { sub: p.sub, pv: p.pv, exp: p.exp };
  } catch {
    return null;
  }
}

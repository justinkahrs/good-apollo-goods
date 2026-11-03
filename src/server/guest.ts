import { randomBytes } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { config } from './config';
export function guest(cookies: AstroCookies) {
  const existing = cookies.get('gag_guest')?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const value = randomBytes(32).toString('hex');
  cookies.set('gag_guest', value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config().APP_URL.startsWith('https://'),
    maxAge: 30 * 86400,
  });
  return value;
}

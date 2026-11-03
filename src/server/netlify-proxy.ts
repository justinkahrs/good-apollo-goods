import { createHmac, timingSafeEqual } from 'node:crypto';

type NetlifyProxyClaims = {
  deploy_context?: string;
  exp?: number;
  iss?: string;
  netlify_id?: string;
};

export function shouldVerifyNetlifyProxy(
  hostname: string,
  configuredProxyHost: string | undefined,
  isProduction: boolean,
) {
  return (
    isProduction &&
    !!configuredProxyHost &&
    hostname.toLowerCase() === configuredProxyHost.toLowerCase()
  );
}

function decodeObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
  } catch {
    // Invalid tokens are treated as untrusted requests.
  }
  return undefined;
}

export function verifyNetlifyProxyToken(
  token: string | null | undefined,
  secret: string | undefined,
  expectedSiteId: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return (
    netlifyProxyTokenStatus(token, secret, expectedSiteId, nowSeconds) ===
    'valid'
  );
}

export function netlifyProxyTokenStatus(
  token: string | null | undefined,
  secret: string | undefined,
  expectedSiteId: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!token) return 'missing-token';
  if (token.length > 8192) return 'oversized-token';
  if (!secret || secret.length < 32 || !expectedSiteId)
    return 'origin-config';

  const [encodedHeader, encodedClaims, encodedSignature, ...extra] =
    token.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length)
    return 'malformed-token';

  const header = decodeObject(encodedHeader);
  const claims = decodeObject(encodedClaims) as
    | NetlifyProxyClaims
    | undefined;
  if (
    header?.alg !== 'HS256' ||
    claims?.iss !== 'netlify' ||
    claims.deploy_context !== 'production' ||
    claims.netlify_id !== expectedSiteId ||
    !Number.isSafeInteger(claims.exp) ||
    (claims.exp ?? 0) <= nowSeconds
  )
    return 'invalid-claims';

  const expected = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedClaims}`)
    .digest();
  const actual = Buffer.from(encodedSignature, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? 'valid'
    : 'signature-mismatch';
}

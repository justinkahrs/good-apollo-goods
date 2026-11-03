import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  shouldVerifyNetlifyProxy,
  verifyNetlifyProxyToken,
} from '../src/server/netlify-proxy';

const secret = 'proxy-secret-for-test-only-0123456789abcdef';
const siteId = '67ef9422-b0c3-4e76-97ce-67f9425d23c6';

function token(
  claims: Record<string, unknown>,
  signingSecret = secret,
) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const productionClaims = {
  deploy_context: 'production',
  exp: 1100,
  iss: 'netlify',
  netlify_id: siteId,
};

describe('Netlify origin proxy authentication', () => {
  it('requires a signature only on the configured proxy host in production', () => {
    expect(
      shouldVerifyNetlifyProxy(
        'n8n.senna-automation.com',
        'n8n.senna-automation.com',
        true,
      ),
    ).toBe(true);
    expect(
      shouldVerifyNetlifyProxy(
        'goodapollogoods.com',
        'n8n.senna-automation.com',
        true,
      ),
    ).toBe(false);
    expect(
      shouldVerifyNetlifyProxy(
        'n8n.senna-automation.com',
        'n8n.senna-automation.com',
        false,
      ),
    ).toBe(false);
  });

  it('accepts a current production signature from the configured Netlify site', () => {
    expect(
      verifyNetlifyProxyToken(
        token(productionClaims),
        secret,
        siteId,
        1000,
      ),
    ).toBe(true);
  });

  it('rejects altered signatures, expired tokens, other sites, and previews', () => {
    const signed = token(productionClaims);
    const [header, payload, signature] = signed.split('.');
    const changed = `${header}.${payload}.${signature?.slice(0, -1)}x`;
    expect(verifyNetlifyProxyToken(changed, secret, siteId, 1000)).toBe(false);
    expect(
      verifyNetlifyProxyToken(token({ ...productionClaims, exp: 999 }), secret, siteId, 1000),
    ).toBe(false);
    expect(
      verifyNetlifyProxyToken(token(productionClaims), secret, 'another-site', 1000),
    ).toBe(false);
    expect(
      verifyNetlifyProxyToken(
        token({ ...productionClaims, deploy_context: 'deploy-preview' }),
        secret,
        siteId,
        1000,
      ),
    ).toBe(false);
  });

  it('fails closed when the token or production secret is missing', () => {
    expect(verifyNetlifyProxyToken(null, secret, siteId)).toBe(false);
    expect(verifyNetlifyProxyToken(token(productionClaims), undefined, siteId)).toBe(
      false,
    );
  });
});

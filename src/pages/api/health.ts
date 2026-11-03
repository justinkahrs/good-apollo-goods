import type { APIRoute } from 'astro';
import { healthReport } from '../../server/maintenance';
import { json } from '../../server/http';
import { salesReady } from '../../server/config';
import { db } from '../../server/db';
export const prerender = false;
export const GET: APIRoute = async () => {
  try {
    const health = await healthReport();
    const settings = await db().storeSettings.findUnique({
      where: { id: 'store' },
    });
    return json(
      {
        status: health.ready ? 'ready' : 'attention',
        checkout:
          salesReady() && health.ready && settings?.taxConfigured
            ? 'enabled'
            : 'disabled',
      },
      health.ready ? 200 : 503,
    );
  } catch {
    return json({ status: 'unavailable', checkout: 'disabled' }, 503);
  }
};

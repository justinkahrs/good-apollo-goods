import type { APIRoute } from 'astro';
import { config } from '../../server/config';
import { json, secretEquals } from '../../server/http';
import { monitor } from '../../server/maintenance';
import { deliverOutbox } from '../../server/email';
export const prerender = false;
// Invoke independently of the commerce scheduler. A provider-side status monitor
// must also alert on 5xx/timeouts, including failures of this route or SMTP itself.
export const GET: APIRoute = async ({ request }) => {
  const secret = config().CRON_SECRET;
  if (
    !secret ||
    !secretEquals(
      request.headers.get('authorization') ?? '',
      `Bearer ${secret}`,
    )
  )
    return json({ error: 'Unauthorized' }, 401);
  try {
    const report = await monitor();
    await deliverOutbox(2, 'alert');
    return json(
      { status: report.ready ? 'ready' : 'attention' },
      report.ready ? 200 : 503,
    );
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
};

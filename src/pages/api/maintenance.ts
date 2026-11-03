import type { APIRoute } from 'astro';
import { config } from '../../server/config';
import { maintenance } from '../../server/maintenance';
import { secretEquals, json } from '../../server/http';
export const prerender = false;
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
    return json(await maintenance());
  } catch {
    return json({ error: 'Maintenance failed' }, 503);
  }
};

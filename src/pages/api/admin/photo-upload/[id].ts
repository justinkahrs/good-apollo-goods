import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminSession } from '../../../../server/auth';
import { failure, json, limit, originGuard } from '../../../../server/http';
import { MAX_UPLOAD, storePhotoUpload } from '../../../../server/photos';
import { DomainError } from '../../../../server/domain';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    originGuard(request);
    const session = await adminSession(request);
    await limit(request, 'upload', 20, 60, session.user.id);
    const id = z.uuid().parse(params.id);
    if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD)
      throw new DomainError('Photo must be 10 MB or smaller.', 413);
    const type = request.headers.get('content-type') ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
      throw new DomainError('Choose a JPEG, PNG or WebP photo.');
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError('Choose a photo to upload.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD) {
        await reader.cancel();
        throw new DomainError('Photo must be 10 MB or smaller.', 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return json(await storePhotoUpload(session.user.id, id, type, bytes));
  } catch (error) {
    return failure(error);
  }
};

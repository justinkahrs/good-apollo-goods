import type { APIRoute } from 'astro';
import { listingLifecycle } from '../../../server/listing-lifecycle';
import { editorProduct } from '../../../server/catalog';
import { db } from '../../../server/db';
import { z } from 'zod';
import { adminSession } from '../../../server/auth';
import { body, originGuard, limit, json, failure } from '../../../server/http';
import { saveProduct, duplicateProduct } from '../../../server/catalog';
import {
  uploadIntent,
  deletePhoto,
  finalizePhoto,
  savePhotos,
} from '../../../server/photos';
import { adjustStock } from '../../../server/stock';
import {
  shipOrder,
  cancelOrder,
  requestRefund,
  restockOrder,
} from '../../../server/orders';
import { atomic } from '../../../server/db';
import { cents, DomainError } from '../../../server/domain';
import { maintenance } from '../../../server/maintenance';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    originGuard(request);
    const session = await adminSession(request);
    await limit(request, 'admin-action', 60, 60, session.user.id);
    const v = z
      .object({
        action: z.enum([
          'mutation.get',
          'product.get',
          'product.delete',
          'product.restore',
          'product.purge',
          'product.save',
          'product.duplicate',
          'photo.intent',
          'photo.finalize',
          'photo.save',
          'photo.delete',
          'stock.adjust',
          'order.ship',
          'order.cancel',
          'order.refund',
          'order.restock',
          'settings.save',
          'maintenance',
          'sessions.revoke',
        ]),
        data: z.unknown(),
      })
      .parse(await body(request, 300000));
    const actor = session.user.id;
    switch (v.action) {
      case 'mutation.get': {
        const id = z.object({ id: z.uuid() }).parse(v.data).id;
        const receipt = await db().adminMutation.findUnique({ where: { id } });
        return json({
          result: receipt?.actorId === actor ? receipt.result : null,
        });
      }
      case 'product.get':
        return json(
          await editorProduct(
            db(),
            z.object({ id: z.uuid() }).parse(v.data).id,
          ),
        );
      case 'product.delete':
      case 'product.restore':
      case 'product.purge':
        return json(await listingLifecycle(actor, v.action, v.data));
      case 'product.save':
        return json(await saveProduct(actor, v.data));
      case 'product.duplicate':
        return json(
          await duplicateProduct(
            actor,
            z.object({ id: z.uuid() }).parse(v.data).id,
            z.object({ operationKey: z.uuid().optional() }).parse(v.data)
              .operationKey,
          ),
        );
      case 'photo.intent':
        await limit(request, 'upload', 20, 60, actor);
        return json(await uploadIntent(actor, v.data));
      case 'photo.finalize': {
        const image = await finalizePhoto(
          actor,
          z.object({ id: z.uuid() }).parse(v.data).id,
        );
        return json({
          image,
          product: await editorProduct(db(), image.productId),
        });
      }
      case 'photo.save':
        return json(await savePhotos(actor, v.data));
      case 'photo.delete':
        return json(await deletePhoto(actor, v.data));
      case 'stock.adjust':
        return json(await adjustStock(actor, v.data));
      case 'order.ship':
        return json(await shipOrder(actor, v.data));
      case 'order.cancel':
        return json(await cancelOrder(actor, v.data));
      case 'order.refund':
        return json(await requestRefund(actor, v.data));
      case 'order.restock':
        return json(await restockOrder(actor, v.data));
      case 'maintenance':
        return json(await maintenance());
      case 'sessions.revoke':
        await atomic(async (tx) => {
          await tx.session.deleteMany({
            where: { userId: actor, id: { not: session.session.id } },
          });
          await tx.audit.create({
            data: {
              actorId: actor,
              action: 'auth.revoke_others',
              entityId: actor,
            },
          });
        });
        return json({ ok: true });
      case 'settings.save': {
        const s = z
          .object({
            revision: z.number().int(),
            shipping: z.string(),
            processingWindow: z.string().trim().min(3).max(120),
            taxEnabled: z.boolean(),
            taxConfigured: z.boolean(),
            taxDecision: z.string().trim().min(10).max(1000),
          })
          .parse(v.data);
        await atomic(async (tx) => {
          const old = await tx.storeSettings.findUniqueOrThrow({
            where: { id: 'store' },
          });
          if (old.revision !== s.revision)
            throw new DomainError(
              'Settings changed. Reload before saving.',
              409,
              'revision',
            );
          await tx.storeSettings.update({
            where: { id: 'store' },
            data: {
              shippingCents: cents(s.shipping, true),
              processingWindow: s.processingWindow,
              taxEnabled: s.taxEnabled,
              taxConfigured: s.taxConfigured,
              taxDecision: s.taxDecision,
              revision: { increment: 1 },
            },
          });
          await tx.audit.create({
            data: {
              actorId: actor,
              action: 'settings.save',
              entityId: 'store',
              metadata: {
                shippingCents: cents(s.shipping, true),
                taxEnabled: s.taxEnabled,
              },
            },
          });
        });
        return json({ ok: true });
      }
    }
  } catch (e) {
    return failure(e);
  }
};

import type { APIRoute } from 'astro';
import { adminSession } from '../../../server/auth';
import { db } from '../../../server/db';
import { csvCell, DomainError } from '../../../server/domain';
import { failure, privateHeaders, limit } from '../../../server/http';
export const prerender = false;
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const { user } = await adminSession(request);
    await limit(request, 'export', 5, 60, user.id);
    const kind = url.searchParams.get('kind');
    let rows: unknown[][] = [];
    if (kind === 'catalog' || kind === 'stock') {
      const variants = await db().variant.findMany({
        include: { product: true, stock: true },
        take: 10000,
        orderBy: { sku: 'asc' },
      });
      rows = [
        [
          'Product',
          'Web address',
          'State',
          'Variant',
          'SKU',
          'Price USD',
          'Unsold',
          'Held',
          'Available',
        ],
        ...variants.map((v) => [
          v.product.name,
          v.product.slug,
          v.product.status,
          v.label,
          v.sku,
          (v.priceCents / 100).toFixed(2),
          v.stock?.unsoldQty ?? 0,
          v.stock?.heldQty ?? 0,
          (v.stock?.unsoldQty ?? 0) - (v.stock?.heldQty ?? 0),
        ]),
      ];
    } else if (kind === 'orders') {
      const orders = await db().order.findMany({
        include: { items: true, shipment: true },
        take: 10000,
        orderBy: { createdAt: 'desc' },
      });
      rows = [
        [
          'Order',
          'Created',
          'Payment',
          'Fulfillment',
          'Canceled',
          'Email',
          'Product',
          'Variant',
          'SKU',
          'Quantity',
          'Unit USD',
          'Line USD',
          'Subtotal USD',
          'Shipping USD',
          'Tax USD',
          'Total USD',
          'Refunded USD',
          'Carrier',
          'Tracking',
        ],
        ...orders.flatMap((o) =>
          o.items.map((i) => [
            o.number,
            o.createdAt.toISOString(),
            o.paymentStatus,
            o.fulfillmentStatus,
            Boolean(o.canceledAt),
            o.email,
            i.productName,
            i.variantLabel,
            i.sku,
            i.quantity,
            (i.unitPriceCents / 100).toFixed(2),
            (i.lineTotalCents / 100).toFixed(2),
            (o.subtotalCents / 100).toFixed(2),
            (o.shippingCents / 100).toFixed(2),
            (o.taxCents / 100).toFixed(2),
            (o.totalCents / 100).toFixed(2),
            (o.refundedCents / 100).toFixed(2),
            o.shipment?.carrier,
            o.shipment?.trackingNumber,
          ]),
        ),
      ];
    } else throw new DomainError('Choose catalog, stock or orders.');
    await db().audit.create({
      data: {
        actorId: user.id,
        action: `export.${kind}`,
        entityId: 'store',
        metadata: { rows: rows.length - 1 },
      },
    });
    return new Response(
      rows.map((r) => r.map(csvCell).join(',')).join('\r\n'),
      {
        headers: {
          ...privateHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="good-apollo-${kind}.csv"`,
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
};

import nodemailer from 'nodemailer';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { db, type Tx } from './db';
import { config } from './config';
export async function enqueue(
  tx: Tx,
  key: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await tx.emailOutbox.createMany({
    data: { dedupeKey: key, kind, payload: payload as never },
    skipDuplicates: true,
  });
}
function content(kind: string, payload: Record<string, unknown>) {
  if (kind === 'signin')
    return {
      to: String(payload.email),
      subject: 'Sign in to Good Apollo Goods',
      text: `Your sign-in link expires in 15 minutes. Open it on the same device:\n\n${payload.url}\n\nIf you did not request this, ignore this email.`,
    };
  if (kind === 'alert')
    return {
      to: config().ADMIN_EMAIL,
      subject: 'Good Apollo Goods needs attention',
      text: `Store maintenance needs attention: ${payload.reason}. Open ${config().APP_URL}/admin/settings/ to review it.`,
    };
  if (kind === 'shipment')
    return {
      to: String(payload.email),
      subject: `Your Good Apollo order #${payload.number} has shipped`,
      text: `Your complete order has shipped with ${payload.carrier}.\nTracking: ${payload.trackingNumber}\n${payload.trackingUrl}\n\nThank you for supporting Good Apollo Goods. For help, reply to this email.`,
    };
  const items =
    (payload.items as Array<{
      name: string;
      label: string;
      quantity: number;
    }>) ?? [];
  const refundedCents = Number(payload.refundedCents ?? 0);
  const buyerStatus =
    refundedCents >= Number(payload.totalCents)
      ? 'A full refund has been recorded. For help, reply to this email.'
      : payload.canceled
        ? 'This order has been canceled. For help, reply to this email.'
        : payload.attention
          ? 'The maker is reviewing your order before packing. For help, reply to this email.'
          : 'We will email tracking after your order has shipped. For current order status or help, reply to this email.';
  const text = `Order #${payload.number}\n${items.map((i) => `${i.quantity} × ${i.name} — ${i.label}`).join('\n')}\n\nTotal: $${(Number(payload.totalCents) / 100).toFixed(2)} USD${refundedCents > 0 ? `\nRefund recorded: $${(refundedCents / 100).toFixed(2)} USD` : ''}\nProcessing: ${payload.processingWindow}\n\n${kind === 'operator' ? 'Open the Orders screen to review packing and payment status.' : buyerStatus}`;
  return {
    to: kind === 'operator' ? config().ADMIN_EMAIL : String(payload.email),
    subject:
      kind === 'operator'
        ? `New paid order #${payload.number}`
        : `Thank you for your order #${payload.number}`,
    text,
  };
}
export async function deliverOutbox(
  limit = 10,
  kind?: string,
  deadline = Date.now() + 45000,
  messageId?: string,
) {
  const e = config();
  const commerceRoute = !!e.COMMERCE_EMAIL_API_URL && !!e.COMMERCE_EMAIL_HMAC_SECRET;
  if (!commerceRoute && !e.SMTP_HOST) return { delivered: 0, failed: 0 };
  const transporter = !commerceRoute && e.SMTP_HOST ? nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    requireTLS: e.NODE_ENV === 'production' && !e.SMTP_SECURE,
    auth: e.SMTP_USER
      ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 5000,
    socketTimeout: 10000,
  }) : undefined;
  let delivered = 0,
    failed = 0;
  for (let n = 0; n < limit;) {
    if (Date.now() >= deadline) break;
    const now = new Date();
    const candidate = await db().emailOutbox.findFirst({
      where: {
        ...(kind ? { kind } : {}),
        ...(messageId ? { id: messageId } : {}),
        status: { in: ['pending', 'retry'] },
        availableAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) break;
    if (
      candidate.kind === 'signin' &&
      candidate.createdAt.getTime() + 15 * 60_000 <= now.getTime()
    ) {
      await db().emailOutbox.updateMany({
        where: {
          id: candidate.id,
          status: { in: ['pending', 'retry'] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: {
          status: 'expired',
          leaseUntil: null,
          lastError: 'signin_link_expired',
        },
      });
      continue;
    }
    const claim = await db().emailOutbox.updateMany({
      where: {
        id: candidate.id,
        status: { in: ['pending', 'retry'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    n++;
    try {
      const message = content(
        candidate.kind,
        candidate.payload as Record<string, unknown>,
      );
      if (commerceRoute) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const nonce = randomUUID();
        const path = '/v1/good-apollo/commerce/send';
        const type = candidate.kind === 'buyer' ? 'order' : candidate.kind;
        const payload = { ...(candidate.payload as Record<string, unknown>) };
        if (['order', 'operator', 'shipment'].includes(type))
          payload.number = String(payload.number);
        if (type === 'operator') delete payload.email;
        const body = JSON.stringify({ messageId: candidate.id, type, recipient: message.to, payload });
        const bodyHash = createHash('sha256').update(body).digest('hex');
        const signature = createHmac('sha256', e.COMMERCE_EMAIL_HMAC_SECRET!)
          .update([timestamp, nonce, 'POST', path, bodyHash].join('\n')).digest('hex');
        const response = await fetch(new URL(path, e.COMMERCE_EMAIL_API_URL), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Good-Apollo-Timestamp': timestamp,
            'X-Good-Apollo-Nonce': nonce,
            'X-Good-Apollo-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(50000),
        });
        if (!response.ok) throw new Error('commerce_email_route_rejected');
      } else {
        await transporter!.sendMail({
          ...message,
          from: e.SMTP_FROM,
          replyTo: e.SUPPORT_EMAIL,
          messageId: `<${candidate.id}@goodapollogoods.com>`,
        });
      }
      await db().emailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: 'delivered',
          deliveredAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      });
      delivered++;
    } catch {
      await db().emailOutbox.update({
        where: { id: candidate.id },
        data: {
          status: 'retry',
          leaseUntil: null,
          lastError: 'mail_delivery_failed',
          availableAt: new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(candidate.attempts, 7)),
          ),
        },
      });
      failed++;
    }
  }
  transporter?.close();
  return { delivered, failed };
}

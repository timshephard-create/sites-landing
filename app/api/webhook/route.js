import Stripe from 'stripe';
import { NextResponse, after } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// In-memory idempotency guard — prevents double-processing within the same
// server instance. Resets on Vercel cold starts.
const processedEvents = new Set();

export async function POST(request) {
  const startTime = Date.now();
  console.log('[WEBHOOK] ========== INCOMING REQUEST ==========');
  console.log('[WEBHOOK] Timestamp:', new Date().toISOString());

  // Derive the origin from the incoming request
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host');
  const origin = `${proto}://${host}`;
  console.log('[WEBHOOK] Derived origin:', origin);
  console.log('[WEBHOOK] x-forwarded-proto:', proto);
  console.log('[WEBHOOK] host header:', host);

  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  console.log('[WEBHOOK] Body length:', body.length);
  console.log('[WEBHOOK] Stripe signature present:', !!sig);
  console.log('[WEBHOOK] Webhook secret present:', !!process.env.STRIPE_WEBHOOK_SECRET);
  console.log('[WEBHOOK] Webhook secret prefix:', process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 10) + '...');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('[WEBHOOK] Signature VERIFIED successfully');
  } catch (err) {
    console.error('[WEBHOOK] Signature FAILED:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  console.log('[WEBHOOK] Event type:', event.type);
  console.log('[WEBHOOK] Event ID:', event.id);
  console.log('[WEBHOOK] Already processed:', processedEvents.has(event.id));
  console.log('[WEBHOOK] processedEvents size:', processedEvents.size);

  if (event.type === 'checkout.session.completed' && !processedEvents.has(event.id)) {
    processedEvents.add(event.id);
    const session = event.data.object;
    const url = session.metadata?.websiteUrl;
    const email = session.customer_email;

    console.log('[WEBHOOK] Session ID:', session.id);
    console.log('[WEBHOOK] Customer email:', email);
    console.log('[WEBHOOK] Website URL from metadata:', url);
    console.log('[WEBHOOK] Payment status:', session.payment_status);
    console.log('[WEBHOOK] All metadata keys:', JSON.stringify(session.metadata));

    if (!url || !email) {
      console.error('[WEBHOOK] MISSING DATA — url:', url, 'email:', email, 'eventId:', event.id);
      return NextResponse.json({ received: true });
    }

    const reportUrl = `${origin}/api/report`;
    console.log('[WEBHOOK] Will trigger report at:', reportUrl);
    console.log('[WEBHOOK] Registering after() callback now...');

    after(async () => {
      const afterStart = Date.now();
      console.log('[WEBHOOK:AFTER] ===== after() callback STARTED =====');
      console.log('[WEBHOOK:AFTER] Time since webhook start:', afterStart - startTime, 'ms');
      console.log('[WEBHOOK:AFTER] Calling:', reportUrl);
      try {
        const res = await fetch(reportUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, email })
        });
        const elapsed = Date.now() - afterStart;
        console.log('[WEBHOOK:AFTER] Response status:', res.status);
        console.log('[WEBHOOK:AFTER] Response elapsed:', elapsed, 'ms');
        if (!res.ok) {
          const errText = await res.text();
          console.error('[WEBHOOK:AFTER] REPORT FAILED:', res.status, errText);
        } else {
          console.log('[WEBHOOK:AFTER] REPORT SUCCESS for:', email);
        }
      } catch (err) {
        const elapsed = Date.now() - afterStart;
        console.error('[WEBHOOK:AFTER] FETCH ERROR after', elapsed, 'ms:', err.message);
        console.error('[WEBHOOK:AFTER] Error name:', err.name);
        console.error('[WEBHOOK:AFTER] Error cause:', err.cause);
      }
      console.log('[WEBHOOK:AFTER] ===== after() callback ENDED =====');
    });

    console.log('[WEBHOOK] after() registered, returning 200 now');
  } else if (event.type !== 'checkout.session.completed') {
    console.log('[WEBHOOK] IGNORED — event type is not checkout.session.completed');
  } else {
    console.log('[WEBHOOK] SKIPPED — event already processed (duplicate)');
  }

  const elapsed = Date.now() - startTime;
  console.log('[WEBHOOK] Returning 200 after', elapsed, 'ms');
  console.log('[WEBHOOK] ========== END REQUEST ==========');
  return NextResponse.json({ received: true });
}

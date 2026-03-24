import Stripe from 'stripe';
import { NextResponse, after } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// In-memory idempotency guard — prevents double-processing within the same
// server instance. NOTE: This resets on Vercel cold starts. For production
// scale, consider using a KV store (Vercel KV, Upstash Redis) keyed by
// event.id with a 24h TTL. Stripe's built-in retry backoff (1h, 6h, 24h)
// partially mitigates this since cold starts are frequent enough to process
// each event at most once per instance.
const processedEvents = new Set();

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' && !processedEvents.has(event.id)) {
    processedEvents.add(event.id);
    const session = event.data.object;
    const url = session.metadata?.websiteUrl;
    const email = session.customer_email;

    if (!url || !email) {
      console.error('Webhook missing metadata:', { url, email, eventId: event.id });
      return NextResponse.json({ received: true });
    }

    // after() runs once the 200 is sent, keeping the lambda alive until the
    // report fetch completes — prevents Stripe retries without abandoning the job.
    after(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, email })
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('Report generation failed:', res.status, errText, '| email:', email, '| url:', url);
        }
      } catch (err) {
        console.error('Report generation error:', err.message, '| email:', email, '| url:', url);
      }
    });
  }

  // Always return 200 immediately so Stripe does not retry
  return NextResponse.json({ received: true });
}

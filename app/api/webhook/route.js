import Stripe from 'stripe';
import { NextResponse, after } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// In-memory idempotency guard — prevents double-processing within the same instance
const processedEvents = new Set();

export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' && !processedEvents.has(event.id)) {
    processedEvents.add(event.id);
    const session = event.data.object;
    const url = session.metadata.websiteUrl;
    const email = session.customer_email;

    // after() runs once the 200 is sent, keeping the lambda alive until the
    // report fetch completes — prevents Stripe retries without abandoning the job.
    after(async () => {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, email })
        });
      } catch (err) {
        console.error('Report generation error:', err);
      }
    });
  }

  // Always return 200 immediately so Stripe does not retry
  return NextResponse.json({ received: true });
}
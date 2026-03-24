import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();
  // Support both param styles: {url, email} and {websiteUrl, email}
  const email = body.email;
  const websiteUrl = body.websiteUrl || body.url;

  if (!email || !websiteUrl) {
    return Response.json({ error: 'Missing email or websiteUrl' }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      customer_email: email,
      metadata: { websiteUrl, email },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
    });

    return Response.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e.message);
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}

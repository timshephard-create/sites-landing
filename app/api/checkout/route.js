import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  const { url, email } = await request.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Full Website Audit Report + Homepage Mockup',
            description: `Complete SEO, performance & conversion audit for ${url}`,
          },
          unit_amount: 14700,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    customer_email: email,
    metadata: { url },
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
  });

  return Response.json({ url: session.url });
}

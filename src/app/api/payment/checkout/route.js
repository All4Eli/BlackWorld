import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { BLOOD_STONE_PACKS, DARK_PACT } from '@/lib/packs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://blackworld.vercel.app';

function getStripe() {
  const Stripe = require('stripe').default || require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const stripe = getStripe();
    const { type, packKey } = await req.json();

    // ──── SUBSCRIPTION (Dark Pact) ────
    if (type === 'subscription') {
      const { sqlOne } = await import('@/lib/db/pool');
      const { data: player } = await sqlOne(
        'SELECT stripe_customer_id, subscription_status FROM players WHERE clerk_user_id = $1',
        [userId]
      );

      let customerId = player?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          metadata: { userId, game: 'blackworld' },
        });
        customerId = customer.id;
        await sqlOne(
          'UPDATE players SET stripe_customer_id = $1 WHERE clerk_user_id = $2 RETURNING *',
          [customerId, userId]
        );
      }

      if (player?.subscription_status === 'active') {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${APP_URL}?tab=dashboard`,
        });
        return NextResponse.json({ url: portal.url });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Dark Pact — Monthly Subscription',
              description: '450 Blood Stones/mo, +50 Essence, +25% Regen, Auto-Loot, +20 Inventory',
            },
            unit_amount: DARK_PACT.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        metadata: { userId, type: 'dark_pact' },
        success_url: `${APP_URL}?tab=dashboard&upgraded=dark_pact`,
        cancel_url: `${APP_URL}?tab=dashboard&cancelled=true`,
      });

      return NextResponse.json({ url: session.url });
    }

    // ──── ONE-TIME PACK PURCHASE ────
    const pack = BLOOD_STONE_PACKS[packKey];
    if (!pack) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${pack.name} — BlackWorld`,
            description: pack.description,
          },
          unit_amount: pack.price,
        },
        quantity: 1,
      }],
      metadata: { userId, type: 'pack', packKey },
      success_url: `${APP_URL}?tab=dashboard&upgraded=${packKey}`,
      cancel_url: `${APP_URL}?tab=dashboard&cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[CHECKOUT ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

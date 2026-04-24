import { NextResponse } from 'next/server';
import { BLOOD_STONE_PACKS } from '@/lib/packs';

function getStripe() {
  const Stripe = require('stripe').default || require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Must be raw body for Stripe signature verification
export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[WEBHOOK SIGNATURE ERROR]', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { sql, sqlOne } = await import('@/lib/dal');

  try {
    switch (event.type) {
      // ──── ONE-TIME PACK PURCHASE COMPLETED ────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, type, packKey } = session.metadata || {};

        if (!userId) break;

        if (type === 'pack' && packKey) {
          const pack = BLOOD_STONE_PACKS[packKey];
          if (!pack) break;

          // Credit Blood Stones
          const { data: hero } = await sqlOne(
            `UPDATE hero_stats SET blood_stones = blood_stones + $2, blood_stones_earned = blood_stones_earned + $2
             WHERE player_id = $1 RETURNING blood_stones`,
            [userId, pack.bloodStones]
          );

          // Activate Donator status
          await sqlOne(
            `UPDATE players SET donator_status = true,
               donator_expires_at = GREATEST(COALESCE(donator_expires_at, now()), now()) + ($2 || ' days')::interval
             WHERE clerk_user_id = $1 RETURNING *`,
            [userId, pack.donatorDays]
          );

          // Log transaction
          await sql(
            `INSERT INTO blood_stone_transactions (player_id, amount, balance_after, source, description, stripe_session_id)
             VALUES ($1, $2, $3, 'purchase', $4, $5)`,
            [userId, pack.bloodStones, hero?.blood_stones || pack.bloodStones, `Purchased ${pack.name}`, session.id]
          );

          // Log premium purchase
          await sql(
            `INSERT INTO premium_purchases (player_id, pack_type, amount_paid, blood_stones, donator_days, stripe_session_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, packKey, pack.price, pack.bloodStones, pack.donatorDays, session.id]
          );

          console.log(`[PACK PURCHASED] ${userId} bought ${pack.name} (+${pack.bloodStones} BS)`);
        }

        // Dark Pact subscription activation is handled by invoice.payment_succeeded
        if (type === 'dark_pact') {
          console.log(`[DARK PACT] Checkout completed for ${userId}`);
        }
        break;
      }

      // ──── SUBSCRIPTION ACTIVATED / RENEWED ────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle') {
          const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
          const userId = sub.metadata?.userId;
          if (!userId) break;

          // Set subscription active
          await sqlOne(
            `UPDATE players SET subscription_id = $2, subscription_status = 'active',
               donator_status = true, donator_expires_at = to_timestamp($3)
             WHERE clerk_user_id = $1 RETURNING *`,
            [userId, sub.id, sub.current_period_end]
          );

          // Credit daily stipend (15 BS) on each renewal
          const stipendAmount = invoice.billing_reason === 'subscription_create' ? 15 : 15;
          const { data: hero } = await sqlOne(
            `UPDATE hero_stats SET blood_stones = blood_stones + $2, blood_stones_earned = blood_stones_earned + $2
             WHERE player_id = $1 RETURNING blood_stones`,
            [userId, stipendAmount]
          );

          await sql(
            `INSERT INTO blood_stone_transactions (player_id, amount, balance_after, source, description)
             VALUES ($1, $2, $3, 'subscription_stipend', $4)`,
            [userId, stipendAmount, hero?.blood_stones || 0,
             invoice.billing_reason === 'subscription_create' ? 'Dark Pact activated' : 'Dark Pact renewed']
          );

          console.log(`[DARK PACT] ${invoice.billing_reason} for ${userId}`);
        }
        break;
      }

      // ──── SUBSCRIPTION CANCELLED ────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await sqlOne(
          `UPDATE players SET subscription_status = 'cancelled', subscription_id = NULL
           WHERE clerk_user_id = $1 RETURNING *`,
          [userId]
        );

        console.log(`[DARK PACT CANCELLED] ${userId}`);
        break;
      }

      // ──── PAYMENT FAILED ────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const sub = invoice.subscription ? await getStripe().subscriptions.retrieve(invoice.subscription) : null;
        const userId = sub?.metadata?.userId;
        if (!userId) break;

        await sqlOne(
          `UPDATE players SET subscription_status = 'past_due' WHERE clerk_user_id = $1 RETURNING *`,
          [userId]
        );

        console.log(`[PAYMENT FAILED] ${userId}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[WEBHOOK PROCESSING ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

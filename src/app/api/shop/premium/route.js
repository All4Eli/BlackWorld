// ═══════════════════════════════════════════════════════════════════
// POST /api/shop/premium — Purchase Premium Blood Stone Items
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as PremiumDal from '@/lib/db/dal/premium';

/**
 * POST /api/shop/premium
 *
 * Body: { itemKey: "string" }
 *
 * Validates the item exists in catalog, locks the player row securely,
 * and deducts the Blood Stones. Returns idempotently.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { itemKey } = body;

    if (!itemKey) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'itemKey is required.' },
        { status: 400 }
      );
    }

    const { data: purchaseData, error } = await PremiumDal.purchasePremiumItem(userId, itemKey);

    if (error) {
      const msg = error.message;
      let status = 400; // General purchase constraint fails
      
      if (msg.includes('Invalid premium item')) status = 404;
      if (msg.includes('Insufficient Blood Stones')) status = 403;

      return NextResponse.json({ error: 'TRANSACTION_FAILED', message: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      message: purchaseData.message,
      newBalance: purchaseData.newBalance
    });

  } catch (err) {
    console.error('[POST /api/shop/premium]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'A critical error occurred processing the transaction.' },
      { status: 500 }
    );
  }
}

// ── Rate Limit & Idempotency ──
// Use the strictest settings since real value is exchanging hands
export const POST = withMiddleware(handlePost, {
  rateLimit: 'bank', // Or generic limit, 'bank' is usually strict enough
  idempotency: true, // Prevents a double-charge if a user lags out and double clicks Purchase
});

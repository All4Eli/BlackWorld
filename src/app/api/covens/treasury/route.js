// ═══════════════════════════════════════════════════════════════════
// POST /api/covens/treasury — Deposit or Withdraw Guild Funds
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as CovensDal from '@/lib/db/dal/covens';

/**
 * POST /api/covens/treasury
 * 
 * Body: { action: "deposit" | "withdraw", amount: 500 }
 * 
 * Securely interacts with coven treasury balances.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { action, amount } = body;
    const parsedAmount = parseInt(amount, 10);

    if (!parsedAmount || parsedAmount <= 0) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Invalid amount.' }, { status: 400 });
    }
    if (action !== 'deposit' && action !== 'withdraw') {
      return NextResponse.json({ error: 'BAD_REQUEST', message: 'Action must be deposit or withdraw.' }, { status: 400 });
    }

    let result;
    if (action === 'withdraw') {
      result = await CovensDal.withdrawFromTreasury(userId, parsedAmount);
    } else {
      result = await CovensDal.depositToTreasury(userId, parsedAmount);
    }

    if (result.error) {
      const msg = result.error.message;
      let status = 400;
      if (msg.includes('Not found') || msg.includes('not in a Coven')) status = 404;
      if (msg.includes('Insufficient') || msg.includes('Unauthorized')) status = 403;

      return NextResponse.json({ error: 'TRANSACTION_FAILED', message: msg }, { status });
    }

    // SANITIZATION: Only leak the success flag and the requested state updates
    return NextResponse.json({
      success: true,
      action,
      amount: parsedAmount,
      newTreasuryBalance: result.data.newTreasuryBalance
    });

  } catch (err) {
    console.error('[POST /api/covens/treasury]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Treasury transaction failed.' },
      { status: 500 }
    );
  }
}

// ── Rate Limit & Anti-Macro ──
export const POST = withMiddleware(handlePost, {
  rateLimit: 'bank', // Standard economic transaction limit (~20 requests per minute max)
  idempotency: true, // Absolutely required to deter double deposits/withdrawals due to retry spam
});

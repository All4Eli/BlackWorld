// ═══════════════════════════════════════════════════════════════════
// POST /api/bank — Deposit or withdraw gold
// ═══════════════════════════════════════════════════════════════════
// Client sends intent: { action: "deposit"|"withdraw", amount: 100 }
// Server validates gold limits and applies atomically.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import * as HeroDal from '@/lib/db/dal/hero';

/**
 * POST /api/bank
 *
 * Body: { action: "deposit" | "withdraw", amount: number }
 *
 * Uses HeroDal.bankTransfer which executes the transfer transactionally
 * and validates balances securely on the server.
 */
async function handlePost(request, { userId }) {
  try {
    const body = await request.json();
    const { action, amount } = body;
    const transferAmount = parseInt(amount, 10);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Invalid transfer amount.' },
        { status: 400 }
      );
    }

    if (action !== 'deposit' && action !== 'withdraw') {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Action must be deposit or withdraw.' },
        { status: 400 }
      );
    }

    const { data, error } = await HeroDal.bankTransfer(userId, action, transferAmount);

    if (error) {
      const msg = error.message;
      let status = 400;
      if (msg.includes('Not enough')) status = 403;

      return NextResponse.json({ error: 'TRANSFER_FAILED', message: msg }, { status });
    }

    return NextResponse.json({
      success: true,
      action,
      amount: transferAmount,
      gold: data.gold,
      bankBalance: data.bank_balance,
    });
  } catch (err) {
    console.error('[POST /api/bank]', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: err.message },
      { status: 500 }
    );
  }
}

export const POST = withMiddleware(handlePost, {
  rateLimit: 'bank',
  idempotency: true, // Crucial to prevent accidental double-deposit/withdraw
});

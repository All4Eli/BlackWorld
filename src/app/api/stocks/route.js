// ═══════════════════════════════════════════════════════════════════
// Stock Market API Route Handler — GET & POST /api/stocks
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import {
  getStocks,
  getPlayerInvestments,
  buyStock,
  sellStock,
  claimDividends
} from '@/lib/db/dal/expansion';

async function handleGet(request, { userId }) {
  try {
    const { data: stocks, error: err1 } = await getStocks();
    const { data: investments, error: err2 } = await getPlayerInvestments(userId);

    if (err1 || err2) {
      return NextResponse.json({ error: 'Failed to fetch stock market data' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stocks: stocks || [],
      player_investments: investments || []
    });
  } catch (err) {
    console.error('[GET /api/stocks]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handlePost(request, { userId }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, stockId, shares } = body || {};

    if (!action) {
      return NextResponse.json({ error: "Action is required ('buy', 'sell', 'claim_dividends')" }, { status: 400 });
    }

    const numShares = Number(shares || 1);

    if (action === 'buy') {
      if (!stockId) return NextResponse.json({ error: 'stockId is required for buy action' }, { status: 400 });
      const result = await buyStock(userId, stockId, numShares);
      if (result.error) {
        const status = result.status || 400;
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else if (action === 'sell') {
      if (!stockId) return NextResponse.json({ error: 'stockId is required for sell action' }, { status: 400 });
      const result = await sellStock(userId, stockId, numShares);
      if (result.error) {
        const status = result.status || 400;
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else if (action === 'claim_dividends') {
      const result = await claimDividends(userId);
      if (result.error) {
        const status = result.status || 400;
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else {
      return NextResponse.json({ error: `Invalid action '${action}'. Must be 'buy', 'sell', or 'claim_dividends'.` }, { status: 400 });
    }
  } catch (err) {
    console.error('[POST /api/stocks]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet, { requireAuth: true });
export const POST = withMiddleware(handlePost, { requireAuth: true });

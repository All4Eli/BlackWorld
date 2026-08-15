// ═══════════════════════════════════════════════════════════════════
// Bazaar API Route Handler — GET & POST /api/bazaar
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { withMiddleware } from '@/lib/middleware';
import {
  getBazaarListings,
  getPlayerBazaarListings,
  listItemBazaar,
  buyItemBazaar,
  removeListingBazaar,
  tickPlayerResources,
  checkJailStatus
} from '@/lib/db/dal/expansion';

async function handleGet(request, { userId }) {
  try {
    const { data: hero } = await tickPlayerResources(userId);
    const { data: allListings, error: err1 } = await getBazaarListings();
    const { data: myListings, error: err2 } = await getPlayerBazaarListings(userId);

    if (err1 || err2) {
      return NextResponse.json({ error: 'Failed to fetch bazaar listings' }, { status: 500 });
    }

    const jailStatus = checkJailStatus(hero);

    return NextResponse.json({
      success: true,
      listings: allListings || [],
      my_listings: myListings || [],
      jail_status: jailStatus
    });
  } catch (err) {
    console.error('[GET /api/bazaar]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function handlePost(request, { userId }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, listingId, inventoryId, price, quantity } = body || {};

    if (!action) {
      return NextResponse.json({ error: "Action is required ('list', 'buy', 'remove')" }, { status: 400 });
    }

    if (action === 'list') {
      if (!inventoryId || price === undefined) {
        return NextResponse.json({ error: 'inventoryId and price are required for listing' }, { status: 400 });
      }
      const qty = Number(quantity || 1);
      const prc = Number(price);

      const result = await listItemBazaar(userId, inventoryId, prc, qty);
      if (result.error) {
        const status = result.status || 400;
        if (result.error.code === 'IN_DUNGEON') {
          return NextResponse.json(
            {
              error: 'You are currently in the Dungeon (Jail)!',
              code: 'IN_DUNGEON',
              jail_until: result.error.jail_until,
              jail_reason: result.error.jail_reason,
              remaining_seconds: result.error.remaining_seconds
            },
            { status: 403 }
          );
        }
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else if (action === 'buy') {
      if (!listingId) {
        return NextResponse.json({ error: 'listingId is required for buying' }, { status: 400 });
      }
      const qty = Number(quantity || 1);

      const result = await buyItemBazaar(userId, listingId, qty);
      if (result.error) {
        const status = result.status || 400;
        if (result.error.code === 'IN_DUNGEON') {
          return NextResponse.json(
            {
              error: 'You are currently in the Dungeon (Jail)!',
              code: 'IN_DUNGEON',
              jail_until: result.error.jail_until,
              jail_reason: result.error.jail_reason,
              remaining_seconds: result.error.remaining_seconds
            },
            { status: 403 }
          );
        }
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else if (action === 'remove') {
      if (!listingId) {
        return NextResponse.json({ error: 'listingId is required for removal' }, { status: 400 });
      }

      const result = await removeListingBazaar(userId, listingId);
      if (result.error) {
        const status = result.status || 400;
        if (result.error.code === 'IN_DUNGEON') {
          return NextResponse.json(
            {
              error: 'You are currently in the Dungeon (Jail)!',
              code: 'IN_DUNGEON',
              jail_until: result.error.jail_until,
              jail_reason: result.error.jail_reason,
              remaining_seconds: result.error.remaining_seconds
            },
            { status: 403 }
          );
        }
        return NextResponse.json({ error: result.error.message || result.error }, { status });
      }
      return NextResponse.json(result.data || result, { status: 200 });

    } else {
      return NextResponse.json({ error: `Invalid action '${action}'. Must be 'list', 'buy', or 'remove'.` }, { status: 400 });
    }
  } catch (err) {
    console.error('[POST /api/bazaar]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET = withMiddleware(handleGet, { requireAuth: true });
export const POST = withMiddleware(handlePost, { requireAuth: true, idempotency: true });

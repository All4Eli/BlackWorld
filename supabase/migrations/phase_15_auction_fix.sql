-- 1. Atomic Purchase Execution
CREATE OR REPLACE FUNCTION execute_auction_purchase(p_buyer_id TEXT, p_auction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auction RECORD;
    v_buyer_gold INT;
    v_item JSONB;
BEGIN
    -- 1. Lock auction row
    SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id AND status = 'ACTIVE' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Auction not found or already sold.';
    END IF;

    IF v_auction.seller_id = p_buyer_id THEN
        RAISE EXCEPTION 'Cannot buy your own auction.';
    END IF;

    -- 2. Lock buyer row
    SELECT gold INTO v_buyer_gold FROM players WHERE clerk_user_id = p_buyer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buyer not found.'; END IF;

    IF v_buyer_gold < v_auction.buyout_price THEN
        RAISE EXCEPTION 'Insufficient gold.';
    END IF;

    -- 3. Lock seller row to prevent simultaneous writes to bank_balance
    PERFORM id FROM players WHERE clerk_user_id = v_auction.seller_id FOR UPDATE;

    -- 4. Reconstruct Item JSONB
    v_item := jsonb_build_object(
        'id', v_auction.item_id,
        'name', v_auction.item_name,
        'type', v_auction.item_type,
        'rarity', v_auction.item_rarity,
        'stats', v_auction.item_stats
    );

    -- 5. Atomic State Updates
    -- Deduct buyer gold & push item to array
    UPDATE players 
    SET gold = gold - v_auction.buyout_price,
        artifacts = COALESCE(artifacts, '[]'::jsonb) || v_item
    WHERE clerk_user_id = p_buyer_id;

    -- Give seller the gold to their bank
    UPDATE players
    SET bank_balance = COALESCE(bank_balance, 0) + v_auction.buyout_price
    WHERE clerk_user_id = v_auction.seller_id;

    -- Mark status sold
    UPDATE auctions SET status = 'SOLD' WHERE id = p_auction_id;

    -- Notify
    INSERT INTO notifications (user_id, type, message)
    VALUES (v_auction.seller_id, 'MARKET', 'Your auction for [' || v_auction.item_name || '] has sold for ' || v_auction.buyout_price || 'g! The funds have been deposited in your Bank.');

    RETURN v_item;
END;
$$;


-- 2. Atomic Listing Execution
CREATE OR REPLACE FUNCTION execute_auction_list(
    p_seller_id TEXT, 
    p_seller_name TEXT,
    p_item_id TEXT, 
    p_item_name TEXT,
    p_item_type TEXT,
    p_item_rarity TEXT,
    p_item_stats JSONB,
    p_buyout_price INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seller_gold INT;
    v_fee INT;
    v_artifacts JSONB;
    v_item_index INT;
    v_new_auction RECORD;
    v_active_count INT;
BEGIN
    -- Check active listing limits
    SELECT count(*) INTO v_active_count FROM auctions WHERE seller_id = p_seller_id AND status = 'ACTIVE';
    IF v_active_count >= 10 THEN
        RAISE EXCEPTION 'You cannot have more than 10 active listings.';
    END IF;

    v_fee := CEIL(p_buyout_price * 0.05);

    -- Lock seller
    SELECT gold, artifacts INTO v_seller_gold, v_artifacts FROM players WHERE clerk_user_id = p_seller_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Player not found.'; END IF;

    IF v_seller_gold < v_fee THEN
        RAISE EXCEPTION 'Insufficient gold for listing fee.';
    END IF;

    -- Ensure they actually own the item by finding its index in the array
    SELECT position - 1 INTO v_item_index
    FROM jsonb_array_elements(v_artifacts) WITH ORDINALITY arr(elem, position)
    WHERE elem->>'id' = p_item_id;

    IF v_item_index IS NULL THEN
        RAISE EXCEPTION 'Item not found in inventory.';
    END IF;

    -- Remove item and deduct fee
    UPDATE players
    SET gold = gold - v_fee,
        artifacts = v_artifacts - v_item_index
    WHERE clerk_user_id = p_seller_id;

    -- Create auction
    INSERT INTO auctions (seller_id, seller_name, item_id, item_name, item_type, item_rarity, item_stats, buyout_price, status)
    VALUES (p_seller_id, p_seller_name, p_item_id, p_item_name, p_item_type, p_item_rarity, p_item_stats, p_buyout_price, 'ACTIVE')
    RETURNING * INTO v_new_auction;

    RETURN row_to_json(v_new_auction)::jsonb;
END;
$$;

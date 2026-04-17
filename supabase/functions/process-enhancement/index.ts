import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

serve(async (req: Request) => {
  try {
    const { itemId, protectionId } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Fetch item
    const { data: item } = await supabaseClient.from('inventory').select('*').eq('id', itemId).single();
    if (!item) throw new Error("Item not found");

    // In a full implementation, we'd fetch the enhancement table and do deterministic logic server-side.
    // For this prototype, simulate a 50% risk above level 5.
    const level = item.enhancement_level || 0;
    
    if (level < 5) {
      await supabaseClient.from('inventory').update({ enhancement_level: level + 1 }).eq('id', itemId);
      return new Response(JSON.stringify({ success: true, newLevel: level + 1 }), { headers: { "Content-Type": "application/json" } });
    }

    const roll = Math.random();
    if (roll > 0.5) {
      // Success
      await supabaseClient.from('inventory').update({ enhancement_level: level + 1 }).eq('id', itemId);
      return new Response(JSON.stringify({ success: true, newLevel: level + 1 }), { headers: { "Content-Type": "application/json" } });
    } else {
      // Break
      if (protectionId) {
          // Consume protection and downgrade
          await supabaseClient.from('inventory').update({ enhancement_level: Math.max(0, level - 1) }).eq('id', itemId);
          return new Response(JSON.stringify({ success: false, broke: false, newLevel: Math.max(0, level - 1) }), { headers: { "Content-Type": "application/json" } });
      } else {
          // Destroy
          await supabaseClient.from('inventory').delete().eq('id', itemId);
          return new Response(JSON.stringify({ success: false, broke: true }), { headers: { "Content-Type": "application/json" } });
      }
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});

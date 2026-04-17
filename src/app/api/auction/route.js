import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
      // Fetch dynamic active listings, ordered by newest first
      const { data, error } = await supabase
        .from('auctions')
        .select('*')
        .eq('status', 'ACTIVE')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) throw error;

      return NextResponse.json({ auctions: data });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

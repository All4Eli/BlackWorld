import { sql } from '@/lib/dal';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
      // Fetch dynamic active listings, ordered by newest first
      const { data, error } = await sql(`
          SELECT * FROM auctions 
          WHERE status = 'ACTIVE' 
          AND expires_at >= NOW() 
          ORDER BY created_at DESC 
          LIMIT 100
      `);
      
      if (error) throw error;

      return NextResponse.json({ auctions: data });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


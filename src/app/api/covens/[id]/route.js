import { Covens } from '@/lib/dal';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  if (!id) return NextResponse.json({ error: 'Missing coven ID' }, { status: 400 });

  try {
      // 1. Fetch Coven basic data
      const { data: coven, error: covenError } = await Covens.getById(id);
        
      if (covenError) throw covenError;

      // 2. Fetch Coven Roster from coven_members table
      const { data: members, error: rosterError } = await Covens.getMembers(id);

      if (rosterError) throw rosterError;

      // Map to legacy format
      const roster = members?.map((m) => ({
         clerk_user_id: m.player_id,
         username: m.username,
         level: m.level,
         coven_role: m.role
      })) || [];

      return NextResponse.json({ coven, roster });
  } catch(err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


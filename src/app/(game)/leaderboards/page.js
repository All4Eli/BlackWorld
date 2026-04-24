import { Playfair_Display } from 'next/font/google';
import * as LeaderboardDal from '@/lib/db/dal/leaderboards';
import { sql } from '@/lib/db/pool';

const playfair = Playfair_Display({ subsets: ['latin'] });

export const revalidate = 0; // Ensures it's dynamically rendered, fetching latest MV data or just let standard Next.js route behavior take over

export default async function LeaderboardsPage({ searchParams }) {
  // RSC fetching directly from postgres materialized views for 0 latency reads
  const sp = await searchParams;
  const type = sp?.type || 'level'; // 'level', 'wealth', 'pvp'

  let data = [];
  
  if (type === 'wealth') {
    const res = await LeaderboardDal.getWealthLeaderboard();
    data = res.data || [];
  } else if (type === 'pvp') {
    const res = await LeaderboardDal.getPvPLeaderboard();
    data = res.data || [];
  } else {
    // level
    const res = await LeaderboardDal.getLevelLeaderboard();
    data = res.data || [];
  }

  // To map player names since MVs hold player_id (we need player_id joined to players table usually)
  // Let's ensure the data has a 'username' attached safely. 
  // If the materialized views don't have username, we join them here on the fly for the top 100
  if (data.length > 0 && !data[0].username) {
     const playerIds = data.map(d => d.player_id);
     const { rows: players } = await sql(
         `SELECT clerk_user_id, username FROM players WHERE clerk_user_id = ANY($1)`,
         [playerIds]
     );
     
     const playerMap = {};
     players.forEach(p => playerMap[p.clerk_user_id] = p.username);
     
     data = data.map(d => ({
         ...d,
         username: playerMap[d.player_id] || 'Unknown Origin'
     }));
  }

  return (
    <div className="min-h-[100dvh] md:min-h-full p-8 max-w-5xl mx-auto text-gray-300 pb-20 md:pb-8">
      <header className="mb-8 border-b border-[#333] pb-6 flex justify-between items-end">
        <div>
          <h1 className={`${playfair.className} text-4xl text-white tracking-widest uppercase`}>
            Hall of Legends
          </h1>
          <p className="text-sm uppercase tracking-widest text-gray-500 mt-2">
            The immortals who etched their names into the abyss.
          </p>
        </div>
        
        <div className="flex gap-4 uppercase tracking-widest text-xs font-bold">
          <a href="/leaderboards?type=level" className={`border-b-2 pb-1 ${type === 'level' ? 'border-[#8b0000] text-[#8b0000]' : 'border-transparent text-gray-500 hover:text-white'}`}>Level</a>
          <a href="/leaderboards?type=wealth" className={`border-b-2 pb-1 ${type === 'wealth' ? 'border-yellow-600 text-yellow-600' : 'border-transparent text-gray-500 hover:text-white'}`}>Wealth</a>
          <a href="/leaderboards?type=pvp" className={`border-b-2 pb-1 ${type === 'pvp' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-white'}`}>PvP</a>
        </div>
      </header>

      <div className="bg-[#1a1a1a] border border-[#333] overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-[#050505] border-b border-[#333] text-gray-500 uppercase tracking-widest text-xs">
              <th className="p-4 font-normal w-16">Rank</th>
              <th className="p-4 font-normal">Entity Name</th>
              
              {type === 'level' && (
                  <>
                      <th className="p-4 font-normal text-right">Class / Stage</th>
                      <th className="p-4 font-normal text-right">Level</th>
                  </>
              )}
              {type === 'wealth' && <th className="p-4 font-normal text-right">Gross Wealth</th>}
              {type === 'pvp' && <th className="p-4 font-normal text-right">Blood Rating</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500 uppercase tracking-widest text-sm">
                        The records are currently empty.
                    </td>
                </tr>
            )}
            {data.map((row, idx) => (
              <tr key={row.player_id} className="border-b border-[#333] hover:bg-[#222] transition-colors group">
                <td className="p-4 text-gray-500 font-mono text-xs">
                    {(idx + 1).toString().padStart(3, '0')}
                </td>
                <td className={`${playfair.className} p-4 text-white uppercase tracking-widest`}>
                    {row.username}
                </td>

                {type === 'level' && (
                    <>
                        <td className="p-4 text-gray-400 text-right uppercase tracking-widest text-xs">
                            {row.stage || 'Immortal'}
                        </td>
                        <td className="p-4 text-[#8b0000] text-right font-mono font-bold">
                            {row.level}
                        </td>
                    </>
                )}
                {type === 'wealth' && (
                    <td className="p-4 text-yellow-600 text-right font-mono tracking-widest">
                        {row.total_wealth ? row.total_wealth.toLocaleString() : (row.gold || 0).toLocaleString()}
                    </td>
                )}
                {type === 'pvp' && (
                    <td className="p-4 text-purple-500 text-right font-mono font-bold tracking-widest">
                        {row.pvp_elo || 1200}
                    </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';

export default function DailyLoginCalendar({ hero, updateHero }) {
    const [claimedToday, setClaimedToday] = useState(false);
    const streak = hero?.login_streak || 1;
    const currentDay = hero?.login_day || 1; // 1 to 30

    const claimReward = async () => {
        if (claimedToday) return;
        
        try {
            const res = await fetch('/api/rewards/daily', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setClaimedToday(true);
            updateHero(data.updatedHero);
            alert(`Claimed Day ${currentDay} Reward!\n+500 Gold\n+5 Blood Stones (includes streak bonus)`);
        } catch (err) {
            alert(`Failed to claim: ${err.message}`);
        }
    };

    // Generate 30 days grid
    const days = Array.from({ length: 30 }, (_, i) => i + 1);

    const getRewardForDay = (day) => {
        if (day % 7 === 0) return { label: 'Weekly Bonus', icon: '✧', highlight: true };
        if (day === 30) return { label: 'Grand Prize', icon: '🏆', highlight: true };
        if (day % 3 === 0) return { label: 'Blood Stones', icon: '✧', highlight: false };
        if (day % 2 === 0) return { label: 'Gold', icon: '¤', highlight: false };
        return { label: 'Supplies', icon: '🎒', highlight: false };
    };

    return (
        <div className="border border-neutral-800 bg-[#020202] p-6 mt-8">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h2 className="font-serif text-xl tracking-widest text-stone-300 uppercase mb-1">Covenant Registry</h2>
                    <div className="text-[10px] font-mono text-stone-500 uppercase">Sign the blood pact daily for rewards.</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-mono text-orange-700 uppercase tracking-widest mb-1">Current Streak</div>
                    <div className="font-serif text-2xl text-orange-500">{streak} Days</div>
                </div>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2 mb-6">
                {days.map(day => {
                    const status = day < currentDay ? 'claimed' : day === currentDay ? 'current' : 'locked';
                    const reward = getRewardForDay(day);
                    return (
                        <div key={day} className={`
                            relative aspect-square border p-1 sm:p-2 flex flex-col justify-between items-center text-center group
                            ${status === 'claimed' ? 'border-green-900/40 bg-green-950/10 opacity-50' : ''}
                            ${status === 'current' ? 'border-orange-700 bg-orange-950/30 shadow-[0_0_15px_rgba(255,100,0,0.2)]' : ''}
                            ${status === 'locked' ? 'border-neutral-800 bg-black opacity-80' : ''}
                        `}>
                            <div className="text-[8px] sm:text-[10px] font-mono text-stone-500 w-full text-left">D{day}</div>
                            <div className={`text-xl sm:text-2xl ${reward.highlight ? 'text-orange-500' : 'text-stone-400'}`}>
                                {status === 'claimed' ? '✓' : reward.icon}
                            </div>
                            <div className="text-[8px] font-mono text-stone-600 uppercase hidden sm:block truncate w-full">{reward.label}</div>
                            
                            {status === 'current' && !claimedToday && (
                                <div className="absolute inset-0 border border-orange-500 animate-pulse pointer-events-none"></div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="flex justify-center">
                <button 
                    onClick={claimReward} 
                    disabled={claimedToday}
                    className={`
                        px-8 py-3 font-serif uppercase tracking-widest text-sm transition-all
                        ${claimedToday 
                            ? 'bg-neutral-900 border border-neutral-800 text-stone-600 cursor-not-allowed' 
                            : 'bg-red-950/40 border border-red-900 text-stone-200 hover:bg-red-900 hover:text-white shadow-[0_0_20px_rgba(200,0,0,0.2)]'
                        }
                    `}
                >
                    {claimedToday ? 'Pact Signed Today' : 'Sign the Pact (Claim Base + Streak)'}
                </button>
            </div>
        </div>
    )
}

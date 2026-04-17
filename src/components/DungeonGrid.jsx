'use client';
import { useState, useEffect } from 'react';

// Tile definitions
const TILES = {
    EMPTY: { char: '·', color: 'text-neutral-800' },
    WALL: { char: '█', color: 'text-neutral-900' },
    ENEMY: { char: '☠', color: 'text-red-500 font-bold' },
    LOOT: { char: '¤', color: 'text-yellow-600 font-bold' },
    BOSS: { char: '🔱', color: 'text-purple-600 animate-pulse' },
    DOOR: { char: '⛫', color: 'text-stone-500' }
};

export default function DungeonGrid({ activeZone, onTriggerCombat, onTriggerLoot }) {
    const [grid, setGrid] = useState([]);
    const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
    const [floor, setFloor] = useState(1);

    const generateFloor = () => {
        const size = 15;
        const newGrid = Array(size).fill(null).map(() => Array(size).fill('EMPTY'));
        
        // Random layout generator
        for(let y=0; y<size; y++) {
            for(let x=0; x<size; x++) {
                if(x===0 && y===0) continue; // Start pos
                if(x===size-1 && y===size-1) { newGrid[y][x] = 'DOOR'; continue; }
                
                const rand = Math.random();
                if (rand < 0.20) newGrid[y][x] = 'WALL';
                else if (rand < 0.24) newGrid[y][x] = 'ENEMY';
                else if (rand < 0.26) newGrid[y][x] = 'LOOT';
                else if (rand < 0.27 && floor % 5 === 0) newGrid[y][x] = 'BOSS';
            }
        }
        setGrid(newGrid);
        setPlayerPos({ x: 0, y: 0 });
    };

    useEffect(() => {
        if (activeZone) generateFloor();
    }, [activeZone, floor]);

    const handleMove = (dx, dy) => {
        const nx = playerPos.x + dx;
        const ny = playerPos.y + dy;

        if (nx < 0 || ny < 0 || nx >= 15 || ny >= 15) return;
        const tile = grid[ny][nx];

        if (tile === 'WALL') return;

        // Clone grid, remove item from next tile
        const newG = [...grid];
        newG[ny] = [...newG[ny]];

        if (tile === 'DOOR') {
            setFloor(f => f + 1);
            return;
        }

        if (tile === 'ENEMY' || tile === 'BOSS') {
            newG[ny][nx] = 'EMPTY';
            onTriggerCombat();
        } else if (tile === 'LOOT') {
            newG[ny][nx] = 'EMPTY';
            onTriggerLoot();
        }

        setGrid(newG);
        setPlayerPos({ x: nx, y: ny });
    };

    // Global Key Listener
    useEffect(() => {
        const handleKeyDown = (e) => {
            switch(e.key.toLowerCase()) {
                case 'w': handleMove(0, -1); break;
                case 's': handleMove(0, 1); break;
                case 'a': handleMove(-1, 0); break;
                case 'd': handleMove(1, 0); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playerPos, grid]);

    if (!grid.length) return null;

    return (
        <div className="flex flex-col items-center select-none py-6 animate-in fade-in zoom-in-95 font-mono">
            <div className="text-center mb-6">
                <div className="text-stone-400 text-xs uppercase tracking-widest border-b border-red-900/30 pb-2 mb-2">
                    {activeZone.name} — Depth {floor}
                </div>
                <div className="text-[10px] text-stone-600 uppercase tracking-widest">W,A,S,D to traverse</div>
            </div>

            <div className="bg-[#020202] border-2 border-neutral-900 p-8 shadow-[0_0_50px_rgba(0,0,0,0.9)] max-w-full overflow-x-auto">
                {grid.map((row, y) => (
                    <div key={y} className="flex">
                        {row.map((tileType, x) => {
                            const isPlayer = playerPos.x === x && playerPos.y === y;
                            if (isPlayer) {
                                return <span key={x} className="w-5 h-5 flex items-center justify-center text-emerald-500 font-bold">♅</span>;
                            }
                            const t = TILES[tileType];
                            return (
                                <span key={x} className={`w-5 h-5 flex items-center justify-center ${t.color}`}>
                                    {t.char}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
            
            <div className="mt-8 grid grid-cols-3 gap-2 sm:hidden w-48">
                <div></div>
                <button onClick={() => handleMove(0, -1)} className="bg-neutral-900 border border-neutral-800 text-stone-400 py-3">W</button>
                <div></div>
                <button onClick={() => handleMove(-1, 0)} className="bg-neutral-900 border border-neutral-800 text-stone-400 py-3">A</button>
                <button onClick={() => handleMove(0, 1)} className="bg-neutral-900 border border-neutral-800 text-stone-400 py-3">S</button>
                <button onClick={() => handleMove(1, 0)} className="bg-neutral-900 border border-neutral-800 text-stone-400 py-3">D</button>
            </div>
        </div>
    );
}

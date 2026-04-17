'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function GlobalChatWidget({ hero }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const messagesEndRef = useRef(null);

    // Initial load
    useEffect(() => {
        const fetchHistory = async () => {
            const res = await fetch('/api/chat');
            const data = await res.json();
            if (data.messages) {
                setMessages(data.messages);
            }
        };
        fetchHistory();
    }, []);

    // Scroll to bottom
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setUnread(0);
        }
    }, [messages, isOpen]);

    // Realtime Sub
    useEffect(() => {
        const channel = supabase.channel('schema-db-changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'global_chat' },
                (payload) => {
                    const newMsg = payload.new;
                    setMessages(prev => {
                        // Prevent duplicates and keep limit to 100 roughly
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        const updated = [...prev, newMsg];
                        return updated.slice(-100); 
                    });

                    if (!isOpen && newMsg.player_id !== hero?.clerk_user_id) {
                        setUnread(u => u + 1);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isOpen, hero?.clerk_user_id]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || !hero) return;
        
        const messageText = input.substring(0, 250);
        setInput('');

        // Optimistically drop it into the log to feel instant (it will be deduped natively by Realtime)
        const optimisticMsg = {
           id: 'opt_' + Date.now(),
           player_id: hero.clerk_user_id,
           username: hero.name,
           message: messageText,
           created_at: new Date().toISOString(),
           isOptimistic: true
        };
        setMessages(prev => [...prev, optimisticMsg].slice(-100));

        try {
            await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageText, channel: 'global' })
            });
        } catch (err) {
            console.error("Failed to send message:", err);
        }
    };

    return (
        <div className="fixed bottom-0 right-0 z-50 flex flex-col items-end pr-4 sm:pr-8 pointer-events-none">
            
            {/* Toggle Tab */}
            <div className="pointer-events-auto">
                <button 
                    onClick={() => setIsOpen(!isOpen)} 
                    className={`px-6 py-2 uppercase tracking-widest font-mono text-xs border-t border-l border-r transition-colors shadow-[0_0_20px_rgba(0,0,0,0.8)] ${isOpen ? 'bg-[#020202] border-neutral-800 text-stone-300' : 'bg-black border-neutral-900 text-stone-500 hover:text-stone-300 hover:bg-neutral-900'}`}
                >
                    {isOpen ? '▼ Close Tavern' : '▲ The Tavern'}
                    {!isOpen && unread > 0 && <span className="ml-2 text-red-500 font-bold">[{unread}]</span>}
                </button>
            </div>

            {/* Chat Box */}
            <div className={`pointer-events-auto w-[320px] sm:w-[400px] flex flex-col bg-[#020202] border border-neutral-800 shadow-[0_0_50px_rgba(0,0,0,0.9)] transition-all duration-300 origin-bottom ${isOpen ? 'h-[400px] opacity-100 scale-y-100' : 'h-0 opacity-0 scale-y-0 overflow-hidden border-none'}`}>
                
                <div className="bg-red-950/20 border-b border-red-900/50 p-2 text-center text-[10px] font-mono uppercase tracking-widest text-stone-400">
                    Global Network
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 font-mono text-xs scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
                    {messages.map(m => (
                        <div key={m.id} className={`flex flex-col ${m.player_id === hero?.clerk_user_id ? 'items-end' : 'items-start'}`}>
                            <div className={`text-[9px] mb-0.5 uppercase tracking-widest ${m.player_id === hero?.clerk_user_id ? 'text-red-500' : 'text-stone-500'}`}>
                                {m.username}
                            </div>
                            <div className={`px-3 py-2 max-w-[85%] break-words ${m.player_id === hero?.clerk_user_id ? 'bg-red-950/20 border border-red-900/30 text-stone-300' : 'bg-black border border-neutral-800 text-stone-400'} ${m.isOptimistic ? 'opacity-50' : 'opacity-100'}`}>
                                {m.message}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSend} className="border-t border-neutral-800 bg-black flex p-2 gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder={hero ? "Speak..." : "Login to chat"}
                        disabled={!hero}
                        className="flex-1 bg-transparent border border-neutral-900 text-stone-300 px-3 py-2 font-mono text-xs focus:outline-none focus:border-red-900"
                        maxLength={250}
                    />
                    <button 
                        type="submit" 
                        disabled={!hero || !input.trim()}
                        className="bg-neutral-900 border border-neutral-800 px-4 font-mono text-xs text-stone-400 hover:text-stone-200 disabled:opacity-50 transition-colors uppercase tracking-widest"
                    >
                        &gt;
                    </button>
                </form>
            </div>
        </div>
    );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function GlobalChat() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  // Initialize Realtime connection
  useEffect(() => {
    // We only need to hydrate old messages via an initial API fetch if we want persistent history.
    // For this demonstration, we start empty and only render incoming stream.
    
    const channel = supabase.channel('public:global_chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'global_chat' },
        (payload) => {
          const newMsg = payload.new;
          setMessages(prev => {
              // Ensure we don't accidentally bloat memory over time. Keep last 200 logs.
              const updated = [...prev, newMsg];
              if (updated.length > 200) updated.shift();
              return updated;
          });
        }
      )
      .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
              setMessages(prev => [...prev, {
                  id: 'system_connect', 
                  username: 'System', 
                  message: 'Connection to local global channel established.',
                  created_at: new Date().toISOString(),
                  isSystem: true
              }]);
          }
      });

    return () => {
        supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputText })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      setInputText('');
      
    } catch (err) {
      setError(err.message);
      // Auto dismiss error
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] border border-[#333]">
      <div className="bg-[#1a1a1a] border-b border-[#333] px-4 py-2">
          <h3 className="text-xs font-bold text-[#8b0000] tracking-widest uppercase">Global Transmission</h3>
      </div>
      
      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-[#333] scrollbar-track-black">
        {messages.length === 0 && (
            <div className="text-gray-600 text-center mt-4">Silence.</div>
        )}
        
        {messages.map((msg, idx) => (
            <div key={msg.id || idx} className="flex">
                <span className="text-gray-600 mr-2 shrink-0">
                  [{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]
                </span>
                {msg.isSystem ? (
                    <span className="text-blue-500 italic block">{msg.message}</span>
                ) : (
                    <div>
                        <span className="text-gray-300 font-bold mr-2 uppercase tracking-widest">{msg.username}</span>
                        <span className="text-gray-400 break-words">{msg.message}</span>
                    </div>
                )}
            </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Inputs */}
      <div className="border-t border-[#333] bg-[#0a0a0a]">
          {error && (
              <div className="px-4 py-1.5 text-[10px] text-[#8b0000] bg-red-900/10 uppercase tracking-widest border-b border-[#8b0000]/30">
                  ⚠ {error}
              </div>
          )}
          <form onSubmit={handleSend} className="flex">
              <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={200}
                  placeholder="Broadcast to the server..."
                  className="flex-1 bg-transparent px-4 py-3 text-sm text-white font-mono outline-none border-none placeholder-gray-600"
              />
              <button 
                  type="submit"
                  disabled={isProcessing || !inputText.trim()}
                  className="px-6 border-l border-[#333] text-[#8b0000] font-bold text-xs uppercase tracking-widest hover:bg-[#1a1a1a] disabled:opacity-30 transition-colors shrink-0"
              >
                  {isProcessing ? '...' : 'Send'}
              </button>
          </form>
      </div>
    </div>
  );
}

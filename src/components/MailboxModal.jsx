'use client';
import { useState } from 'react';

export default function MailboxModal({ onClose, messages, onRefresh }) {
  const [composeMode, setComposeMode] = useState(false);
  const [toId, setToId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [activeMessage, setActiveMessage] = useState(null);

  const handleSend = async () => {
    if (!toId || !subject || !content) return;
    setSending(true);
    try {
      const res = await fetch('/api/social/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: toId, subject, content })
      });
      if (res.ok) {
         setComposeMode(false);
         setToId(''); setSubject(''); setContent('');
         onRefresh();
      }
    } catch(err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-3xl bg-[#050505] border border-neutral-900 shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col h-[600px] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-red-900/30 bg-black">
          <h2 className="font-serif text-xl uppercase tracking-widest text-stone-200">
            {composeMode ? 'Compose Mail' : activeMessage ? 'Read Scroll' : 'Inbox'}
          </h2>
          <button onClick={onClose} className="text-stone-500 hover:text-red-500 transition-colors">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {composeMode ? (
              <div className="flex flex-col gap-4 font-mono text-sm max-w-lg mx-auto w-full">
                <input 
                  type="text" 
                  placeholder="Recipient Clerk ID..." 
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  className="bg-black border border-neutral-800 text-stone-300 p-3 focus:outline-none focus:border-red-900"
                />
                <input 
                  type="text" 
                  placeholder="Subject" 
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="bg-black border border-neutral-800 text-stone-300 p-3 focus:outline-none focus:border-red-900"
                />
                <textarea 
                  placeholder="Write your message..." 
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="bg-black border border-neutral-800 text-stone-300 p-3 h-48 resize-none focus:outline-none focus:border-red-900"
                />
                <div className="flex justify-end gap-4 mt-4">
                  <button onClick={() => setComposeMode(false)} className="px-6 py-2 text-stone-500 hover:text-stone-300 uppercase tracking-widest text-xs">Cancel</button>
                  <button 
                    onClick={handleSend} 
                    disabled={sending}
                    className="px-6 py-2 bg-red-950/30 border border-red-900/50 text-red-500 hover:bg-red-900/20 uppercase tracking-widest text-xs disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Dispatch Raven'}
                  </button>
                </div>
              </div>
            ) : activeMessage ? (
               <div className="flex flex-col gap-6 font-mono max-w-lg mx-auto w-full">
                 <button onClick={() => setActiveMessage(null)} className="text-stone-500 hover:text-stone-300 text-xs text-left uppercase tracking-widest">← Back to Inbox</button>
                 <div className="border-b border-neutral-800 pb-4">
                   <div className="text-stone-500 text-[10px] uppercase tracking-widest mb-1">From: <span className="text-stone-300">{activeMessage.sender_name}</span></div>
                   <div className="text-lg text-stone-200 font-serif">{activeMessage.subject}</div>
                 </div>
                 <div className="text-stone-400 text-sm whitespace-pre-wrap leading-relaxed">
                   {activeMessage.content}
                 </div>
               </div>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.length === 0 ? (
                  <div className="text-center text-stone-600 italic font-mono text-xs py-20 border border-neutral-900 border-dashed">
                    Your inbox is empty.
                  </div>
                ) : (
                  messages.map(msg => (
                    <button 
                      key={msg.id}
                      onClick={() => setActiveMessage(msg)}
                      className={`flex flex-col text-left p-4 border transition-colors ${!msg.is_read ? 'border-red-900/40 bg-red-950/10' : 'border-neutral-900 bg-black hover:border-neutral-700'}`}
                    >
                      <div className="flex justify-between items-center mb-2 font-mono text-xs">
                        <span className="text-stone-400 capitalize">{msg.sender_name}</span>
                        <span className="text-stone-600 text-[9px]">{new Date(msg.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className={`font-serif tracking-wide ${!msg.is_read ? 'text-stone-200 font-bold' : 'text-stone-500'}`}>
                        {msg.subject || 'No Subject'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-48 bg-black border-l border-neutral-900 p-4 font-mono text-xs flex flex-col gap-2">
            <button 
              onClick={() => { setComposeMode(false); setActiveMessage(null); }}
              className={`text-left px-4 py-3 uppercase tracking-widest transition-colors ${!composeMode && !activeMessage ? 'text-red-500 bg-red-950/20 border border-red-900/30' : 'text-stone-500 hover:text-stone-300'}`}
            >
              Inbox
            </button>
            <button 
              onClick={() => { setComposeMode(true); setActiveMessage(null); }}
              className={`text-left px-4 py-3 uppercase tracking-widest transition-colors ${composeMode ? 'text-red-500 bg-red-950/20 border border-red-900/30' : 'text-stone-500 hover:text-stone-300'}`}
            >
              Compose
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

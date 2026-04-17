'use client';
import { useRef, useEffect } from 'react';

export default function NotificationsDropdown({ notifications, onClose, onMarkRead }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Click outside to close
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose();
        onMarkRead();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose, onMarkRead]);

  return (
    <div ref={dropdownRef} className="absolute top-full right-0 mt-4 w-80 bg-[#050505] border border-neutral-800 shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-50 animate-in slide-in-from-top-2 duration-200">
      <div className="flex justify-between items-center p-3 border-b border-neutral-800 bg-black">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-stone-400">Server Logs</h3>
        <button onClick={() => { onMarkRead(); onClose(); }} className="text-[10px] text-stone-600 hover:text-stone-300 uppercase tracking-widest">Mark Read</button>
      </div>

      <div className="max-h-96 overflow-y-auto flex flex-col">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-stone-600 italic font-mono text-xs">All is quiet.</div>
        ) : (
          notifications.map(n => (
            <div key={n.id} className={`p-4 border-b border-neutral-900/50 flex gap-3 ${!n.is_read ? 'bg-red-950/10' : 'bg-black'}`}>
              <div className="mt-1">
                 {n.type === 'MAIL' ? '✉️' : '🔔'}
              </div>
              <div className="flex-1 font-mono">
                 <div className={`text-xs leading-relaxed mb-1 ${!n.is_read ? 'text-stone-300' : 'text-stone-500'}`}>
                   {n.message}
                 </div>
                 <div className="text-[9px] text-stone-600 uppercase tracking-widest">
                   {new Date(n.created_at).toLocaleString()}
                 </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

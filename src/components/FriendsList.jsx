'use client';
import { useState, useEffect } from 'react';

export default function FriendsList({ hero }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [tab, setTab] = useState('friends');

  const fetchFriends = async () => {
    try {
      const res = await fetch('/api/social/friends');
      const data = await res.json();
      setFriends(data.friends || []);
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchFriends(); }, []);

  const handleAction = async (action, payload) => {
    setMessage(null);
    try {
      const res = await fetch('/api/social/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        fetchFriends();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  const sendRequest = () => {
    if (!searchName.trim()) return;
    handleAction('send', { targetUsername: searchName.trim() });
    setSearchName('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-serif text-stone-300 uppercase tracking-widest">Friends</h3>
        {incoming.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 bg-red-950/50 border border-red-900/30 text-red-400 rounded font-mono">
            {incoming.length} pending
          </span>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`px-3 py-2 rounded text-xs font-mono ${
          message.type === 'success' ? 'bg-green-950/30 text-green-300 border border-green-900/30'
            : 'bg-red-950/30 text-red-300 border border-red-900/30'
        }`}>{message.text}</div>
      )}

      {/* Add Friend */}
      <div className="flex gap-2">
        <input
          value={searchName}
          onChange={e => setSearchName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendRequest()}
          placeholder="Enter username..."
          className="flex-1 bg-[#0a0a0a] border border-neutral-800 text-stone-300 px-3 py-2 text-xs font-mono
                     rounded focus:border-red-900/50 focus:outline-none"
        />
        <button
          onClick={sendRequest}
          className="px-4 py-2 bg-red-900/30 border border-red-900/50 text-red-300 text-xs font-mono
                     uppercase tracking-widest rounded hover:bg-red-800/40 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-800">
        {[
          { id: 'friends', label: `Friends (${friends.length})` },
          { id: 'incoming', label: `Requests (${incoming.length})` },
          { id: 'sent', label: `Sent (${outgoing.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-all ${
              tab === t.id ? 'text-red-400 border-b border-red-700' : 'text-stone-600 hover:text-stone-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Friends List */}
      {tab === 'friends' && (
        <div className="space-y-1">
          {loading ? (
            <p className="text-stone-600 text-xs font-mono text-center py-4">Loading...</p>
          ) : friends.length === 0 ? (
            <p className="text-stone-600 text-xs font-mono text-center py-4">No friends yet. Search for a player above.</p>
          ) : (
            friends.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0a0a] border border-neutral-800 px-3 py-2 rounded">
                <div>
                  <span className="text-stone-300 text-xs font-mono">{f.username}</span>
                  <span className="text-stone-600 text-[10px] ml-2">Lv.{f.level}</span>
                </div>
                <button
                  onClick={() => handleAction('remove', { targetId: f.friend_user_id })}
                  className="text-stone-600 hover:text-red-400 text-[10px] font-mono uppercase transition-colors"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Incoming Requests */}
      {tab === 'incoming' && (
        <div className="space-y-1">
          {incoming.length === 0 ? (
            <p className="text-stone-600 text-xs font-mono text-center py-4">No pending requests.</p>
          ) : (
            incoming.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0a0a] border border-neutral-800 px-3 py-2 rounded">
                <div>
                  <span className="text-stone-300 text-xs font-mono">{r.username}</span>
                  <span className="text-stone-600 text-[10px] ml-2">Lv.{r.level}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction('accept', { targetId: r.player_id })}
                    className="px-2 py-1 bg-green-950/30 border border-green-900/30 text-green-300 text-[10px] font-mono rounded hover:bg-green-900/40"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleAction('decline', { targetId: r.player_id })}
                    className="px-2 py-1 bg-red-950/30 border border-red-900/30 text-red-300 text-[10px] font-mono rounded hover:bg-red-900/40"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sent */}
      {tab === 'sent' && (
        <div className="space-y-1">
          {outgoing.length === 0 ? (
            <p className="text-stone-600 text-xs font-mono text-center py-4">No sent requests.</p>
          ) : (
            outgoing.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-[#0a0a0a] border border-neutral-800 px-3 py-2 rounded">
                <div>
                  <span className="text-stone-300 text-xs font-mono">{r.username}</span>
                  <span className="text-stone-600 text-[10px] ml-2">Lv.{r.level}</span>
                </div>
                <span className="text-stone-600 text-[10px] font-mono uppercase">Pending</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

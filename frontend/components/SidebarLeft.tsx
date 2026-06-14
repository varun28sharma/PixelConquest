'use client';
import { usePixelStore } from '../store/usePixelStore';
import { useMemo, useRef, useEffect } from 'react';

export default function SidebarLeft() {
  const cooldownRemaining = usePixelStore((state) => state.cooldownRemaining);
  const userName = usePixelStore((state) => state.userName);
  const userId = usePixelStore((state) => state.userId);
  const userColor = usePixelStore((state) => state.userColor);
  const grid = usePixelStore((state) => state.grid);
  const onlineUsers = usePixelStore((state) => state.onlineUsers);
  const capturedToday = usePixelStore((state) => state.capturedToday);
  const totalCaptures = usePixelStore((state) => state.totalCaptures);
  const recentCaptures = usePixelStore((state) => state.recentCaptures);

  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll feed to top when new capture arrives
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [recentCaptures.length]);

  // Compute Leaderboard and personal stats
  const { leaderboard, userRank, userCaptures } = useMemo(() => {
    const counts: Record<string, { userId: string; color: string; count: number }> = {};
    const pixels = Object.values(grid);

    pixels.forEach((p) => {
      if (!counts[p.userId]) {
        counts[p.userId] = { userId: p.userId, color: p.color, count: 0 };
      }
      counts[p.userId].count++;
    });

    const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
    const me = sorted.findIndex((s) => s.userId === userId);

    return {
      leaderboard: sorted.slice(0, 5),
      userRank: me !== -1 ? me + 1 : '—',
      userCaptures: me !== -1 ? sorted[me].count : 0,
    };
  }, [grid, userId]);

  const rankEmoji = (i: number) => {
    if (i === 0) return '👑';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return `${i + 1}.`;
  };

  return (
    <div className="flex flex-col h-full p-4 gap-5 text-sm overflow-y-auto">
      {/* Brand Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-4 h-4 bg-purple-500 rounded-sm grid grid-cols-2 gap-px p-px">
          <div className="bg-white rounded-sm" />
          <div className="bg-[#161a23] rounded-sm" />
          <div className="bg-[#161a23] rounded-sm" />
          <div className="bg-white rounded-sm" />
        </div>
        <h1 className="font-bold text-lg text-white">PixelConquest</h1>
      </div>

      {/* User Card */}
      <div className="bg-[#1a1e28] rounded-xl p-4 flex flex-col gap-4 border border-white/5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg ring-2 ring-white/10"
            style={{ backgroundColor: userColor }}
          >
            {userName[0]}
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-white">{userName}</span>
            <span className="text-xs text-slate-400">@{userName.toLowerCase()}</span>
          </div>
        </div>
        <div className="flex justify-between items-center text-xs">
          <div className="flex flex-col">
            <span className="text-slate-400">Captured</span>
            <span className="font-bold text-purple-400 text-base">{userCaptures.toLocaleString()}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-slate-400">Rank</span>
            <span className="font-bold text-white text-base">#{userRank}</span>
          </div>
        </div>

        {/* Cooldown Button */}
        <button
          className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition shadow-lg ${
            cooldownRemaining > 0
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed border border-white/5'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]'
          }`}
          disabled={cooldownRemaining > 0}
        >
          {cooldownRemaining > 0 ? (
            <>
              <span>⏳ Cooldown Active</span>
              <span className="text-slate-300 ml-1">{Math.ceil(cooldownRemaining / 1000)}s</span>
            </>
          ) : (
            <span>🔥 Ready to Capture!</span>
          )}
        </button>
      </div>

      {/* ── Live Stats ─────────────────────────────── */}
      <div className="bg-[#1a1e28] rounded-xl p-4 border border-white/5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          📊 Live Stats
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center bg-[#232834] rounded-lg p-2">
            <span className="text-emerald-400 font-bold text-lg leading-none">{onlineUsers}</span>
            <span className="text-[10px] text-slate-500 mt-1 text-center">Online</span>
          </div>
          <div className="flex flex-col items-center bg-[#232834] rounded-lg p-2">
            <span className="text-amber-400 font-bold text-lg leading-none">{capturedToday.toLocaleString()}</span>
            <span className="text-[10px] text-slate-500 mt-1 text-center">Today</span>
          </div>
          <div className="flex flex-col items-center bg-[#232834] rounded-lg p-2">
            <span className="text-purple-400 font-bold text-lg leading-none">{totalCaptures.toLocaleString()}</span>
            <span className="text-[10px] text-slate-500 mt-1 text-center">Total</span>
          </div>
        </div>
      </div>

      {/* ── Leaderboard ────────────────────────────── */}
      <div className="bg-[#1a1e28] rounded-xl p-4 border border-white/5">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          🏆 Leaderboard
        </h2>
        <div className="flex flex-col gap-2">
          {leaderboard.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-3">No pixels placed yet!</div>
          )}
          {leaderboard.map((user, index) => (
            <div
              key={user.userId}
              className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                user.userId === userId ? 'bg-white/5 ring-1 ring-indigo-500/30' : 'hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">{rankEmoji(index)}</span>
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: user.color }} />
                <span className={`font-medium ${user.userId === userId ? 'text-white font-bold' : 'text-slate-300'}`}>
                  {user.userId === userId ? 'You' : `User_${user.userId.substring(0, 4)}`}
                </span>
              </div>
              <span className="text-xs font-bold text-slate-300">{user.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Captures Feed ───────────────────── */}
      <div className="bg-[#1a1e28] rounded-xl p-4 border border-white/5 flex flex-col min-h-0">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          ⚡ Recent Captures
        </h2>
        <div
          ref={feedRef}
          className="flex flex-col gap-1 overflow-y-auto max-h-[160px] scrollbar-thin"
        >
          {recentCaptures.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-3">Waiting for activity…</div>
          )}
          {recentCaptures.map((evt, idx) => (
            <div key={idx} className="flex items-center gap-2 py-1 border-b border-white/[0.03] last:border-0">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: evt.color }}
              />
              <span className="text-[11px] text-slate-400 truncate flex-1">
                <span className={`font-semibold ${evt.userId === userId ? 'text-indigo-400' : 'text-slate-300'}`}>
                  {evt.userId === userId ? 'You' : `User_${evt.userId.substring(0, 4)}`}
                </span>
                {' '}captured{' '}
                <span className="text-slate-500">({evt.x}, {evt.y})</span>
              </span>
              <span className="text-[10px] text-slate-600 flex-shrink-0">
                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
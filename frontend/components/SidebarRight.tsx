'use client';
import { useState, useMemo } from 'react';
import { usePixelStore } from '../store/usePixelStore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export default function SidebarRight() {
  const [chatInput, setChatInput] = useState('');
  const chatMessages = usePixelStore((state) => state.chatMessages);
  const sendChat = usePixelStore((state) => state.sendChat);
  const grid = usePixelStore((state) => state.grid);
  const userId = usePixelStore((state) => state.userId);

  const handleSend = () => {
    if (chatInput.trim()) {
      sendChat(chatInput);
      setChatInput('');
    }
  };

  const { chartData, userCaptures, userPercentage } = useMemo(() => {
    const counts: Record<string, { name: string, value: number, color: string }> = {};
    const pixels = Object.values(grid);
    const TOTAL_TILES = 100 * 100;
    
    let userCount = 0;

    pixels.forEach((p) => {
      if (p.userId === userId) userCount++;
      const id = p.userId;
      if (!counts[id]) {
        counts[id] = { 
          name: id === userId ? 'You' : `User_${id.substring(0,4)}`, 
          value: 0, 
          color: p.color 
        };
      }
      counts[id].value++;
    });

    const sortedData = Object.values(counts)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Take top 5 for the chart

    return {
      chartData: sortedData,
      userCaptures: userCount,
      userPercentage: pixels.length > 0 ? ((userCount / TOTAL_TILES) * 100).toFixed(2) : '0.00'
    };
  }, [grid, userId]);

  return (
    <div className="flex flex-col h-full p-4 gap-6 text-sm">
      {/* Chat Section */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1a1e28] rounded-xl border border-white/5 overflow-hidden">
        <div className="p-3 border-b border-white/5 font-bold flex items-center gap-2">
          💬 Chat
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
           {chatMessages.length === 0 && (
             <div className="text-xs text-slate-500 text-center mt-4">Welcome to PixelConquest!</div>
           )}
           {chatMessages.map((msg, idx) => (
             <div key={idx} className="flex gap-2">
               <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold bg-indigo-500 text-white">
                 {msg.name[0]}
               </div>
               <div className="flex flex-col">
                 <div className="flex items-center gap-2">
                   <span className="font-semibold text-indigo-400 text-xs">{msg.name}</span>
                   <span className="text-[10px] text-slate-500">
                     {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                 </div>
                 <span className="text-slate-300 text-xs break-all">{msg.text}</span>
               </div>
             </div>
           ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/5">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..." 
              className="flex-1 bg-[#232834] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button 
              onClick={handleSend}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Stats / Territory Section */}
      <div className="bg-[#1a1e28] rounded-xl p-4 border border-white/5 flex flex-col gap-4">
        <div>
          <h3 className="font-semibold mb-3">Your Territory</h3>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-400">{userCaptures.toLocaleString()} tiles</span>
            <span className="text-white">{userPercentage}%</span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, parseFloat(userPercentage))}%` }}></div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-xs text-slate-400 mb-2">Territory Breakdown (Top 5)</h3>
          <div className="h-[120px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1e28', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
                Awaiting map data...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePixelStore } from '../store/usePixelStore';
import { Settings, X, AlertTriangle, Map } from 'lucide-react';

const TILE_SIZE   = 20;
const MINIMAP_W   = 220;
const MINIMAP_H   = 220;

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#ffffff', '#94a3b8', '#6b7280', '#1e293b',
  '#fde68a', '#bbf7d0', '#bfdbfe', '#f5d0fe',
];

// ── Time helper ───────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)   return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Tooltip state type ────────────────────────────────────────────────────────
interface TooltipData {
  x: number; y: number;          // tile coords
  screenX: number; screenY: number; // pixel position of tooltip
  color: string;
  username: string;
  timestamp: number;
}

export default function MapWorkspace() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const minimapRef    = useRef<HTMLCanvasElement>(null);

  const [showPicker,   setShowPicker]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMinimap,  setShowMinimap]  = useState(true);
  const [sizeInput,    setSizeInput]    = useState('');
  const [sizeError,    setSizeError]    = useState('');
  const [resizing,     setResizing]     = useState(false);
  const [tooltip,      setTooltip]      = useState<TooltipData | null>(null);

  const initSocket        = usePixelStore((s) => s.initSocket);
  const placePixel        = usePixelStore((s) => s.placePixel);
  const onlineUsers       = usePixelStore((s) => s.onlineUsers);
  const userColor         = usePixelStore((s) => s.userColor);
  const setUserColor      = usePixelStore((s) => s.setUserColor);
  const cooldownRemaining = usePixelStore((s) => s.cooldownRemaining);
  const gridSize          = usePixelStore((s) => s.gridSize);

  useEffect(() => { initSocket(); }, [initSocket]);
  useEffect(() => { setSizeInput(String(gridSize)); }, [gridSize]);

  // ── Viewport state (ref — zero re-renders during animation) ────────────────
  const vp = useRef({
    x: 0, y: 0, zoom: 1,
    isDragging: false, dragDistance: 0,
    lastMouseX: 0, lastMouseY: 0,
    hoveredTileX: -1, hoveredTileY: -1,
    mouseScreenX: 0, mouseScreenY: 0,
  });

  // ── Minimap drag state ─────────────────────────────────────────────────────
  const mmDragging = useRef(false);

  // ── Tooltip update (throttled via RAF) ─────────────────────────────────────
  const tooltipRaf = useRef<number>(0);
  const updateTooltip = useCallback(() => {
    const { hoveredTileX: hx, hoveredTileY: hy, mouseScreenX, mouseScreenY } = vp.current;
    const gs   = usePixelStore.getState().gridSize;
    const grid = usePixelStore.getState().grid;

    if (hx < 0 || hx >= gs || hy < 0 || hy >= gs) {
      setTooltip(null);
      return;
    }
    const pixel = grid[`${hx},${hy}`];
    if (!pixel) {
      setTooltip(null);
      return;
    }
    setTooltip({
      x: hx, y: hy,
      screenX: mouseScreenX,
      screenY: mouseScreenY,
      color: pixel.color,
      username: pixel.username || 'Unknown',
      timestamp: pixel.timestamp || 0,
    });
  }, []);

  // ── Main canvas engine ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let initialized = false;

    const resize = () => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
      if (!initialized) {
        const gs = usePixelStore.getState().gridSize;
        vp.current.x = (canvas.width  - gs * TILE_SIZE) / 2;
        vp.current.y = (canvas.height - gs * TILE_SIZE) / 2;
        initialized = true;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    // ── Input handlers ──────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const newZoom = Math.min(Math.max(0.05, vp.current.zoom - e.deltaY * 0.002), 10);
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const gx = (mx - vp.current.x) / vp.current.zoom;
      const gy = (my - vp.current.y) / vp.current.zoom;
      vp.current.x = mx - gx * newZoom;
      vp.current.y = my - gy * newZoom;
      vp.current.zoom = newZoom;
    };

    const onMouseDown = (e: MouseEvent) => {
      vp.current.isDragging   = true;
      vp.current.dragDistance = 0;
      vp.current.lastMouseX   = e.clientX;
      vp.current.lastMouseY   = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (vp.current.isDragging) {
        const dx = e.clientX - vp.current.lastMouseX;
        const dy = e.clientY - vp.current.lastMouseY;
        vp.current.dragDistance += Math.sqrt(dx * dx + dy * dy);
        vp.current.x += dx; vp.current.y += dy;
        vp.current.lastMouseX = e.clientX;
        vp.current.lastMouseY = e.clientY;
      }

      vp.current.mouseScreenX = e.clientX;
      vp.current.mouseScreenY = e.clientY;

      if (mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height) {
        vp.current.hoveredTileX = Math.floor(((mx - vp.current.x) / vp.current.zoom) / TILE_SIZE);
        vp.current.hoveredTileY = Math.floor(((my - vp.current.y) / vp.current.zoom) / TILE_SIZE);
      } else {
        vp.current.hoveredTileX = vp.current.hoveredTileY = -1;
      }

      // Throttle tooltip update
      cancelAnimationFrame(tooltipRaf.current);
      tooltipRaf.current = requestAnimationFrame(updateTooltip);
    };

    const onMouseLeave = () => {
      vp.current.hoveredTileX = vp.current.hoveredTileY = -1;
      setTooltip(null);
    };

    const onMouseUp = () => {
      vp.current.isDragging = false;
      if (vp.current.dragDistance < 5) {
        const { hoveredTileX: hx, hoveredTileY: hy } = vp.current;
        const gs = usePixelStore.getState().gridSize;
        if (hx >= 0 && hx < gs && hy >= 0 && hy < gs) placePixel(hx, hy);
      }
    };

    canvas.addEventListener('wheel',      onWheel,     { passive: false });
    canvas.addEventListener('mousedown',  onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);

    // ── Render loop with VIEWPORT CULLING ───────────────────────────────────
    const draw = () => {
      const gs   = usePixelStore.getState().gridSize;
      const grid = usePixelStore.getState().grid;
      const { x, y, zoom, hoveredTileX: hx, hoveredTileY: hy } = vp.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(zoom, zoom);

      // Background
      ctx.fillStyle = '#10121b';
      ctx.fillRect(0, 0, gs * TILE_SIZE, gs * TILE_SIZE);

      // Viewport culling
      const visX0 = Math.max(0,  Math.floor(-x / zoom / TILE_SIZE));
      const visY0 = Math.max(0,  Math.floor(-y / zoom / TILE_SIZE));
      const visX1 = Math.min(gs, Math.ceil((canvas.width  - x) / zoom / TILE_SIZE) + 1);
      const visY1 = Math.min(gs, Math.ceil((canvas.height - y) / zoom / TILE_SIZE) + 1);

      // Grid lines (only when zoomed in enough)
      if (zoom > 0.15) {
        ctx.strokeStyle = '#1a1d27';
        ctx.lineWidth   = 1 / zoom;
        ctx.beginPath();
        for (let i = visX0; i <= visX1; i++) {
          ctx.moveTo(i * TILE_SIZE, visY0 * TILE_SIZE);
          ctx.lineTo(i * TILE_SIZE, visY1 * TILE_SIZE);
        }
        for (let j = visY0; j <= visY1; j++) {
          ctx.moveTo(visX0 * TILE_SIZE, j * TILE_SIZE);
          ctx.lineTo(visX1 * TILE_SIZE, j * TILE_SIZE);
        }
        ctx.stroke();
      }

      // Render visible pixels only
      Object.values(grid).forEach((pixel) => {
        if (pixel.x >= visX0 && pixel.x < visX1 && pixel.y >= visY0 && pixel.y < visY1) {
          ctx.fillStyle = pixel.color;
          ctx.fillRect(pixel.x * TILE_SIZE, pixel.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      });

      // Hover highlight
      if (hx >= 0 && hx < gs && hy >= 0 && hy < gs) {
        ctx.fillStyle  = 'rgba(255,255,255,0.18)';
        ctx.fillRect(hx * TILE_SIZE, hy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth   = 2 / zoom;
        ctx.strokeRect(hx * TILE_SIZE, hy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }

      ctx.restore();

      // ── Draw minimap (separate canvas) ──────────────────────────────────
      const mm = minimapRef.current;
      if (mm) {
        const mc = mm.getContext('2d');
        if (mc) {
          const scale = MINIMAP_W / (gs * TILE_SIZE);

          mc.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
          mc.fillStyle = '#10121b';
          mc.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

          // Render all pixels at minimap scale
          Object.values(grid).forEach((pixel) => {
            mc.fillStyle = pixel.color;
            const pw = Math.max(1, TILE_SIZE * scale);
            mc.fillRect(pixel.x * TILE_SIZE * scale, pixel.y * TILE_SIZE * scale, pw, pw);
          });

          // Viewport rectangle on minimap
          const vpX = (-x / zoom) * scale;
          const vpY = (-y / zoom) * scale;
          const vpW = (canvas.width  / zoom) * scale;
          const vpH = (canvas.height / zoom) * scale;

          mc.strokeStyle = 'rgba(255,255,255,0.8)';
          mc.lineWidth   = 1.5;
          mc.strokeRect(vpX, vpY, vpW, vpH);
          mc.fillStyle   = 'rgba(255,255,255,0.05)';
          mc.fillRect(vpX, vpY, vpW, vpH);
        }
      }

      rafId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize',    resize);
      canvas.removeEventListener('wheel',     onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseleave',onMouseLeave);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(tooltipRaf.current);
    };
  }, [placePixel, updateTooltip]);

  // ── Minimap click → pan main view ─────────────────────────────────────────
  const onMinimapMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mmDragging.current = true;
    panToMinimapPoint(e);
  };
  const onMinimapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mmDragging.current) return;
    panToMinimapPoint(e);
  };
  const onMinimapMouseUp = () => { mmDragging.current = false; };

  const panToMinimapPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const mm = minimapRef.current;
    if (!canvas || !mm) return;
    const rect = mm.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gs  = gridSize;
    const scale = MINIMAP_W / (gs * TILE_SIZE);
    const worldX = mx / scale;
    const worldY = my / scale;
    vp.current.x = canvas.width  / 2 - worldX * vp.current.zoom;
    vp.current.y = canvas.height / 2 - worldY * vp.current.zoom;
  };

  // ── Grid resize handler ────────────────────────────────────────────────────
  const handleResize = async () => {
    setSizeError('');
    const size = parseInt(sizeInput);
    if (!size || size < 100 || size > 10000) {
      setSizeError('Size must be between 100 and 10,000.');
      return;
    }
    setResizing(true);
    try {
      const res = await fetch('http://localhost:3001/api/grid/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridSize: size }),
      });
      const data = await res.json();
      if (!res.ok) { setSizeError(data.error); return; }
      setShowSettings(false);
    } catch {
      setSizeError('Cannot connect to server.');
    } finally {
      setResizing(false);
    }
  };

  const resetView = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    vp.current.zoom = 1;
    vp.current.x = (canvas.width  - gridSize * TILE_SIZE) / 2;
    vp.current.y = (canvas.height - gridSize * TILE_SIZE) / 2;
  };

  const tileCount = (gridSize * gridSize).toLocaleString();

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden" ref={containerRef}>

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20 pointer-events-none">
        <div className="bg-[#1a1e28] border border-white/10 px-4 py-2 rounded-lg flex items-center gap-2 pointer-events-auto shadow-lg">
          🗺️ <span className="font-semibold text-sm">World Board</span>
        </div>

        <button
          className="bg-[#1a1e28] border border-white/10 px-4 py-2 rounded-lg text-sm pointer-events-auto shadow-lg hover:border-purple-500/50 transition-colors flex items-center gap-2"
          onClick={() => setShowSettings(true)}
        >
          <span className="text-slate-400">Grid</span>
          <span className="font-bold text-purple-400">{gridSize.toLocaleString()} × {gridSize.toLocaleString()}</span>
          <Settings className="w-3.5 h-3.5 text-slate-500" />
        </button>

        <div className="bg-[#1a1e28] border border-white/10 px-4 py-2 rounded-lg flex items-center gap-2 text-emerald-400 text-sm font-semibold pointer-events-auto shadow-lg">
          👥 {onlineUsers} online
        </div>
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair touch-none" />

      {/* ── Hover Tooltip ────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-40 pointer-events-none"
          style={{
            left: tooltip.screenX + 16,
            top:  tooltip.screenY - 8,
            transform: tooltip.screenX > window.innerWidth - 220
              ? 'translateX(calc(-100% - 32px))'
              : 'none',
          }}
        >
          <div className="bg-[#1a1e28]/95 border border-white/15 rounded-xl px-3.5 py-3 shadow-2xl backdrop-blur-md min-w-[170px]">
            {/* Username + color row */}
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className="w-4 h-4 rounded-sm ring-1 ring-white/20 flex-shrink-0"
                style={{ backgroundColor: tooltip.color }}
              />
              <span className="font-semibold text-sm text-white truncate">{tooltip.username}</span>
            </div>
            {/* Coords row */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                <span className="text-slate-500">Tile</span>{' '}
                <span className="text-white font-mono">{tooltip.x}, {tooltip.y}</span>
              </span>
              <span className="text-slate-500 ml-3">
                {tooltip.timestamp ? timeAgo(tooltip.timestamp) : ''}
              </span>
            </div>
            {/* Color hex */}
            <div className="mt-1.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              {tooltip.color}
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="w-2.5 h-2.5 bg-[#1a1e28]/95 border-l border-b border-white/15 absolute -left-[5px] top-4 rotate-45" />
        </div>
      )}

      {/* ── Bottom toolbar ───────────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1e28] border border-white/10 p-2 rounded-2xl flex items-center gap-3 z-20 shadow-2xl">
        <div
          className="w-10 h-10 rounded-xl cursor-pointer flex items-center justify-center ring-2 ring-white transition-transform hover:scale-110 relative"
          style={{ backgroundColor: userColor }}
          onClick={() => setShowPicker((v) => !v)}
          title="Change color"
        >
          <span className="text-[10px] select-none">🎨</span>

          {showPicker && (
            <div
              className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-[#1a1e28] border border-white/10 rounded-2xl p-3 shadow-2xl z-30 w-[160px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] text-slate-400 mb-2 text-center uppercase tracking-widest">Color</p>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {COLOR_PALETTE.map((c) => (
                  <div
                    key={c}
                    className="w-7 h-7 rounded-md cursor-pointer transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      outline: userColor === c ? '2px solid white' : '2px solid transparent',
                      outlineOffset: '2px',
                    }}
                    onClick={() => { setUserColor(c); setShowPicker(false); }}
                  />
                ))}
              </div>
              <input
                type="color" value={userColor}
                onChange={(e) => setUserColor(e.target.value)}
                className="w-full h-7 rounded-md cursor-pointer bg-transparent border-0 outline-none"
                title="Custom color"
              />
            </div>
          )}
        </div>

        <div className="w-[1px] h-8 bg-white/10 mx-1" />

        {cooldownRemaining > 0 ? (
          <div className="flex items-center gap-2 px-2">
            {/* Animated cooldown ring */}
            <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="#334155" strokeWidth="2.5" />
              <circle
                cx="12" cy="12" r="10" fill="none"
                stroke="#f59e0b" strokeWidth="2.5"
                strokeDasharray={`${2 * Math.PI * 10}`}
                strokeDashoffset={`${2 * Math.PI * 10 * (1 - cooldownRemaining / 3000)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.1s linear' }}
              />
            </svg>
            <span className="text-sm text-amber-400 font-semibold tabular-nums">
              {(cooldownRemaining / 1000).toFixed(1)}s
            </span>
          </div>
        ) : (
          <span className="text-sm text-slate-400 px-2">Click any tile to capture it!</span>
        )}
      </div>

      {/* ── Zoom + Minimap toggle ─────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
        <div className="flex flex-col bg-[#1a1e28] border border-white/10 rounded-xl overflow-hidden shadow-lg">
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/5 border-b border-white/10 text-lg" onClick={() => { vp.current.zoom = Math.min(10, vp.current.zoom + 0.5); }}>＋</button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/5 border-b border-white/10 text-lg" onClick={() => { vp.current.zoom = Math.max(0.05, vp.current.zoom - 0.5); }}>－</button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/5 text-sm" onClick={resetView}>⛶</button>
        </div>

        {/* Minimap toggle */}
        <button
          className={`w-10 h-10 flex items-center justify-center rounded-xl border shadow-lg transition-colors ${
            showMinimap
              ? 'bg-purple-600 border-purple-500 text-white'
              : 'bg-[#1a1e28] border-white/10 text-slate-400 hover:text-white'
          }`}
          onClick={() => setShowMinimap((v) => !v)}
          title="Toggle minimap"
        >
          <Map className="w-4 h-4" />
        </button>
      </div>

      {/* ── Minimap ──────────────────────────────────────────────────────── */}
      {showMinimap && (
        <div className="absolute bottom-20 right-6 z-30 rounded-xl overflow-hidden border border-white/15 shadow-2xl"
             style={{ width: MINIMAP_W, height: MINIMAP_H }}>
          {/* Header bar */}
          <div className="absolute top-0 left-0 right-0 bg-[#1a1e28]/90 backdrop-blur-sm px-2.5 py-1 flex items-center justify-between z-10 border-b border-white/10">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Minimap</span>
            <span className="text-[10px] text-slate-500 font-mono">{gridSize}×{gridSize}</span>
          </div>

          {/* Canvas */}
          <canvas
            ref={minimapRef}
            width={MINIMAP_W}
            height={MINIMAP_H}
            className="cursor-crosshair"
            onMouseDown={onMinimapMouseDown}
            onMouseMove={onMinimapMouseMove}
            onMouseUp={onMinimapMouseUp}
            onMouseLeave={onMinimapMouseUp}
            style={{ display: 'block', marginTop: 24 }}
          />

          {/* Subtle instruction */}
          <div className="absolute bottom-1.5 left-0 right-0 text-center">
            <span className="text-[9px] text-slate-600">Click or drag to pan</span>
          </div>
        </div>
      )}

      {/* ── Grid Settings Modal ──────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1e28] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" /> Grid Settings
              </h2>
              <button onClick={() => { setShowSettings(false); setSizeError(''); }} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-[#232834] rounded-xl p-3 text-center">
                <div className="text-purple-400 font-bold text-lg">{gridSize.toLocaleString()}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Current size</div>
              </div>
              <div className="bg-[#232834] rounded-xl p-3 text-center">
                <div className="text-amber-400 font-bold text-lg">{tileCount}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Total tiles</div>
              </div>
              <div className="bg-[#232834] rounded-xl p-3 text-center">
                <div className="text-emerald-400 font-bold text-lg">100–10K</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Allowed range</div>
              </div>
            </div>

            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Quick Presets</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[100, 500, 1000, 5000].map((s) => (
                <button
                  key={s}
                  onClick={() => setSizeInput(String(s))}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    parseInt(sizeInput) === s
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-[#232834] border-white/5 text-slate-300 hover:border-purple-500/50'
                  }`}
                >
                  {s >= 1000 ? `${s / 1000}K` : s}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Custom Size</p>
            <input
              type="number" min={100} max={10000}
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              className="w-full bg-[#232834] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 mb-1"
              placeholder="e.g. 250"
            />
            <p className="text-[11px] text-slate-500 mb-4">
              New grid: {parseInt(sizeInput) || 0} × {parseInt(sizeInput) || 0} = {((parseInt(sizeInput) || 0) ** 2).toLocaleString()} tiles
            </p>

            {parseInt(sizeInput) !== gridSize && parseInt(sizeInput) >= 100 && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-sm text-amber-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Resizing updates immediately for <strong>all</strong> connected players. Existing pixels outside the new bounds will not be deleted.</span>
              </div>
            )}

            {sizeError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-sm text-red-400">
                {sizeError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowSettings(false); setSizeError(''); }}
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm text-slate-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResize}
                disabled={resizing || parseInt(sizeInput) === gridSize}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resizing ? 'Applying…' : 'Apply Grid Size'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPicker && <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />}
    </div>
  );
}
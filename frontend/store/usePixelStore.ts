import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface PixelData {
  x: number;
  y: number;
  color: string;
  userId: string;
  username: string;
  timestamp: number;
}

export interface ChatMessage {
  userId: string;
  name: string;
  text: string;
  timestamp: number;
}

export interface CaptureEvent {
  userId: string;
  x: number;
  y: number;
  color: string;
  timestamp: number;
}

export interface LiveStats {
  onlineUsers: number;
  capturedToday: number;
  totalCaptures: number;
}

interface PixelStore {
  socket: Socket | null;
  grid: Record<string, PixelData>;
  chatMessages: ChatMessage[];
  recentCaptures: CaptureEvent[];
  onlineUsers: number;
  capturedToday: number;
  totalCaptures: number;
  gridSize: number;
  userId: string;
  userName: string;
  userColor: string;
  cooldownRemaining: number;
  initSocket: () => void;
  placePixel: (x: number, y: number) => void;
  sendChat: (text: string) => void;
  setCooldown: (ms: number) => void;
  setUserColor: (color: string) => void;
}

// Load real authenticated user from localStorage (set by the login/register page)
function getStoredUser() {
  if (typeof window === 'undefined') return { id: 'guest', username: 'Guest', color: '#a855f7' };
  try {
    const raw = localStorage.getItem('pixel_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { id: 'guest', username: 'Guest', color: '#a855f7' };
}
const storedUser = getStoredUser();

export const usePixelStore = create<PixelStore>((set, get) => ({
  socket: null,
  grid: {},
  chatMessages: [],
  recentCaptures: [],
  onlineUsers: 0,
  capturedToday: 0,
  totalCaptures: 0,
  gridSize: 100,
  userId: String(storedUser.id),
  userName: storedUser.username,
  userColor: storedUser.color || '#a855f7',
  cooldownRemaining: 0,

  setUserColor: (color: string) => {
    // Persist color in the stored user object
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('pixel_user');
        if (raw) {
          const u = JSON.parse(raw);
          u.color = color;
          localStorage.setItem('pixel_user', JSON.stringify(u));
          // Also sync to backend
          const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
          fetch(`${BACKEND_URL}/api/auth/color`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: u.id, color }),
          }).catch(() => {});
        }
      } catch {}
    }
    set({ userColor: color });
  },

  initSocket: () => {
    if (get().socket) return;

    // Connect to backend server
    const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://pixelconquest-backend.onrender.com';
    const socket = io(BACKEND_URL);

    socket.on('connect', () => console.log('Connected to server via WebSocket'));

    socket.on('init_grid', (initialGrid: PixelData[]) => {
      const newGrid: Record<string, PixelData> = {};
      initialGrid.forEach((p) => { newGrid[`${p.x},${p.y}`] = p; });
      set({ grid: newGrid, totalCaptures: initialGrid.length });
    });

    socket.on('pixel_updated', (pixel: PixelData) => {
      set((state) => {
        const key = `${pixel.x},${pixel.y}`;
        const isNew = !state.grid[key];
        const newCapture: CaptureEvent = {
          userId: pixel.userId,
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          timestamp: pixel.timestamp,
        };
        return {
          grid: { ...state.grid, [key]: pixel },
          totalCaptures: isNew ? state.totalCaptures + 1 : state.totalCaptures,
          recentCaptures: [newCapture, ...state.recentCaptures].slice(0, 30),
        };
      });
    });

    socket.on('user_joined', ({ count }) => set({ onlineUsers: count }));
    socket.on('user_left', ({ count }) => set({ onlineUsers: count }));

    socket.on('grid_resized', ({ gridSize }: { gridSize: number }) => {
      set({ gridSize });
    });

    socket.on('stats_update', ({ capturedToday }: { capturedToday: number }) => {
      set({ capturedToday });
    });

    socket.on('chat_message', (msg: ChatMessage) => {
      set((state) => ({
        chatMessages: [...state.chatMessages, msg].slice(-100),
      }));
    });

    // Receive chat history on first connect
    socket.on('chat_history', (history: ChatMessage[]) => {
      set({ chatMessages: history });
    });

    socket.on('cooldown_active', ({ remaining }) => {
      get().setCooldown(remaining);
    });

    set({ socket });
  },

  placePixel: (x, y) => {
    const { socket, userId, userName, userColor, cooldownRemaining } = get();
    if (!socket || cooldownRemaining > 0) return;
    get().setCooldown(3000);
    socket.emit('place_pixel', { x, y, color: userColor, userId, username: userName });
  },

  sendChat: (text) => {
    const { socket, userId, userName } = get();
    if (!socket || !text.trim()) return;
    socket.emit('send_chat', { userId, name: userName, text });
  },

  setCooldown: (ms) => {
    set({ cooldownRemaining: ms });
    const interval = setInterval(() => {
      set((state) => {
        const next = state.cooldownRemaining - 1000;
        if (next <= 0) {
          clearInterval(interval);
          return { cooldownRemaining: 0 };
        }
        return { cooldownRemaining: next };
      });
    }, 1000);
  },
}));

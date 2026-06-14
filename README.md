# PixelConquest 🎨

> **A real-time multiplayer pixel grid — every tile is a battle.**
> Inspired by Reddit's legendary r/place experiment, PixelConquest lets users compete for territory on a shared canvas in real time.

---

## 📋 Table of Contents

- [What Is This?](#what-is-this)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Socket Events](#socket-events)
- [API Endpoints](#api-endpoints)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [How to Use](#how-to-use)
- [Grid Customization](#grid-customization)
- [Useful SQL Queries](#useful-sql-queries)
- [Deployment](#deployment)

---

## What Is This?

PixelConquest is a **real-time shared pixel canvas** where:

- Every registered user gets a **color** and can place **one pixel every 3 seconds**
- The canvas is **shared globally** — all users see each other's changes **instantly**
- Pixels are **permanently stored** in PostgreSQL (Neon) and cached in Redis (Upstash)
- Users can **chat**, see a **live leaderboard**, and track **territory stats**
- The **grid size is configurable** — from 100×100 up to 10,000×10,000

This project demonstrates **real-time full-stack architecture** covering:
WebSockets, REST APIs, database design, caching, authentication, canvas rendering, and state management.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **Next.js 16** (App Router) | React framework with file-based routing |
| **TypeScript** | Type safety across all components |
| **Tailwind CSS v4** | Utility-first styling |
| **Zustand** | Lightweight global state management |
| **Socket.io-client** | Real-time WebSocket communication |
| **Recharts** | Territory breakdown donut chart |
| **HTML5 Canvas API** | High-performance grid rendering with pan/zoom |
| **lucide-react** | Icon library |

### Backend
| Technology | Purpose |
|---|---|
| **Node.js** | JavaScript runtime |
| **Express.js** | HTTP server and REST API |
| **Socket.io** | Bi-directional real-time communication |
| **pg (node-postgres)** | PostgreSQL client |
| **redis** | Redis client |
| **bcryptjs** | Password hashing |
| **dotenv** | Environment variable management |

### Databases & Cloud
| Service | Purpose | Provider |
|---|---|---|
| **PostgreSQL** | Permanent storage (users, pixels, chat) | Neon — free tier |
| **Redis** | In-memory grid cache and rate limiting | Upstash — free tier |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        BROWSER                            │
│                                                           │
│   Login/Register     Workspace      Sidebars             │
│       /                /workspace    Left + Right        │
│       └─────────────── Zustand Store ─────────────────┘  │
│                    (grid, chat, user, cooldown)           │
└────────────────────────┬─────────────────────────────────┘
                         │
              HTTP (REST)  +  WebSocket (Socket.io)
                         │
┌────────────────────────▼─────────────────────────────────┐
│                   BACKEND (Node.js)                       │
│                                                           │
│   Express REST API           Socket.io Server            │
│   POST /auth/register        on(connection)              │
│   POST /auth/login             send init_grid            │
│   PATCH /auth/color            send chat_history         │
│   GET  /grid/settings          send stats_update         │
│   POST /grid/resize            send grid_resized         │
│                              on(place_pixel)             │
│                                validate bounds           │
│                                check cooldown (Redis)    │
│                                write Redis + Neon        │
│                                broadcast to ALL          │
│                              on(send_chat)              │
│                                save to Neon             │
│                                broadcast to ALL         │
└─────────────────┬──────────────────────┬────────────────┘
                  │                      │
     ┌────────────▼──────────┐  ┌────────▼──────────────┐
     │   Neon PostgreSQL     │  │   Upstash Redis        │
     │   (permanent store)   │  │   (speed layer)        │
     │                       │  │                        │
     │   users               │  │   tile:x:y -> hash     │
     │   pixels              │  │   cooldown:userId      │
     │   chat_messages       │  │                        │
     │   grid_settings       │  │   Restored from Neon   │
     └───────────────────────┘  │   on every boot        │
                                └────────────────────────┘
```

### Why Two Databases?

| | Redis (Upstash) | PostgreSQL (Neon) |
|---|---|---|
| Speed | ~1ms reads | ~10-50ms reads |
| Use | Active grid state, cooldowns | Permanent record of everything |
| Survives restart? | No | Yes |
| Strategy | Cache for fast real-time access | Source of truth |

On every server boot, PostgreSQL **restores** the full grid into Redis.

---

## Database Schema

```sql
-- Registered users
CREATE TABLE users (
  id            SERIAL        PRIMARY KEY,
  username      VARCHAR(50)   UNIQUE NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  password_hash TEXT          NOT NULL,
  color         VARCHAR(20)   DEFAULT '#a855f7',
  created_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- Placed pixels (one row per grid coordinate)
CREATE TABLE pixels (
  x         INT         NOT NULL,
  y         INT         NOT NULL,
  color     VARCHAR(20) NOT NULL,
  user_id   TEXT,
  username  VARCHAR(50),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (x, y)
);

-- Chat messages
CREATE TABLE chat_messages (
  id       SERIAL       PRIMARY KEY,
  user_id  TEXT,
  username VARCHAR(50)  NOT NULL DEFAULT '',
  text     TEXT         NOT NULL,
  sent_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Grid configuration (always one row, id = 1)
CREATE TABLE grid_settings (
  id         INT         PRIMARY KEY DEFAULT 1,
  grid_size  INT         NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);
```

> All tables are **created automatically** on first server start. You never need to run this SQL manually.

---

## Socket Events

### Server → Client

| Event | Payload | When sent |
|---|---|---|
| `init_grid` | `PixelData[]` | Full grid on first connect |
| `pixel_updated` | `{x, y, color, userId, username, timestamp}` | Every pixel placed by any user |
| `chat_history` | `ChatMessage[]` | Last 50 messages on connect |
| `chat_message` | `{userId, name, text, timestamp}` | Every new chat message |
| `user_joined` | `{count}` | When any user connects |
| `user_left` | `{count}` | When any user disconnects |
| `stats_update` | `{capturedToday}` | After every pixel placement |
| `grid_resized` | `{gridSize}` | When grid size is changed |
| `cooldown_active` | `{remaining}` | When user places too fast |

### Client → Server

| Event | Payload | What happens |
|---|---|---|
| `place_pixel` | `{x, y, color, userId, username}` | Validates, rate-limits, writes, broadcasts |
| `send_chat` | `{userId, name, text}` | Saves to DB, broadcasts to all |

---

## API Endpoints

### Auth

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{username, email, password}` | `{id, username, email, color}` |
| `POST` | `/api/auth/login` | `{email, password}` | `{id, username, email, color}` |
| `PATCH` | `/api/auth/color` | `{userId, color}` | `{ok: true}` |

### Grid

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `GET` | `/api/grid/settings` | — | `{gridSize, min, max}` |
| `POST` | `/api/grid/resize` | `{gridSize}` | `{gridSize}` + broadcasts `grid_resized` |

---

## Prerequisites

| Tool | Minimum Version | Check with |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | Any | `git --version` |

You also need **free cloud accounts** (no credit card):

- Neon (PostgreSQL) → https://console.neon.tech
- Upstash (Redis) → https://console.upstash.com

---

## Project Structure

```
pixelconquest/
│
├── README.md
│
├── backend/
│   ├── server.js          # Main server — Express + Socket.io + DB
│   ├── package.json
│   ├── .env               # YOU CREATE THIS (never commit)
│   └── .gitignore
│
└── frontend/
    ├── app/
    │   ├── page.tsx           # Login / Register page
    │   ├── layout.tsx         # Root layout with fonts
    │   ├── globals.css
    │   └── workspace/
    │       └── page.tsx       # Main workspace (3-column layout)
    │
    ├── components/
    │   ├── MapWorkspace.tsx   # Canvas map + color picker + grid settings
    │   ├── SidebarLeft.tsx    # User card, leaderboard, live stats, feed
    │   └── SidebarRight.tsx   # Chat + territory donut chart
    │
    ├── store/
    │   └── usePixelStore.ts   # Zustand global state + all socket logic
    │
    └── package.json
```

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/pixelconquest.git
cd pixelconquest
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 4. Set up Neon (PostgreSQL)

1. Go to https://console.neon.tech and sign up
2. Create a new project named `pixelconquest`
3. Click **Connection Details** → select **Node.js**
4. Copy the connection string:
   ```
   postgresql://alex:password@ep-cool-name-123.us-east-2.aws.neon.tech/pixelconquest?sslmode=require
   ```

### 5. Set up Upstash (Redis)

1. Go to https://console.upstash.com and sign up
2. Create a **Redis** database
3. Copy the connection string (note the double `s` in `rediss://`):
   ```
   rediss://default:your_password@steady-penguin-148677.upstash.io:6379
   ```

### 6. Create the .env file

Create `backend/.env`:

```env
PORT=3001
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_HOST.upstash.io:6379
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_HOST.neon.tech/pixelconquest?sslmode=require
```

> Never commit this file. It is already in .gitignore.

---

## Running the Project

Open **two terminals**.

### Terminal 1 — Backend

```bash
cd backend
node server.js
```

You should see:
```
🚀 Server listening on port 3001
✅ Database tables ready
✅ Grid size loaded: 100x100
✅ Redis connected
✅ Loaded 0 pixels from DB into Redis
```

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

You should see:
```
▲ Next.js 16.2.9
- Local: http://localhost:3000
✓ Ready in 1193ms
```

### Open the app

```
http://localhost:3000
```

---

## How to Use

### Registering

1. Open `http://localhost:3000`
2. Click **"Create Account"** tab
3. Enter username (3-50 chars), email, password (min 6 chars)
4. Click **"Create my account"**

### Logging In

1. Click **"Sign In"** tab
2. Enter email and password
3. Click **"Sign in now"**

### The Workspace Layout

```
┌─────────────────┬───────────────────────────┬─────────────────┐
│  LEFT SIDEBAR   │      CENTER (MAP)          │  RIGHT SIDEBAR  │
│                 │                            │                 │
│  User Card      │  Pan:  click + drag        │  Live Chat      │
│  Cooldown btn   │  Zoom: scroll wheel        │  Territory bar  │
│  Leaderboard    │  Place: click tile         │  Donut chart    │
│  Live Stats     │  Color: 🎨 bottom bar      │                 │
│  Capture feed   │                            │                 │
└─────────────────┴───────────────────────────┴─────────────────┘
```

### Placing Pixels

1. Click the **🎨 color swatch** in the bottom toolbar
2. Pick from 16 presets or use the color wheel
3. Click any tile on the grid
4. Wait 3 seconds before placing again (server-enforced)

### Navigation Controls

| Action | Input |
|---|---|
| Pan | Click and drag |
| Zoom in/out | Scroll wheel |
| Zoom buttons | ＋ / － (bottom right) |
| Reset view | ⛶ button |

---

## Grid Customization

Click the **grid size badge** in the top bar (e.g. `100 × 100 ⚙`) to open Grid Settings.

| Option | Range |
|---|---|
| Minimum | 100 × 100 |
| Maximum | 10,000 × 10,000 |

### Presets

| Size | Total Tiles | Best for |
|---|---|---|
| 100 | 10,000 | Testing and demos |
| 500 | 250,000 | Classroom use |
| 1,000 | 1,000,000 | Small communities |
| 5,000 | 25,000,000 | Large deployments |

The renderer uses **viewport culling** — only visible tiles are drawn regardless of grid size, keeping performance at 60fps even at 10,000×10,000.

---

## Useful SQL Queries

Run these in your Neon SQL Editor (console.neon.tech → SQL Editor):

```sql
-- All registered users
SELECT id, username, email, color, created_at
FROM users ORDER BY created_at DESC;

-- Current grid state (all pixels)
SELECT x, y, color, username, placed_at
FROM pixels ORDER BY placed_at DESC;

-- Leaderboard: top players by tiles owned
SELECT username, color, COUNT(*) AS tiles_owned
FROM pixels
GROUP BY username, color
ORDER BY tiles_owned DESC LIMIT 10;

-- All chat messages
SELECT username, text, sent_at
FROM chat_messages
ORDER BY sent_at DESC LIMIT 100;

-- Today's captures per user
SELECT username, COUNT(*) AS placed_today
FROM pixels
WHERE placed_at >= CURRENT_DATE
GROUP BY username ORDER BY placed_today DESC;

-- Total pixels ever placed
SELECT COUNT(*) AS total FROM pixels;

-- Current grid settings
SELECT grid_size, updated_at FROM grid_settings;

-- Most active hours of the day
SELECT EXTRACT(HOUR FROM placed_at) AS hour, COUNT(*) AS captures
FROM pixels GROUP BY hour ORDER BY captures DESC;
```

---

## Deployment

### Backend → Railway

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Point root to `/backend`
3. Add env vars: `DATABASE_URL`, `REDIS_URL`, `PORT`
4. Railway auto-detects Node.js

### Frontend → Vercel

1. Go to https://vercel.com → New Project → Import from GitHub
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   NEXT_PUBLIC_BACKEND_URL=https://your-app.railway.app
   ```
4. Update `http://localhost:3001` references in the frontend to use `process.env.NEXT_PUBLIC_BACKEND_URL`

### Update CORS for production

In `backend/server.js`:
```js
const io = new Server(server, {
  cors: {
    origin: 'https://your-app.vercel.app',
    methods: ['GET', 'POST']
  }
});
```

---

## Security Notes

| Risk | Protection |
|---|---|
| Pixel spam | 3-second server-side cooldown in Redis — client cannot bypass |
| Out-of-bounds placement | Server validates x,y against current grid size |
| Weak passwords | bcrypt with 10 salt rounds |
| Duplicate accounts | DB unique constraint on email and username |
| Input injection | Parameterized queries ($1, $2) — no string concatenation in SQL |

---

*Built as a real-time systems assignment demonstrating WebSockets, REST APIs, caching, authentication, and canvas rendering.*
# PixelConquest

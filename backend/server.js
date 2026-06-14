const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('redis');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const COOLDOWN_MS = 3000; // 3 seconds
const MIN_GRID_SIZE = 100;
const MAX_GRID_SIZE = 10000;

// Dynamic grid size — loaded from DB on boot, changeable at runtime
let currentGridSize = MIN_GRID_SIZE;

// ── PostgreSQL ────────────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pixelconquest';
const isNeon = dbUrl.includes('neon.tech');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? { rejectUnauthorized: false } : false,
});

// Create all tables if they don't exist
async function initDB() {
  // Users table — stores real credentials
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL        PRIMARY KEY,
      username     VARCHAR(50)   UNIQUE NOT NULL,
      email        VARCHAR(255)  UNIQUE NOT NULL,
      password_hash TEXT         NOT NULL,
      color        VARCHAR(20)   DEFAULT '#a855f7',
      created_at   TIMESTAMPTZ   DEFAULT NOW()
    );
  `);

  // Pixels table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pixels (
      x         INT          NOT NULL,
      y         INT          NOT NULL,
      color     VARCHAR(20)  NOT NULL,
      user_id   INT,
      username  VARCHAR(50),
      placed_at TIMESTAMPTZ  DEFAULT NOW(),
      PRIMARY KEY (x, y)
    );
  `);
  // Migrate: add username column if it doesn't exist yet
  await pool.query(`
    ALTER TABLE pixels ADD COLUMN IF NOT EXISTS username VARCHAR(50);
  `);
  // Migrate: drop old user_id foreign key constraint if it's a text column, re-add as INT
  await pool.query(`
    ALTER TABLE pixels ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
  `).catch(() => {}); // ignore if already correct

  // Chat messages table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id        SERIAL        PRIMARY KEY,
      user_id   TEXT,
      username  VARCHAR(50)   NOT NULL DEFAULT '',
      text      TEXT          NOT NULL,
      sent_at   TIMESTAMPTZ   DEFAULT NOW()
    );
  `);
  // Migrate: add username column to chat_messages if missing
  await pool.query(`
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS username VARCHAR(50) NOT NULL DEFAULT '';
  `);
  // Migrate: rename name -> username if old schema exists
  await pool.query(`
    ALTER TABLE chat_messages RENAME COLUMN name TO username;
  `).catch(() => {}); // ignore if column doesn't exist or already renamed

  // Grid settings table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grid_settings (
      id         INT         PRIMARY KEY DEFAULT 1,
      grid_size  INT         NOT NULL DEFAULT 100,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  // Insert default row if not exists
  await pool.query(`
    INSERT INTO grid_settings (id, grid_size) VALUES (1, 100)
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log('✅ Database tables ready');
}

// ── Grid Settings REST endpoints ─────────────────────────────────────────────

// GET /api/grid/settings — get current grid size
app.get('/api/grid/settings', (req, res) => {
  res.json({ gridSize: currentGridSize, min: MIN_GRID_SIZE, max: MAX_GRID_SIZE });
});

// POST /api/grid/resize — change grid size
app.post('/api/grid/resize', async (req, res) => {
  const { gridSize } = req.body;
  const size = parseInt(gridSize);

  if (!size || size < MIN_GRID_SIZE || size > MAX_GRID_SIZE) {
    return res.status(400).json({
      error: `Grid size must be between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE.toLocaleString()}.`
    });
  }

  try {
    await pool.query(
      'UPDATE grid_settings SET grid_size = $1, updated_at = NOW() WHERE id = 1',
      [size]
    );
    currentGridSize = size;
    // Broadcast new size to all connected clients
    io.emit('grid_resized', { gridSize: size });
    console.log(`🔲 Grid resized to ${size}x${size}`);
    return res.json({ gridSize: size });
  } catch (err) {
    console.error('Resize error:', err.message);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── Auth REST endpoints ───────────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be 3–50 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, color, created_at`,
      [username.trim(), email.toLowerCase().trim(), passwordHash]
    );
    const user = rows[0];
    return res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      color: user.color,
    });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation
      if (err.detail.includes('email')) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      if (err.detail.includes('username')) {
        return res.status(409).json({ error: 'This username is already taken.' });
      }
    }
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, password_hash, color FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      color: user.color,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PATCH /api/auth/color — update user's chosen color
app.patch('/api/auth/color', async (req, res) => {
  const { userId, color } = req.body;
  if (!userId || !color) return res.status(400).json({ error: 'Missing fields.' });
  try {
    await pool.query('UPDATE users SET color = $1 WHERE id = $2', [color, userId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── Redis ─────────────────────────────────────────────────────────────────────
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Load grid from PostgreSQL into Redis (persistence across reboots)
async function loadGridFromDB() {
  try {
    const { rows } = await pool.query('SELECT x, y, color, user_id, username FROM pixels');
    for (const row of rows) {
      await redisClient.hSet(`tile:${row.x}:${row.y}`, {
        userId: String(row.user_id || ''),
        username: row.username || '',
        color: row.color,
        timestamp: Date.now().toString()
      });
    }
    console.log(`✅ Loaded ${rows.length} pixels from DB into Redis`);
  } catch (err) {
    console.error('Failed to load grid from DB:', err.message);
  }
}

// Local Fallback
let fallbackGrid = {};
let fallbackCooldowns = {};
let onlineUsers = 0;

// ── Daily capture counter ─────────────────────────────────────────────────────
let capturedToday = 0;
let todayDateStr = new Date().toDateString();

function checkDayRollover() {
  const currentDate = new Date().toDateString();
  if (currentDate !== todayDateStr) {
    capturedToday = 0;
    todayDateStr = currentDate;
  }
}
setInterval(checkDayRollover, 60 * 1000);

// Helper: fetch last N chat messages from Postgres
async function getRecentChatHistory(limit = 50) {
  try {
    const { rows } = await pool.query(
      `SELECT user_id, username, text, EXTRACT(EPOCH FROM sent_at) * 1000 AS timestamp
       FROM chat_messages ORDER BY sent_at DESC LIMIT $1`,
      [limit]
    );
    return rows.reverse().map((r) => ({
      userId: String(r.user_id || ''),
      name: r.username,
      text: r.text,
      timestamp: parseInt(r.timestamp),
    }));
  } catch (err) {
    return [];
  }
}

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function boot() {
  await initDB();

  // Load saved grid size from DB
  try {
    const { rows } = await pool.query('SELECT grid_size FROM grid_settings WHERE id = 1');
    if (rows.length > 0) {
      currentGridSize = rows[0].grid_size;
      console.log(`✅ Grid size loaded: ${currentGridSize}x${currentGridSize}`);
    }
  } catch (err) {
    console.error('Failed to load grid size:', err.message);
  }

  try {
    await redisClient.connect();
    console.log('✅ Redis connected');
    await loadGridFromDB();
  } catch (err) {
    console.log('⚠️  Running without Redis (Fallback Mode)');
  }
}

boot();

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log(`User connected: ${socket.id}`);
  onlineUsers++;
  io.emit('user_joined', { count: onlineUsers });

  // Send initial grid state
  try {
    const gridKeys = await redisClient.keys('tile:*');
    const initialGrid = [];
    for (const key of gridKeys) {
      const data = await redisClient.hGetAll(key);
      const [_, x, y] = key.split(':');
      initialGrid.push({ x: parseInt(x), y: parseInt(y), ...data });
    }
    socket.emit('init_grid', initialGrid);
  } catch (err) {
    socket.emit('init_grid', Object.values(fallbackGrid));
  }

  // Send chat history, live stats, and current grid size to new user
  const history = await getRecentChatHistory(50);
  socket.emit('chat_history', history);
  socket.emit('stats_update', { capturedToday });
  socket.emit('grid_resized', { gridSize: currentGridSize });

  // Handle pixel placement
  socket.on('place_pixel', async (data) => {
    const { x, y, color, userId, username } = data;
    if (x < 0 || x >= currentGridSize || y < 0 || y >= currentGridSize) return;

    try {
      const lastPlaced = await redisClient.get(`cooldown:${userId}`);
      const now = Date.now();

      if (lastPlaced && (now - parseInt(lastPlaced)) < COOLDOWN_MS) {
        return socket.emit('cooldown_active', { remaining: COOLDOWN_MS - (now - parseInt(lastPlaced)) });
      }

      await redisClient.set(`cooldown:${userId}`, now);
      await redisClient.hSet(`tile:${x}:${y}`, { userId: String(userId), username: username || '', color, timestamp: now });

      // Persist to PostgreSQL
      await pool.query(
        `INSERT INTO pixels (x, y, color, user_id, username)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (x, y) DO UPDATE SET color = $3, user_id = $4, username = $5, placed_at = NOW()`,
        [x, y, color, userId, username]
      );

      checkDayRollover();
      capturedToday++;

      io.emit('pixel_updated', { x, y, color, userId: String(userId), username, timestamp: now });
      io.emit('stats_update', { capturedToday });

    } catch (err) {
      const now = Date.now();
      if (fallbackCooldowns[userId] && (now - fallbackCooldowns[userId]) < COOLDOWN_MS) return;
      fallbackCooldowns[userId] = now;
      fallbackGrid[`${x},${y}`] = { x, y, color, userId: String(userId), username, timestamp: now };
      checkDayRollover();
      capturedToday++;
      io.emit('pixel_updated', { x, y, color, userId: String(userId), username, timestamp: now });
      io.emit('stats_update', { capturedToday });
    }
  });

  // Handle chat messages
  socket.on('send_chat', async (msg) => {
    const chatMessage = {
      userId: String(msg.userId),
      name: msg.name,
      text: msg.text,
      timestamp: Date.now()
    };

    try {
      await pool.query(
        'INSERT INTO chat_messages (user_id, username, text) VALUES ($1, $2, $3)',
        [msg.userId, msg.name, msg.text]
      );
    } catch (err) {
      console.error('Failed to save chat message:', err.message);
    }

    io.emit('chat_message', chatMessage);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    onlineUsers--;
    io.emit('user_left', { count: onlineUsers });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

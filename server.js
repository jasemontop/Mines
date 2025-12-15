const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const db = new Database('mines.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    balance INTEGER DEFAULT 1000,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    ban_until INTEGER DEFAULT NULL,
    force_logout INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    total_lost INTEGER DEFAULT 0,
    boards_cleared INTEGER DEFAULT 0,
    total_profit INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    unread INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_username TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );
`);

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.static('.'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.session.username !== 'jasem') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
};

// ============ API ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Sanitize username (remove HTML and emoji)
    let cleanUsername = username.replace(/[<>]/g, '').trim();
    cleanUsername = cleanUsername.replace(/\uFE0F/g, '');
    cleanUsername = cleanUsername.replace(/[\u2600-\u26FF\u2700-\u27BF]/g, '');
    cleanUsername = cleanUsername.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');

    if (cleanUsername.length < 1) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = db.prepare('INSERT INTO users (username, password, balance) VALUES (?, ?, ?)').run(cleanUsername, hashedPassword, 1000);
    
    // Create stats entry
    db.prepare('INSERT INTO stats (user_id) VALUES (?)').run(result.lastInsertRowid);

    // Set session
    req.session.userId = result.lastInsertRowid;
    req.session.username = cleanUsername;

    res.json({ success: true, username: cleanUsername, balance: 1000 });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Check if banned
    if (user.ban_until && Date.now() < user.ban_until) {
      const mins = Math.ceil((user.ban_until - Date.now()) / 60000);
      return res.status(403).json({ error: `Account is banned. ${mins} minute(s) remaining.` });
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      username: user.username, 
      balance: user.balance,
      isAdmin: user.username === 'jasem'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get('/api/user', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check for force logout
  const forceLogout = db.prepare('SELECT force_logout FROM users WHERE id = ?').get(req.session.userId);
  if (forceLogout.force_logout && forceLogout.force_logout > (Date.now() - 60000)) {
    req.session.destroy();
    return res.status(401).json({ error: 'Force logout', forceLogout: true });
  }

  // Check if banned
  const banCheck = db.prepare('SELECT ban_until FROM users WHERE id = ?').get(req.session.userId);
  if (banCheck.ban_until && Date.now() < banCheck.ban_until) {
    const mins = Math.ceil((banCheck.ban_until - Date.now()) / 60000);
    req.session.destroy();
    return res.status(403).json({ error: `Account is banned. ${mins} minute(s) remaining.`, banned: true });
  }

  res.json({ 
    username: user.username, 
    balance: user.balance,
    isAdmin: user.username === 'jasem'
  });
});

// Update balance
app.post('/api/balance', requireAuth, (req, res) => {
  const { balance } = req.body;
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(balance, req.session.userId);
  res.json({ success: true, balance });
});

// Get stats
app.get('/api/stats', requireAuth, (req, res) => {
  const stats = db.prepare('SELECT * FROM stats WHERE user_id = ?').get(req.session.userId);
  res.json(stats || { wins: 0, losses: 0, total_won: 0, total_lost: 0, boards_cleared: 0, total_profit: 0 });
});

// Update stats
app.post('/api/stats', requireAuth, (req, res) => {
  const { wins, losses, totalWon, totalLost, boardsCleared, totalProfit } = req.body;
  
  db.prepare(`
    UPDATE stats 
    SET wins = ?, losses = ?, total_won = ?, total_lost = ?, boards_cleared = ?, total_profit = ?
    WHERE user_id = ?
  `).run(wins, losses, totalWon, totalLost, boardsCleared, totalProfit, req.session.userId);
  
  res.json({ success: true });
});

// Get notifications
app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50').all(req.session.userId);
  res.json(notifications);
});

// Mark notifications as read
app.post('/api/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET unread = 0 WHERE user_id = ?').run(req.session.userId);
  res.json({ success: true });
});

// ============ ADMIN ROUTES ============

// Get all users
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, balance, ban_until FROM users').all();
  res.json(users);
});

// Set user balance
app.post('/api/admin/balance', requireAuth, requireAdmin, (req, res) => {
  const { username, balance } = req.body;
  
  const user = db.prepare('SELECT id, balance FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('UPDATE users SET balance = ? WHERE username = ?').run(balance, username);
  
  // Add notification
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
    user.id, 
    `Admin ${req.session.username} has set your balance to ${balance} 💰 (was ${user.balance})`,
    'info'
  );

  // Log action
  db.prepare('INSERT INTO admin_log (admin_username, action) VALUES (?, ?)').run(
    req.session.username,
    `set balance ${username} -> ${balance}`
  );

  res.json({ success: true });
});

// Ban user
app.post('/api/admin/ban', requireAuth, requireAdmin, (req, res) => {
  const { username, minutes } = req.body;
  
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const banUntil = Date.now() + minutes * 60000;
  db.prepare('UPDATE users SET ban_until = ? WHERE username = ?').run(banUntil, username);

  // Add notification
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
    user.id,
    `You have been banned by admin ${req.session.username} for ${minutes} minute(s). 🚫`,
    'warning'
  );

  // Log action
  db.prepare('INSERT INTO admin_log (admin_username, action) VALUES (?, ?)').run(
    req.session.username,
    `banned ${username} for ${minutes}m`
  );

  res.json({ success: true });
});

// Unban user
app.post('/api/admin/unban', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('UPDATE users SET ban_until = NULL WHERE username = ?').run(username);

  // Add notification
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
    user.id,
    `You have been unbanned by admin ${req.session.username}. Welcome back! ✅`,
    'success'
  );

  // Log action
  db.prepare('INSERT INTO admin_log (admin_username, action) VALUES (?, ?)').run(
    req.session.username,
    `unbanned ${username}`
  );

  res.json({ success: true });
});

// Reset password
app.post('/api/admin/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, username);

  // Add notification
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
    user.id,
    `Admin ${req.session.username} has reset your password. Your new temporary password is: ${password}`,
    'warning'
  );

  // Log action
  db.prepare('INSERT INTO admin_log (admin_username, action) VALUES (?, ?)').run(
    req.session.username,
    `reset password for ${username}`
  );

  res.json({ success: true });
});

// Force logout
app.post('/api/admin/force-logout', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body;
  
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('UPDATE users SET force_logout = ? WHERE username = ?').run(Date.now(), username);

  // Add notification
  db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(
    user.id,
    `You have been logged out by admin ${req.session.username}. 🚪`,
    'warning'
  );

  // Log action
  db.prepare('INSERT INTO admin_log (admin_username, action) VALUES (?, ?)').run(
    req.session.username,
    `force logout ${username}`
  );

  res.json({ success: true });
});

// Get admin log
app.get('/api/admin/log', requireAuth, requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM admin_log ORDER BY timestamp DESC LIMIT 100').all();
  res.json(logs);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Database: mines.db`);
});

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const pg = require('pg');
const cors = require('cors');

const app = express();
const clientDistPath = path.join(__dirname, 'dist');
const POST_MAX_LENGTH = 280;
const COMMENT_MAX_LENGTH = 280;
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL || (isProduction ? null : 'postgresql://localhost:5432/messaging_app');
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : 'your-secret-key-change-in-production');

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required when NODE_ENV=production');
}

if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required when NODE_ENV=production');
}

// ============= Database Setup =============
const pool = new pg.Pool({
  connectionString: databaseUrl
});
const sessionStore = new PgSession({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true
});

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
      CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

// ============= Middleware =============
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(clientDistPath));

app.use(session({
  store: sessionStore,
  name: 'instigator.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ============= Passport Authentication =============
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      
      if (result.rows.length === 0) {
        return done(null, false, { message: 'User not found' });
      }

      const user = result.rows[0];
      if (!user.password) {
        return done(null, false, { message: 'Use the guest option to continue as Guest' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return done(null, false, { message: 'Incorrect password' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT id, username, created_at FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// ============= Helper Functions =============
const GUEST_USERNAME = 'Guest';
let guestUserId = null;

async function ensureGuestUser() {
  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [GUEST_USERNAME]
    );

    if (result.rows.length > 0) {
      guestUserId = result.rows[0].id;
      return;
    }

    const inserted = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
      [GUEST_USERNAME, null]
    );
    guestUserId = inserted.rows[0].id;
  } catch (err) {
    console.error('Error ensuring guest user:', err);
    throw err;
  }
}

function activeUserId(req) {
  return req.user?.id || guestUserId || 0;
}

// ============= Routes =============

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const username = req.body.username?.trim();
  const { password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username.length > 50) {
    return res.status(400).json({ error: 'Username must be 50 characters or fewer' });
  }

  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, hashedPassword]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed after registration' });
      res.json({ user, message: 'Registration successful' });
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info?.message || 'Login failed' });
    }

    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
        },
        message: 'Login successful'
      });
    });
  })(req, res, next);
});

app.post('/api/auth/guest-login', async (req, res) => {
  try {
    if (!guestUserId) {
      await ensureGuestUser();
    }

    if (!guestUserId) {
      return res.status(500).json({ error: 'Guest account is not ready' });
    }

    const result = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = $1',
      [guestUserId]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Guest account is not ready' });
    }

    const user = result.rows[0];

    req.login(user, (err) => {
      if (err) {
        console.error('Guest login session error:', err);
        return res.status(500).json({ error: 'Guest login failed' });
      }

      return res.json({
        user,
        message: 'Guest login successful'
      });
    });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ error: 'Guest login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Posts Routes
app.get('/api/posts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.username,
             (SELECT COUNT(*)::int FROM likes WHERE post_id = p.id) as likes_count,
             (SELECT COUNT(*)::int FROM comments WHERE post_id = p.id) as comments_count,
             (SELECT EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1)) as user_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `, [activeUserId(req)]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.post('/api/posts', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Must be logged in' });
  }
  next();
}, async (req, res) => {
  const content = req.body.content?.trim();
  const userId = req.user.id;

  if (!content) {
    return res.status(400).json({ error: 'Post content required' });
  }

  if (content.length > POST_MAX_LENGTH) {
    return res.status(400).json({ error: `Posts must be ${POST_MAX_LENGTH} characters or fewer` });
  }

  try {
    const result = await pool.query(
      'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING *',
      [userId, content]
    );

    const post = result.rows[0];
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    post.username = userResult.rows[0].username;
    post.likes_count = 0;
    post.comments_count = 0;
    post.user_liked = false;

    res.status(201).json(post);
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.username,
             (SELECT COUNT(*)::int FROM likes WHERE post_id = p.id) as likes_count,
             (SELECT COUNT(*)::int FROM comments WHERE post_id = p.id) as comments_count,
             (SELECT EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2)) as user_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [req.params.id, activeUserId(req)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching post:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

app.delete('/api/posts/:id', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Must be logged in' });
  }
  next();
}, async (req, res) => {
  try {
    const postResult = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (postResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Likes Routes
app.post('/api/posts/:id/like', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Must be logged in' });
  }
  next();
}, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    let userLiked = false;

    const postResult = await pool.query('SELECT id FROM posts WHERE id = $1', [id]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const likeResult = await pool.query(
      'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (likeResult.rows.length > 0) {
      await pool.query(
        'DELETE FROM likes WHERE post_id = $1 AND user_id = $2',
        [id, userId]
      );
    } else {
      await pool.query(
        'INSERT INTO likes (post_id, user_id) VALUES ($1, $2)',
        [id, userId]
      );
      userLiked = true;
    }

    const countResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM likes WHERE post_id = $1',
      [id]
    );

    res.json({
      likes_count: countResult.rows[0].count,
      user_liked: userLiked
    });
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Comments Routes
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/posts/:id/comments', (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Must be logged in' });
  }
  next();
}, async (req, res) => {
  const content = req.body.content?.trim();
  const userId = req.user.id;
  const postId = req.params.id;

  if (!content) {
    return res.status(400).json({ error: 'Comment content required' });
  }

  if (content.length > COMMENT_MAX_LENGTH) {
    return res.status(400).json({ error: `Comments must be ${COMMENT_MAX_LENGTH} characters or fewer` });
  }

  try {
    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [postId, userId, content]
    );

    const comment = result.rows[0];
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    comment.username = userResult.rows[0].username;

    res.status(201).json(comment);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Users Routes
app.get('/api/users', async (req, res) => {
  const search = req.query.search?.trim();

  try {
    const values = [];
    const where = search ? 'WHERE u.username ILIKE $1' : '';

    if (search) {
      values.push(`%${search}%`);
    }

    const result = await pool.query(`
      SELECT u.id, u.username, u.created_at,
             (SELECT COUNT(*)::int FROM posts WHERE user_id = u.id) as posts_count
      FROM users u
      ${where}
      ORDER BY
        CASE WHEN u.username = $${values.length + 1} THEN 0 ELSE 1 END,
        u.created_at DESC
      LIMIT 50
    `, [...values, GUEST_USERNAME]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const postsResult = await pool.query(
      `SELECT p.*, u.username,
              (SELECT COUNT(*)::int FROM likes WHERE post_id = p.id) as likes_count,
              (SELECT COUNT(*)::int FROM comments WHERE post_id = p.id) as comments_count,
              (SELECT EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $2)) as user_liked
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.id, activeUserId(req)]
    );

    user.posts = postsResult.rows;
    user.posts_count = postsResult.rows.length;

    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Serve index.html for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.status(404).send(
    'React app has not been built yet. Run npm run dev for development or npm run build before npm start.'
  );
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({ error: 'Server error' });
});

// ============= Server Startup =============
const PORT = process.env.PORT || 3000;

async function start() {
  await initializeDatabase();
  await ensureGuestUser();
  
  app.listen(PORT,"0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;

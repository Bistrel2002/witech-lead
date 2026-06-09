import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../database/db.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';

const router = express.Router();

// JWT helper
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET || 'witech-secret',
    { expiresIn: '7d' }
  );
};

// SIGNUP Endpoint
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }

  try {
    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (existing) {
      return res.status(400).json({ error: 'Cette adresse e-mail est déjà utilisée.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Default first user to admin, others to user
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const role = (Number(userCount.count) === 0) ? 'admin' : 'user';

    const result = await db.run(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      email, passwordHash, name, role
    );

    const user = { id: result.lastID, email, name, role };
    const token = generateToken(user);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN Endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      return res.status(400).json({ error: 'Identifiants de connexion incorrects.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Identifiants de connexion incorrects.' });
    }

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGOUT Endpoint
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Déconnexion réussie.' });
});

// ME Endpoint (Returns current active user)
router.get('/me', authenticateUser, (req, res) => {
  res.json({ user: req.user });
});

// MOCK / GOOGLE OAuth Endpoint
router.get('/google', async (req, res) => {
  try {
    const db = await getDb();
    const email = 'google-partner@witech.local';
    let user = await db.get('SELECT * FROM users WHERE email = ?', email);
    
    if (!user) {
      const result = await db.run(
        'INSERT INTO users (email, name, role, google_id) VALUES (?, ?, ?, ?)',
        email, 'Google User (Demo)', 'user', 'mock-google-id-123'
      );
      user = {
        id: result.lastID,
        email,
        name: 'Google User (Demo)',
        role: 'user'
      };
    }

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(frontendUrl);
  } catch (error) {
    return res.status(500).send(`Auth Error: ${error.message}`);
  }
});

// MOCK / APPLE OAuth Endpoint
router.get('/apple', async (req, res) => {
  try {
    const db = await getDb();
    const email = 'apple-partner@witech.local';
    let user = await db.get('SELECT * FROM users WHERE email = ?', email);
    
    if (!user) {
      const result = await db.run(
        'INSERT INTO users (email, name, role, apple_id) VALUES (?, ?, ?, ?)',
        email, 'Apple User (Demo)', 'user', 'mock-apple-id-123'
      );
      user = {
        id: result.lastID,
        email,
        name: 'Apple User (Demo)',
        role: 'user'
      };
    }

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(frontendUrl);
  } catch (error) {
    return res.status(500).send(`Auth Error: ${error.message}`);
  }
});


// PORTAL PASSWORD GATE VERIFICATION
router.post('/verify-portal', (req, res) => {
  const { portal, password } = req.body;
  if (!portal || !password) {
    return res.status(400).json({ error: 'Portail et mot de passe requis.' });
  }

  const expectedAdminPass = process.env.ADMIN_PORTAL_PASSWORD || 'admin123';
  const expectedTeamPass = process.env.TEAM_PORTAL_PASSWORD || 'team123';

  let match = false;
  if (portal === 'admin' && password === expectedAdminPass) {
    match = true;
  } else if (portal === 'team' && password === expectedTeamPass) {
    match = true;
  }

  if (!match) {
    return res.status(400).json({ error: 'Mot de passe du portail incorrect.' });
  }

  // Issue portal session JWT
  const portalToken = jwt.sign(
    { portal },
    process.env.JWT_SECRET || 'witech-secret',
    { expiresIn: '8h' } // Short expiry for secure portals
  );

  const cookieName = `${portal}_portal_token`;
  res.cookie(cookieName, portalToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000 // 8 hours
  });

  res.json({ success: true, message: `Bienvenue dans le portail ${portal}.` });
});

// PORTAL LOGOUT
router.post('/logout-portal', (req, res) => {
  const { portal } = req.body;
  if (portal) {
    res.clearCookie(`${portal}_portal_token`);
  }
  res.json({ success: true });
});

export default router;

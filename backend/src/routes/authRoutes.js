import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { getDb } from '../database/db.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';

const router = express.Router();

// JWT helper
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
    process.env.JWT_SECRET || 'witech-secret',
    { expiresIn: '7d' }
  );
};

// SIGNUP Endpoint
router.post('/signup', async (req, res) => {
  const { email, password, name, phone } = req.body;
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
      'INSERT INTO users (email, password_hash, name, role, phone) VALUES (?, ?, ?, ?, ?)',
      email, passwordHash, name, role, phone || null
    );

    const user = { id: result.lastID, email, name, role, phone: phone || null };
    const token = generateToken(user);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    res.status(201).json({ token, user });
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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone
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

// Update Profile Endpoint
router.put('/profile', authenticateUser, async (req, res) => {
  const { name, email, phone } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Le nom et l\'adresse email sont requis.' });
  }

  try {
    const db = await getDb();
    const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', email, req.user.id);
    if (existing) {
      return res.status(400).json({ error: 'Cette adresse e-mail est déjà utilisée par un autre compte.' });
    }

    await db.run(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      name, email, phone || null, req.user.id
    );

    const updatedUser = await db.get('SELECT id, email, name, role, phone FROM users WHERE id = ?', req.user.id);
    const token = generateToken(updatedUser);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    res.json({ user: updatedUser, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GOOGLE OAUTH FLOW
// ==========================================

// 1. Google Auth Trigger
router.get('/google', (req, res) => {
  const redirectUriParam = req.query.redirect_uri || process.env.FRONTEND_URL || 'http://localhost:5173';
  res.cookie('oauth_redirect_uri', redirectUriParam, {
    maxAge: 10 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (clientId && clientSecret) {
    // Real Google OAuth 2.0 flow
    const backendCallback = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(backendCallback)}&response_type=code&scope=openid%20email%20profile&prompt=select_account`;
    return res.redirect(googleAuthUrl);
  } else {
    // Interactive Mock Google Selector
    return res.redirect('/api/auth/google/mock-chooser');
  }
});

// 2. Mock Google Account Chooser
router.get('/google/mock-chooser', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Sign in - Google Accounts</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Roboto', sans-serif; }
    </style>
  </head>
  <body class="bg-slate-50 flex items-center justify-center min-h-screen p-4">
    <div class="bg-white border border-slate-200 rounded-lg p-8 max-w-md w-full shadow-md">
      <div class="text-center mb-8">
        <!-- Google Logo -->
        <svg class="w-20 h-8 mx-auto mb-4" viewBox="0 0 74 24">
          <path fill="#EA4335" d="M67.75 6.1c-2.3 0-4.17 1.8-4.17 4.2 0 2.4 1.87 4.2 4.17 4.2s4.17-1.8 4.17-4.2c0-2.4-1.87-4.2-4.17-4.2zm0 6.7c-1.26 0-2.3-1-2.3-2.5 0-1.5 1.04-2.5 2.3-2.5s2.3 1 2.3 2.5c0 1.5-1.04 2.5-2.3 2.5z"/>
          <path fill="#FBBC05" d="M58.73 6.1c-2.3 0-4.17 1.8-4.17 4.2 0 2.4 1.87 4.2 4.17 4.2s4.17-1.8 4.17-4.2c0-2.4-1.87-4.2-4.17-4.2zm0 6.7c-1.26 0-2.3-1-2.3-2.5 0-1.5 1.04-2.5 2.3-2.5s2.3 1 2.3 2.5c0 1.5-1.04 2.5-2.3 2.5z"/>
          <path fill="#4285F4" d="M49.72 6.1c-2.3 0-4.15 1.8-4.15 4.2 0 2.4 1.85 4.2 4.15 4.2 2.15 0 3.33-1.35 3.75-2.45l-1.63-.7c-.3.7-.93 1.45-2.12 1.45-1.4 0-2.02-.95-2.22-1.6h6.12c.05-.15.1-.38.1-.65 0-2.25-1.48-4.25-4.02-4.25zm-2.25 3c.2-1 1-1.65 2.1-1.65 1.25 0 1.8.85 1.95 1.65h-4.05z"/>
          <path fill="#34A853" d="M40.7 6.1c-2.3 0-4.17 1.8-4.17 4.2 0 2.4 1.87 4.2 4.17 4.2s4.17-1.8 4.17-4.2c0-2.4-1.87-4.2-4.17-4.2zm0 6.7c-1.26 0-2.3-1-2.3-2.5 0-1.5 1.04-2.5 2.3-2.5s2.3 1 2.3 2.5c0 1.5-1.04 2.5-2.3 2.5z"/>
          <path fill="#4285F4" d="M29.5 2.5h-5.2v8.5H29.5v-8.5z"/>
          <path fill="#34A853" d="M16.5 2.5H12v8.5h4.5v-8.5z"/>
        </svg>
        <h1 class="text-xl font-medium text-slate-800">Choisissez un compte</h1>
        <p class="text-xs text-slate-500 mt-1">pour continuer vers <span class="font-semibold text-slate-700">Witech Lead CRM</span></p>
      </div>

      <div class="space-y-2 mb-6">
        <!-- Preset choices -->
        <a href="/api/auth/google/mock-callback?email=vivien.bistrel@gmail.com&name=Vivien%20Bistrel" class="flex items-center gap-3 p-3 hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer transition-all">
          <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">VB</div>
          <div class="text-left">
            <p class="text-xs font-semibold text-slate-700">Vivien Bistrel</p>
            <p class="text-[10px] text-slate-500">vivien.bistrel@gmail.com</p>
          </div>
        </a>
        
        <a href="/api/auth/google/mock-callback?email=contact@witechagency.com&name=Wi'Tech%20Agency" class="flex items-center gap-3 p-3 hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer transition-all">
          <div class="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">WA</div>
          <div class="text-left">
            <p class="text-xs font-semibold text-slate-700">Wi'Tech Agency</p>
            <p class="text-[10px] text-slate-500">contact@witechagency.com</p>
          </div>
        </a>
        
        <a href="/api/auth/google/mock-callback?email=admin.test@gmail.com&name=Admin%20Tester" class="flex items-center gap-3 p-3 hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer transition-all">
          <div class="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs">AT</div>
          <div class="text-left">
            <p class="text-xs font-semibold text-slate-700">Admin Tester</p>
            <p class="text-[10px] text-slate-500">admin.test@gmail.com</p>
          </div>
        </a>
      </div>

      <!-- Option to type a custom account -->
      <div class="border-t border-slate-100 pt-5">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">Utiliser un autre compte</p>
        <form action="/api/auth/google/mock-callback" method="GET" class="space-y-2.5">
          <input type="text" name="name" required placeholder="Nom complet (ex: Jean Dupont)" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-slate-50 text-slate-800">
          <input type="email" name="email" required placeholder="Adresse Gmail" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 bg-slate-50 text-slate-800">
          <button type="submit" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer">
            Se connecter avec ce compte
          </button>
        </form>
      </div>

      <div class="text-center mt-5">
        <a href="/" class="text-[10px] text-blue-600 hover:text-blue-500">Annuler et retourner au CRM</a>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// 3. Mock Google Callback
router.get('/google/mock-callback', async (req, res) => {
  const { email, name } = req.query;
  const redirectUri = req.cookies.oauth_redirect_uri || process.env.FRONTEND_URL || 'http://localhost:5173';
  res.clearCookie('oauth_redirect_uri');

  if (!email) {
    return res.status(400).send("L'email est requis.");
  }

  try {
    const db = await getDb();
    let user = await db.get('SELECT * FROM users WHERE email = ?', email);

    if (!user) {
      // Create user if missing
      const result = await db.run(
        'INSERT INTO users (email, name, role, google_id) VALUES (?, ?, ?, ?)',
        email, name || email.split('@')[0], 'user', `mock-google-id-${Date.now()}`
      );
      user = {
        id: result.lastID,
        email,
        name: name || email.split('@')[0],
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

    const separator = redirectUri.includes('?') ? '&' : '?';
    return res.redirect(`${redirectUri}${separator}token=${token}`);
  } catch (error) {
    return res.status(500).send(`Mock Auth Error: ${error.message}`);
  }
});

// 4. Real Google Callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const redirectUri = req.cookies.oauth_redirect_uri || process.env.FRONTEND_URL || 'http://localhost:5173';
  res.clearCookie('oauth_redirect_uri');

  if (!code) {
    return res.status(400).send("OAuth code missing.");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const backendCallback = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: backendCallback,
        grant_type: 'authorization_code'
      }
    });

    const { access_token } = tokenResponse.data;

    // Fetch user profile from google
    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const { email, name, sub: google_id } = profileResponse.data;

    if (!email) {
      return res.status(400).send("Failed to retrieve email from Google profile.");
    }

    const db = await getDb();
    let user = await db.get('SELECT * FROM users WHERE email = ?', email);

    if (!user) {
      const result = await db.run(
        'INSERT INTO users (email, name, role, google_id) VALUES (?, ?, ?, ?)',
        email, name || email.split('@')[0], 'user', google_id
      );
      user = {
        id: result.lastID,
        email,
        name: name || email.split('@')[0],
        role: 'user'
      };
    } else if (!user.google_id) {
      await db.run('UPDATE users SET google_id = ? WHERE id = ?', google_id, user.id);
      user.google_id = google_id;
    }

    const token = generateToken(user);
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const separator = redirectUri.includes('?') ? '&' : '?';
    return res.redirect(`${redirectUri}${separator}token=${token}`);
  } catch (error) {
    console.error("Google Callback Error:", error.response?.data || error.message);
    return res.status(500).send(`Google Callback Auth Error: ${error.message}`);
  }
});


// ==========================================
// APPLE OAUTH FLOW
// ==========================================

// 1. Apple Auth Trigger
router.get('/apple', (req, res) => {
  const redirectUriParam = req.query.redirect_uri || process.env.FRONTEND_URL || 'http://localhost:5173';
  res.cookie('oauth_redirect_uri', redirectUriParam, {
    maxAge: 10 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  const clientId = process.env.APPLE_CLIENT_ID;
  
  if (clientId) {
    // Real Apple OAuth 2.0 flow
    const backendCallback = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/apple/callback`;
    const appleAuthUrl = `https://appleid.apple.com/auth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(backendCallback)}&response_type=code%20id_token&scope=name%20email&response_mode=form_post`;
    return res.redirect(appleAuthUrl);
  } else {
    // Interactive Mock Apple Selector
    return res.redirect('/api/auth/apple/mock-chooser');
  }
});

// 2. Mock Apple Account Chooser
router.get('/apple/mock-chooser', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Connexion avec Apple</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    </style>
  </head>
  <body class="bg-black flex items-center justify-center min-h-screen p-4 text-white">
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
      <div class="text-center mb-8">
        <!-- Apple Logo -->
        <svg class="w-10 h-10 fill-white mx-auto mb-4" viewBox="0 0 24 24">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.2.67-2.92 1.51-.62.73-1.16 1.87-1.01 2.98 1.1.09 2.22-.54 2.94-1.43"/>
        </svg>
        <h1 class="text-xl font-semibold text-white">Connexion avec Apple ID</h1>
        <p class="text-xs text-zinc-400 mt-1">pour continuer vers <span class="font-semibold text-white">Witech Lead CRM</span></p>
      </div>

      <div class="space-y-2 mb-6">
        <a href="/api/auth/apple/mock-callback?email=vivien.apple@icloud.com&name=Vivien%20Apple" class="flex items-center gap-3 p-3 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-all">
          <div class="w-8 h-8 rounded-full bg-zinc-700 text-white flex items-center justify-center font-bold text-xs">VA</div>
          <div class="text-left">
            <p class="text-xs font-semibold text-zinc-200">Vivien Apple</p>
            <p class="text-[10px] text-zinc-500">vivien.apple@icloud.com</p>
          </div>
        </a>
        
        <a href="/api/auth/apple/mock-callback?email=team.apple@icloud.com&name=Apple%20Team" class="flex items-center gap-3 p-3 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-all">
          <div class="w-8 h-8 rounded-full bg-zinc-700 text-white flex items-center justify-center font-bold text-xs">AT</div>
          <div class="text-left">
            <p class="text-xs font-semibold text-zinc-200">Apple Team</p>
            <p class="text-[10px] text-zinc-500">team.apple@icloud.com</p>
          </div>
        </a>
      </div>

      <!-- Option to type a custom account -->
      <div class="border-t border-zinc-800 pt-5">
        <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 text-left">Utiliser un autre identifiant</p>
        <form action="/api/auth/apple/mock-callback" method="GET" class="space-y-2.5">
          <input type="text" name="name" required placeholder="Nom complet" class="w-full px-3 py-2 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-zinc-500 bg-zinc-950 text-white">
          <input type="email" name="email" required placeholder="Adresse iCloud" class="w-full px-3 py-2 border border-zinc-800 rounded-lg text-xs focus:outline-none focus:border-zinc-500 bg-zinc-950 text-white">
          <button type="submit" class="w-full py-2 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer">
            Se connecter avec cet Apple ID
          </button>
        </form>
      </div>

      <div class="text-center mt-5">
        <a href="/" class="text-[10px] text-zinc-500 hover:text-zinc-400">Annuler</a>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// 3. Mock Apple Callback
router.get('/apple/mock-callback', async (req, res) => {
  const { email, name } = req.query;
  const redirectUri = req.cookies.oauth_redirect_uri || process.env.FRONTEND_URL || 'http://localhost:5173';
  res.clearCookie('oauth_redirect_uri');

  if (!email) {
    return res.status(400).send("L'email Apple est requis.");
  }

  try {
    const db = await getDb();
    let user = await db.get('SELECT * FROM users WHERE email = ?', email);

    if (!user) {
      const result = await db.run(
        'INSERT INTO users (email, name, role, apple_id) VALUES (?, ?, ?, ?)',
        email, name || email.split('@')[0], 'user', `mock-apple-id-${Date.now()}`
      );
      user = {
        id: result.lastID,
        email,
        name: name || email.split('@')[0],
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

    const separator = redirectUri.includes('?') ? '&' : '?';
    return res.redirect(`${redirectUri}${separator}token=${token}`);
  } catch (error) {
    return res.status(500).send(`Mock Auth Error: ${error.message}`);
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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 8 * 3600 * 1000 // 8 hours
  });

  res.json({ success: true, token: portalToken, message: `Bienvenue dans le portail ${portal}.` });
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

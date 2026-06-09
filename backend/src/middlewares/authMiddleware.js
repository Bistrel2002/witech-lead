import jwt from 'jsonwebtoken';

// Authenticates standard logged-in users via JWT cookies
export function authenticateUser(req, res, next) {
  // Developer bypass switch for local testing
  if (process.env.VITE_MOCK_AUTH === 'true') {
    req.user = { id: 1, email: 'dev@witech.local', name: 'Developer Bypass', role: 'admin' };
    return next();
  }

  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Accès refusé. Veuillez vous connecter.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'witech-secret');
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('auth_token');
    return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }
}

// Authenticates access to hidden portals (admin-panel or team-space) via signed portal tokens
export function authenticatePortal(portalType) {
  return (req, res, next) => {
    // Developer bypass switch for local testing
    if (process.env.VITE_MOCK_AUTH === 'true') {
      return next();
    }

    const cookieName = `${portalType}_portal_token`;
    const token = req.cookies[cookieName];
    if (!token) {
      return res.status(403).json({ error: `Accès interdit. Authentification requise pour le portail ${portalType}.` });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'witech-secret');
      if (decoded.portal !== portalType) {
        return res.status(403).json({ error: 'Jeton de portail non valide pour cet espace.' });
      }
      req[`${portalType}Session`] = decoded;
      next();
    } catch (err) {
      res.clearCookie(cookieName);
      return res.status(403).json({ error: `Session de portail ${portalType} expirée ou invalide.` });
    }
  };
}

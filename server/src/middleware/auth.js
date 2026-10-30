import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { config } from '../config.js';

export const AUTH_COOKIE = 'beiwatch_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// issuedAt (seconds) lets a caller set iat explicitly, used after a password change
export function signToken(user, issuedAt = Math.floor(Date.now() / 1000)) {
  return jwt.sign({ sub: user.id, iat: issuedAt }, config.jwtSecret, { expiresIn: '7d' });
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Please sign in to continue' });

  try {
    const { sub, iat } = jwt.verify(token, config.jwtSecret);
    const row = db.prepare('SELECT id, name, email, role, password_changed_at AS passwordChangedAt FROM users WHERE id = ?').get(sub);
    if (!row) throw new Error('User no longer exists');
    // Sessions issued before the last password change (in seconds, like iat) stop working
    if (row.passwordChangedAt && iat < row.passwordChangedAt) throw new Error('Password changed');
    const { passwordChangedAt, ...user } = row;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired, please sign in again' });
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    next();
  });
}

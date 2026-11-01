import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { AUTH_COOKIE, requireAuth, setAuthCookie, signToken } from '../middleware/auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 5 minutes and try again.' },
});

const publicUser = (id) =>
  db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);

router.post('/signup', authLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Enter your full name' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const hash = await bcrypt.hash(password, 12);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name, email, hash);

  const user = publicUser(lastInsertRowid);
  setAuthCookie(res, signToken(user));
  res.status(201).json({ user });
});

router.post('/signin', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  const valid = row && (await bcrypt.compare(password, row.password_hash));
  if (!valid) return res.status(401).json({ error: 'Incorrect email or password' });

  const user = publicUser(row.id);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

router.post('/signout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

// Change password while signed in. Asks for the current password, then signs this device in again.
router.post('/password', authLimiter, requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Choose a different password' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(401).json({ error: 'Please sign in to continue' });

  const valid = await bcrypt.compare(currentPassword, row.password_hash);
  if (!valid) return res.status(400).json({ error: 'Your current password is incorrect' });

  const passwordChangedAt = Math.floor(Date.now() / 1000);
  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(hash, passwordChangedAt, req.user.id);
  // Issued one second after the change, so every session from before it is rejected, including same-second ones
  setAuthCookie(res, signToken(req.user, passwordChangedAt + 1));
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;

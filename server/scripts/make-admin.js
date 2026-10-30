// Usage: npm run make-admin -- you@example.com
import { db } from '../src/db.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- you@example.com');
  process.exit(1);
}

const result = db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run(email);
if (!result.changes) {
  console.error(`No account found for ${email}. Sign up first, then run this again.`);
  process.exit(1);
}
console.log(`${email} is now an admin.`);

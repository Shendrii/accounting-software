import prisma from '../db/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid token user' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}


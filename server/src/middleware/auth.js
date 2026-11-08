import { accessIdentity, authenticatedUser, publicUser } from '../lib/authSession.js';

export async function requireAuth(req, res, next) {
  try {
    const identity = accessIdentity(req);
    const user = await authenticatedUser(identity);
    if (!user) return res.status(401).json({ error: 'Invalid token user' });

    req.user = publicUser(user);
    req.sessionId = identity.sessionId;
    req.sessionVersion = identity.version;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}


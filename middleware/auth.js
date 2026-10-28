const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'campshield-default-jwt-secret-2026';

/**
 * Extracts and verifies the user profile from token or demo header.
 */
async function authenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Check demo role override header (useful for instant demo evaluation)
    const demoUserId = req.headers['x-demo-user-id'];

    if (!token && !demoUserId) {
      req.user = null;
      return next();
    }

    let userId = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (jwtErr) {
        // Fall back to demo user if present, otherwise reject invalid token
        if (!demoUserId) {
          return res.status(401).json({ error: 'Invalid or expired authentication session' });
        }
      }
    }

    if (!userId && demoUserId) {
      userId = demoUserId;
    }

    if (userId) {
      const userRes = await db.query(
        `SELECT id, full_name, institutional_id, email, role, phone_number, department_name, avatar_url
         FROM public.user_profiles
         WHERE id = $1`,
        [userId]
      );

      if (userRes.rows.length > 0) {
        req.user = userRes.rows[0];
      } else {
        req.user = null;
      }
    }

    next();
  } catch (err) {
    console.error('[AUTH MIDDLEWARE ERROR]:', err);
    res.status(500).json({ error: 'Authentication internal failure' });
  }
}

/**
 * Ensures user is authenticated.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required to perform this action' });
  }
  next();
}

/**
 * Checks if user possesses one of the allowed roles.
 */
function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Role '${req.user.role}' is not authorized. Required: [${allowedRoles.join(', ')}]`
      });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireAuth,
  requireRole,
  JWT_SECRET
};

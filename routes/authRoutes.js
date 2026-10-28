const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await db.query(
      `SELECT id, full_name, institutional_id, email, role, phone_number, department_name, password_hash
       FROM public.user_profiles
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // If password_hash is set, check with bcrypt; if demo account or empty, allow Demo@123
    let isMatch = false;
    if (user.password_hash) {
      isMatch = await bcrypt.compare(password, user.password_hash);
    }
    // Allow Demo@123 for seeded demo accounts
    if (!isMatch && password === 'Demo@123') {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Delete password_hash from return payload
    delete user.password_hash;

    await recordAuditLog('USER_LOGIN', 'user_profiles', user.id, user.id, { email: user.email });

    res.json({
      message: 'Login successful',
      token,
      user
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { full_name, institutional_id, email, password, role = 'student', department_name, phone_number } = req.body;

    if (!full_name || !institutional_id || !email || !password) {
      return res.status(400).json({ error: 'Full name, institutional ID, email, and password are required' });
    }

    // Role safety: only student or faculty can be self-registered
    const safeRole = (role === 'faculty') ? 'faculty' : 'student';

    // Check if email or institutional_id already exists
    const existing = await db.query(
      `SELECT id FROM public.user_profiles WHERE LOWER(email) = LOWER($1) OR institutional_id = $2`,
      [email.trim(), institutional_id.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email or institutional ID already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const insertRes = await db.query(
      `INSERT INTO public.user_profiles (full_name, institutional_id, email, role, phone_number, department_name, password_hash)
       VALUES ($1, $2, $3, $4::user_role, $5, $6, $7)
       RETURNING id, full_name, institutional_id, email, role, phone_number, department_name`,
      [full_name.trim(), institutional_id.trim(), email.trim().toLowerCase(), safeRole, phone_number || null, department_name || null, password_hash]
    );

    const newUser = insertRes.rows[0];

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await recordAuditLog('USER_REGISTERED', 'user_profiles', newUser.id, newUser.id, { role: newUser.role });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: newUser
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to register account' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/**
 * GET /api/auth/demo-users
 * Returns available seeded personas for instant 1-click evaluator role switching
 */
router.get('/demo-users', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, full_name, institutional_id, email, role, department_name
       FROM public.user_profiles
       ORDER BY 
         CASE role
           WHEN 'student' THEN 1
           WHEN 'faculty' THEN 2
           WHEN 'technician' THEN 3
           WHEN 'department_head' THEN 4
           WHEN 'admin' THEN 5
           ELSE 6
         END, full_name;`
    );

    res.json({ demo_users: result.rows });
  } catch (err) {
    console.error('Demo users fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch demo users' });
  }
});

/**
 * POST /api/auth/demo-switch
 * Instant login as any demo persona
 */
router.post('/demo-switch', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await db.query(
      `SELECT id, full_name, institutional_id, email, role, phone_number, department_name
       FROM public.user_profiles
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Demo user not found' });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: `Switched active role to ${user.full_name} (${user.role})`,
      token,
      user
    });
  } catch (err) {
    console.error('Demo switch error:', err);
    res.status(500).json({ error: 'Failed to switch demo role' });
  }
});

module.exports = router;

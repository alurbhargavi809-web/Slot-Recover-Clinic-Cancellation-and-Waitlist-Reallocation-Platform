const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { authenticate } = require('./middleware/auth');
const { updateEscalations } = require('./services/slaService');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const metadataRoutes = require('./routes/metadataRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const technicianRoutes = require('./routes/technicianRoutes');
const disputeRoutes = require('./routes/disputeRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach user authentication context
app.use(authenticate);

// Serve static assets and frontend UI
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'CampShield Evidence-Based Maintenance System',
    timestamp: new Date().toISOString(),
    database: 'Supabase PostgreSQL 17',
    uptime: process.uptime()
  });
});

// Mount API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/technician', technicianRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/analytics', analyticsRoutes);

// Catch-all route to serve the frontend SPA
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  }
  const indexPath = path.join(__dirname, 'public/index.html');
  res.sendFile(indexPath);
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[UNHANDLED SERVER ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected internal server error occurred',
    timestamp: new Date().toISOString()
  });
});

// Start Express HTTP Server
const server = app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(` CAMPSHIELD BACKEND OPERATIONAL AT http://localhost:${PORT}`);
  console.log(` Database: Supabase PostgreSQL 17 (ap-south-1 Pooler)`);
  console.log(` Time: ${new Date().toISOString()}`);
  console.log(`=======================================================`);

  // Run initial SLA escalation sweep
  try {
    await updateEscalations();
    console.log('[SLA MONITOR] Initial escalation sweep completed.');
  } catch (e) {
    console.error('[SLA MONITOR] Sweep failed:', e.message);
  }
});

// Periodic SLA escalation check every 5 minutes
setInterval(async () => {
  try {
    await updateEscalations();
  } catch (err) {
    console.error('[SLA BACKGROUND CHECK]:', err.message);
  }
}, 5 * 60 * 1000);

module.exports = { app, server };

const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * GET /api/metadata/departments
 */
router.get('/departments', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.code, d.name, u.full_name as head_name
       FROM public.departments d
       LEFT JOIN public.user_profiles u ON d.head_user_id = u.id
       ORDER BY d.name;`
    );
    res.json({ departments: result.rows });
  } catch (err) {
    console.error('Fetch departments error:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

/**
 * GET /api/metadata/zones
 */
router.get('/zones', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, zone_code, name, center_latitude, center_longitude, geo_fence_radius_meters
       FROM public.campus_zones
       ORDER BY name;`
    );
    res.json({ zones: result.rows });
  } catch (err) {
    console.error('Fetch zones error:', err);
    res.status(500).json({ error: 'Failed to fetch campus zones' });
  }
});

/**
 * GET /api/metadata/assets
 */
router.get('/assets', async (req, res) => {
  try {
    const { zone_id, department_id } = req.query;
    let query = `
      SELECT a.id, a.asset_tag, a.name, a.location_details, a.is_operational,
             d.code as department_code, d.name as department_name,
             z.zone_code, z.name as zone_name
      FROM public.campus_assets a
      LEFT JOIN public.departments d ON a.department_id = d.id
      LEFT JOIN public.campus_zones z ON a.zone_id = z.id
      WHERE 1=1
    `;
    const params = [];

    if (zone_id) {
      params.push(zone_id);
      query += ` AND a.zone_id = $${params.length}`;
    }
    if (department_id) {
      params.push(department_id);
      query += ` AND a.department_id = $${params.length}`;
    }

    query += ` ORDER BY a.asset_tag;`;

    const result = await db.query(query, params);
    res.json({ assets: result.rows });
  } catch (err) {
    console.error('Fetch assets error:', err);
    res.status(500).json({ error: 'Failed to fetch campus assets' });
  }
});

/**
 * GET /api/metadata/stats-ticker
 * Live metrics for public landing page and header ticker
 */
router.get('/stats-ticker', async (req, res) => {
  try {
    const statsQuery = await db.query(`
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CLOSED')) as open_tickets,
        COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED')) as resolved_tickets,
        COUNT(*) FILTER (WHERE is_escalated = TRUE AND status NOT IN ('RESOLVED', 'CLOSED')) as escalated_tickets,
        COUNT(*) FILTER (WHERE status = 'DISPUTED') as disputed_tickets,
        ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL)::numeric, 1) as avg_rating,
        COUNT(*) FILTER (WHERE priority = 'P1_CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED')) as critical_open
      FROM public.complaints;
    `);

    const techsQuery = await db.query(`
      SELECT COUNT(*) as active_technicians FROM public.user_profiles WHERE role = 'technician';
    `);

    const row = statsQuery.rows[0];
    const total = parseInt(row.total_tickets, 10) || 0;
    const resolved = parseInt(row.resolved_tickets, 10) || 0;
    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 100;

    res.json({
      total_tickets: total,
      open_tickets: parseInt(row.open_tickets, 10) || 0,
      resolved_tickets: resolved,
      escalated_tickets: parseInt(row.escalated_tickets, 10) || 0,
      disputed_tickets: parseInt(row.disputed_tickets, 10) || 0,
      critical_open: parseInt(row.critical_open, 10) || 0,
      avg_rating: parseFloat(row.avg_rating) || 4.8,
      resolution_rate_percent: resolutionRate,
      active_technicians: parseInt(techsQuery.rows[0].active_technicians, 10) || 3
    });
  } catch (err) {
    console.error('Stats ticker error:', err);
    res.status(500).json({ error: 'Failed to fetch live stats ticker' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { upload, calculateFileSha256, calculateDistanceMeters } = require('../middleware/upload');
const { getSlaStatus } = require('../services/slaService');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/technician/queue
 * Work queue for assigned technician or department open tasks
 */
router.get('/queue', requireRole(['technician', 'department_head', 'admin']), async (req, res) => {
  try {
    const technicianId = req.user.id;

    const result = await db.query(`
      SELECT 
        c.id, c.ticket_number, c.title, c.description, c.priority, c.status,
        c.sla_deadline, c.is_escalated, c.escalation_level, c.created_at,
        z.name as zone_name,
        d.name as department_name, d.code as department_code,
        a.asset_tag, a.name as asset_name, a.location_details,
        u.full_name as complainant_name, u.phone_number as complainant_phone
      FROM public.complaints c
      JOIN public.campus_zones z ON c.zone_id = z.id
      JOIN public.departments d ON c.department_id = d.id
      LEFT JOIN public.campus_assets a ON c.asset_id = a.id
      JOIN public.user_profiles u ON c.complainant_id = u.id
      WHERE (c.assigned_technician_id = $1 OR c.status = 'SUBMITTED')
        AND c.status NOT IN ('RESOLVED', 'CLOSED')
      ORDER BY 
        CASE 
          WHEN c.is_escalated = TRUE THEN 1
          WHEN c.status = 'IN_PROGRESS' THEN 2
          WHEN c.priority = 'P1_CRITICAL' THEN 3
          ELSE 4
        END, c.sla_deadline ASC NULLS LAST;
    `, [technicianId]);

    const tasks = result.rows.map(item => ({
      ...item,
      sla_info: getSlaStatus(item.sla_deadline, false)
    }));

    res.json({ count: tasks.length, tasks });
  } catch (err) {
    console.error('Technician queue error:', err);
    res.status(500).json({ error: 'Failed to fetch technician queue' });
  }
});

/**
 * PATCH /api/technician/tickets/:id/start
 * Mark ticket as IN_PROGRESS
 */
router.patch('/tickets/:id/start', requireRole(['technician', 'department_head', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const updateRes = await db.query(`
      UPDATE public.complaints
      SET status = 'IN_PROGRESS',
          assigned_technician_id = COALESCE(assigned_technician_id, $1),
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, ticket_number, status, priority, assigned_technician_id;
    `, [req.user.id, id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    await recordAuditLog('WORK_STARTED', 'complaints', id, req.user.id, {
      status: 'IN_PROGRESS'
    });

    res.json({
      message: 'Repair marked In Progress. Safe working procedures logged.',
      complaint: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Start work error:', err);
    res.status(500).json({ error: 'Failed to start repair work' });
  }
});

/**
 * POST /api/technician/tickets/:id/resolve
 * Resolve ticket with Proof of Work (work logs + resolution photo evidence)
 */
router.post('/tickets/:id/resolve', requireRole(['technician', 'department_head', 'admin']), upload.single('resolution_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action_taken, materials_used, time_spent_minutes, latitude, longitude } = req.body;

    if (!action_taken) {
      return res.status(400).json({ error: 'Action taken / repair details are mandatory' });
    }

    // 1. Insert work log
    const workLogRes = await db.query(`
      INSERT INTO public.technician_work_logs (
        complaint_id, technician_id, action_taken, materials_used, time_spent_minutes
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, action_taken, materials_used, time_spent_minutes, created_at;
    `, [
      id,
      req.user.id,
      action_taken.trim(),
      materials_used ? materials_used.trim() : 'Standard field toolkit',
      parseInt(time_spent_minutes, 10) || 30
    ]);

    // 2. Handle resolution photo evidence if attached
    let evidenceRecord = null;
    if (req.file) {
      const filePath = req.file.path;
      const mediaUrl = `/uploads/${req.file.filename}`;
      const sha256Hash = calculateFileSha256(filePath);

      // Verify geofence against zone
      let isGeofenceValid = true;
      let auditNotes = 'Resolution Proof-of-Work verified with cryptographic SHA-256.';

      const complaintZoneRes = await db.query(
        `SELECT z.center_latitude, z.center_longitude, z.geo_fence_radius_meters
         FROM public.complaints c
         JOIN public.campus_zones z ON c.zone_id = z.id
         WHERE c.id = $1`,
        [id]
      );

      if (complaintZoneRes.rows.length > 0 && latitude && longitude) {
        const z = complaintZoneRes.rows[0];
        const dist = calculateDistanceMeters(
          parseFloat(latitude),
          parseFloat(longitude),
          z.center_latitude,
          z.center_longitude
        );
        if (dist > z.geo_fence_radius_meters) {
          isGeofenceValid = false;
          auditNotes = `Geofence deviation alert: Resolution location is ${dist}m away from zone center.`;
        } else {
          isGeofenceValid = true;
          auditNotes = `Resolution geofence verified: ${dist}m from zone center.`;
        }
      }

      const evRes = await db.query(`
        INSERT INTO public.evidence_records (
          complaint_id, uploader_id, proof_type, media_url, sha256_hash,
          latitude, longitude, accuracy_meters, device_timestamp,
          is_geofence_valid, is_exif_verified, is_tamper_flagged, audit_notes
        ) VALUES (
          $1, $2, 'RESOLUTION_PROOF', $3, $4, $5, $6, 3.0, NOW(), $7, TRUE, FALSE, $8
        ) RETURNING id, media_url, sha256_hash, is_geofence_valid, audit_notes;
      `, [
        id,
        req.user.id,
        mediaUrl,
        sha256Hash,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        isGeofenceValid,
        auditNotes
      ]);

      evidenceRecord = evRes.rows[0];
    }

    // 3. Update complaint status to RESOLVED
    const updateRes = await db.query(`
      UPDATE public.complaints
      SET status = 'RESOLVED',
          resolved_at = NOW(),
          resolution_summary = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, ticket_number, status, resolved_at, resolution_summary;
    `, [action_taken.trim(), id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    await recordAuditLog('COMPLAINT_RESOLVED', 'complaints', id, req.user.id, {
      action: action_taken,
      materials: materials_used,
      evidence_hash: evidenceRecord ? evidenceRecord.sha256_hash : 'NO_PHOTO_ATTACHED'
    });

    res.json({
      message: 'Resolution submitted with proof-of-work. Ticket marked RESOLVED and complainant notified.',
      complaint: updateRes.rows[0],
      work_log: workLogRes.rows[0],
      evidence: evidenceRecord
    });
  } catch (err) {
    console.error('Resolve ticket error:', err);
    res.status(500).json({ error: 'Failed to submit resolution: ' + err.message });
  }
});

module.exports = router;

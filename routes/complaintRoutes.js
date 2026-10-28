const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, calculateFileSha256, calculateDistanceMeters } = require('../middleware/upload');
const { calculateSlaDeadline, getSlaStatus, updateEscalations } = require('../services/slaService');
const { findDuplicateSuggestions } = require('../services/duplicateService');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/complaints/check-duplicates
 * Returns duplicate suggestions based on location, department, asset, and keywords
 */
router.get('/check-duplicates', async (req, res) => {
  try {
    const { zone_id, department_id, asset_id, title, description } = req.query;
    if (!zone_id && !department_id && !asset_id) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await findDuplicateSuggestions({
      zone_id,
      department_id,
      asset_id,
      title,
      description
    });

    res.json({ suggestions });
  } catch (err) {
    console.error('Check duplicates error:', err);
    res.status(500).json({ error: 'Failed to evaluate duplicate suggestions' });
  }
});

/**
 * GET /api/complaints
 * Comprehensive search, filter, and pagination
 */
router.get('/', async (req, res) => {
  try {
    // Run SLA auto-escalation check
    await updateEscalations();

    const {
      search,
      status,
      priority,
      department_id,
      zone_id,
      is_escalated,
      my_tickets,
      sort = 'newest',
      page = 1,
      limit = 20
    } = req.query;

    let query = `
      SELECT 
        c.id, c.ticket_number, c.title, c.description, c.priority, c.status,
        c.sla_deadline, c.resolved_at, c.rating, c.feedback_notes,
        c.is_escalated, c.escalation_level, c.upvotes_count, c.resolution_summary,
        c.created_at, c.updated_at,
        z.id as zone_id, z.name as zone_name, z.zone_code,
        d.id as department_id, d.name as department_name, d.code as department_code,
        a.id as asset_id, a.asset_tag, a.name as asset_name, a.location_details,
        u.id as complainant_id, u.full_name as complainant_name, u.role as complainant_role,
        t.id as technician_id, t.full_name as technician_name
      FROM public.complaints c
      JOIN public.campus_zones z ON c.zone_id = z.id
      JOIN public.departments d ON c.department_id = d.id
      LEFT JOIN public.campus_assets a ON c.asset_id = a.id
      JOIN public.user_profiles u ON c.complainant_id = u.id
      LEFT JOIN public.user_profiles t ON c.assigned_technician_id = t.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by search query (ticket number, title, description, asset tag)
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(c.ticket_number) LIKE $${params.length} OR
        LOWER(c.title) LIKE $${params.length} OR
        LOWER(c.description) LIKE $${params.length} OR
        LOWER(COALESCE(a.asset_tag, '')) LIKE $${params.length} OR
        LOWER(z.name) LIKE $${params.length}
      )`;
    }

    // Filter by status
    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND c.status = $${params.length}::ticket_status`;
    }

    // Filter by priority
    if (priority && priority !== 'ALL') {
      params.push(priority);
      query += ` AND c.priority = $${params.length}::ticket_priority`;
    }

    // Filter by department
    if (department_id && department_id !== 'ALL') {
      params.push(department_id);
      query += ` AND c.department_id = $${params.length}`;
    }

    // Filter by zone
    if (zone_id && zone_id !== 'ALL') {
      params.push(zone_id);
      query += ` AND c.zone_id = $${params.length}`;
    }

    // Filter by escalated
    if (is_escalated === 'true' || is_escalated === true) {
      query += ` AND (c.is_escalated = TRUE OR c.escalation_level = 'ESCALATED')`;
    }

    // Filter by my tickets if user requested
    if (my_tickets === 'true' && req.user) {
      if (req.user.role === 'technician') {
        params.push(req.user.id);
        query += ` AND c.assigned_technician_id = $${params.length}`;
      } else {
        params.push(req.user.id);
        query += ` AND c.complainant_id = $${params.length}`;
      }
    }

    // Sort order
    if (sort === 'oldest') {
      query += ` ORDER BY c.created_at ASC`;
    } else if (sort === 'sla_urgency') {
      query += ` ORDER BY 
        CASE 
          WHEN c.status IN ('RESOLVED', 'CLOSED') THEN 4
          WHEN c.is_escalated = TRUE THEN 1
          WHEN c.escalation_level = 'WARNING' THEN 2
          ELSE 3
        END, c.sla_deadline ASC NULLS LAST`;
    } else if (sort === 'priority') {
      query += ` ORDER BY 
        CASE c.priority
          WHEN 'P1_CRITICAL' THEN 1
          WHEN 'P2_HIGH' THEN 2
          WHEN 'P3_MEDIUM' THEN 3
          WHEN 'P4_ROUTINE' THEN 4
        END, c.created_at DESC`;
    } else if (sort === 'upvotes') {
      query += ` ORDER BY c.upvotes_count DESC, c.created_at DESC`;
    } else {
      // Default: newest
      query += ` ORDER BY c.created_at DESC`;
    }

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum);
    const limitParamIndex = params.length;
    params.push(offset);
    const offsetParamIndex = params.length;

    const pagedQuery = `${query} LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;

    const resQuery = await db.query(pagedQuery, params);

    // Compute live SLA indicator for each item
    const complaints = resQuery.rows.map(item => {
      const isResolved = ['RESOLVED', 'CLOSED'].includes(item.status);
      const slaInfo = getSlaStatus(item.sla_deadline, isResolved);
      return {
        ...item,
        sla_info: slaInfo
      };
    });

    res.json({
      page: pageNum,
      limit: limitNum,
      count: complaints.length,
      complaints
    });
  } catch (err) {
    console.error('Fetch complaints error:', err);
    res.status(500).json({ error: 'Failed to fetch complaints list' });
  }
});

/**
 * GET /api/complaints/:id
 * Single ticket detail with complete evidence, work logs, disputes & timeline
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const mainRes = await db.query(`
      SELECT 
        c.id, c.ticket_number, c.title, c.description, c.priority, c.status,
        c.sla_deadline, c.resolved_at, c.rating, c.feedback_notes,
        c.is_escalated, c.escalation_level, c.upvotes_count, c.resolution_summary,
        c.created_at, c.updated_at,
        z.id as zone_id, z.name as zone_name, z.zone_code, z.center_latitude, z.center_longitude, z.geo_fence_radius_meters,
        d.id as department_id, d.name as department_name, d.code as department_code,
        a.id as asset_id, a.asset_tag, a.name as asset_name, a.location_details,
        u.id as complainant_id, u.full_name as complainant_name, u.email as complainant_email, u.role as complainant_role,
        t.id as technician_id, t.full_name as technician_name, t.phone_number as technician_phone
      FROM public.complaints c
      JOIN public.campus_zones z ON c.zone_id = z.id
      JOIN public.departments d ON c.department_id = d.id
      LEFT JOIN public.campus_assets a ON c.asset_id = a.id
      JOIN public.user_profiles u ON c.complainant_id = u.id
      LEFT JOIN public.user_profiles t ON c.assigned_technician_id = t.id
      WHERE c.id::text = $1 OR c.ticket_number = $1
    `, [id]);

    if (mainRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    const complaint = mainRes.rows[0];

    // Evidence records
    const evidenceRes = await db.query(`
      SELECT e.id, e.proof_type, e.media_url, e.sha256_hash, e.perceptual_hash,
             e.latitude, e.longitude, e.accuracy_meters, e.device_timestamp, e.server_timestamp,
             e.is_geofence_valid, e.is_exif_verified, e.is_tamper_flagged, e.audit_notes,
             u.full_name as uploader_name, u.role as uploader_role
      FROM public.evidence_records e
      JOIN public.user_profiles u ON e.uploader_id = u.id
      WHERE e.complaint_id = $1
      ORDER BY e.created_at ASC
    `, [complaint.id]);

    // Work logs
    const workLogsRes = await db.query(`
      SELECT w.id, w.action_taken, w.materials_used, w.time_spent_minutes, w.created_at,
             u.full_name as technician_name
      FROM public.technician_work_logs w
      JOIN public.user_profiles u ON w.technician_id = u.id
      WHERE w.complaint_id = $1
      ORDER BY w.created_at ASC
    `, [complaint.id]);

    // Disputes
    const disputesRes = await db.query(`
      SELECT d.id, d.reason, d.status, d.resolution_notes, d.created_at, d.resolved_at,
             u.full_name as disputed_by_name
      FROM public.complaint_disputes d
      JOIN public.user_profiles u ON d.disputed_by = u.id
      WHERE d.complaint_id = $1
      ORDER BY d.created_at DESC
    `, [complaint.id]);

    // Audit logs
    const auditRes = await db.query(`
      SELECT a.id, a.event_type, a.entity_name, a.payload, a.created_at,
             u.full_name as actor_name
      FROM public.audit_logs a
      LEFT JOIN public.user_profiles u ON a.actor_id = u.id
      WHERE a.entity_id = $1
      ORDER BY a.created_at ASC
    `, [complaint.id]);

    const isResolved = ['RESOLVED', 'CLOSED'].includes(complaint.status);
    complaint.sla_info = getSlaStatus(complaint.sla_deadline, isResolved);
    complaint.evidence = evidenceRes.rows;
    complaint.work_logs = workLogsRes.rows;
    complaint.disputes = disputesRes.rows;
    complaint.audit_trail = auditRes.rows;

    res.json({ complaint });
  } catch (err) {
    console.error('Fetch complaint detail error:', err);
    res.status(500).json({ error: 'Failed to fetch complaint details' });
  }
});

/**
 * POST /api/complaints
 * Complaint Intake with automated SLA calculation, ticket numbering, and photo evidence
 */
router.post('/', requireAuth, upload.single('evidence_file'), async (req, res) => {
  try {
    const {
      title,
      description,
      priority = 'P3_MEDIUM',
      zone_id,
      department_id,
      asset_id,
      latitude,
      longitude
    } = req.body;

    if (!title || !description || !zone_id || !department_id) {
      return res.status(400).json({ error: 'Title, description, campus zone, and department are mandatory' });
    }

    // Determine SLA deadline based on priority
    const slaDeadline = calculateSlaDeadline(priority);

    // Insert complaint
    const insertComplaintRes = await db.query(`
      INSERT INTO public.complaints (
        complainant_id, asset_id, zone_id, department_id,
        title, description, priority, status, sla_deadline
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::ticket_priority, 'SUBMITTED', $8
      ) RETURNING id, ticket_number, title, status, priority, sla_deadline, created_at;
    `, [
      req.user.id,
      asset_id || null,
      zone_id,
      department_id,
      title.trim(),
      description.trim(),
      priority,
      slaDeadline
    ]);

    const newComplaint = insertComplaintRes.rows[0];

    // If an evidence photo was uploaded
    if (req.file) {
      const filePath = req.file.path;
      const mediaUrl = `/uploads/${req.file.filename}`;
      const sha256Hash = calculateFileSha256(filePath);

      // Check geofence if coordinates are provided
      let isGeofenceValid = true;
      let auditNotes = 'Evidence photo verified with cryptographic SHA-256.';

      if (latitude && longitude) {
        const zoneRes = await db.query(
          `SELECT center_latitude, center_longitude, geo_fence_radius_meters FROM public.campus_zones WHERE id = $1`,
          [zone_id]
        );
        if (zoneRes.rows.length > 0) {
          const z = zoneRes.rows[0];
          const dist = calculateDistanceMeters(
            parseFloat(latitude),
            parseFloat(longitude),
            z.center_latitude,
            z.center_longitude
          );
          if (dist > z.geo_fence_radius_meters) {
            isGeofenceValid = false;
            auditNotes = `Warning: Upload location is ${dist}m away from zone center (allowed radius: ${z.geo_fence_radius_meters}m).`;
          } else {
            isGeofenceValid = true;
            auditNotes = `Geo-fence match verified (${dist}m from zone center).`;
          }
        }
      }

      await db.query(`
        INSERT INTO public.evidence_records (
          complaint_id, uploader_id, proof_type, media_url, sha256_hash,
          latitude, longitude, accuracy_meters, device_timestamp,
          is_geofence_valid, is_exif_verified, is_tamper_flagged, audit_notes
        ) VALUES (
          $1, $2, 'INCIDENT_PROOF', $3, $4, $5, $6, 5.0, NOW(), $7, TRUE, FALSE, $8
        );
      `, [
        newComplaint.id,
        req.user.id,
        mediaUrl,
        sha256Hash,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        isGeofenceValid,
        auditNotes
      ]);
    }

    // Record creation in audit log
    await recordAuditLog('COMPLAINT_CREATED', 'complaints', newComplaint.id, req.user.id, {
      ticket_number: newComplaint.ticket_number,
      title: newComplaint.title,
      priority: newComplaint.priority
    });

    res.status(201).json({
      message: 'Complaint submitted successfully and entered verification queue',
      complaint: newComplaint
    });
  } catch (err) {
    console.error('Complaint submission error:', err);
    res.status(500).json({ error: 'Failed to submit complaint: ' + err.message });
  }
});

/**
 * POST /api/complaints/:id/endorse
 * Upvotes an existing ticket to confirm duplicate/widespread issue
 */
router.post('/:id/endorse', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user already endorsed
    const existing = await db.query(
      `SELECT id FROM public.complaint_endorsements WHERE complaint_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already endorsed this complaint' });
    }

    await db.query(
      `INSERT INTO public.complaint_endorsements (complaint_id, user_id) VALUES ($1, $2)`,
      [id, req.user.id]
    );

    const updateRes = await db.query(
      `UPDATE public.complaints
       SET upvotes_count = upvotes_count + 1
       WHERE id = $1
       RETURNING id, ticket_number, upvotes_count`,
      [id]
    );

    await recordAuditLog('COMPLAINT_ENDORSED', 'complaints', id, req.user.id, {
      upvotes: updateRes.rows[0].upvotes_count
    });

    res.json({
      message: 'Endorsement recorded! Thank you for helping identify common issues.',
      upvotes_count: updateRes.rows[0].upvotes_count
    });
  } catch (err) {
    console.error('Endorse error:', err);
    res.status(500).json({ error: 'Failed to endorse complaint' });
  }
});

/**
 * PATCH /api/complaints/:id/assign
 * Assign technician or adjust priority/SLA (Department Head / Admin)
 */
router.patch('/:id/assign', requireRole(['department_head', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { technician_id, priority, sla_hours } = req.body;

    let query = `UPDATE public.complaints SET updated_at = NOW()`;
    const params = [];

    if (technician_id) {
      params.push(technician_id);
      query += `, assigned_technician_id = $${params.length}, status = 'ASSIGNED'`;
    }

    if (priority) {
      params.push(priority);
      query += `, priority = $${params.length}::ticket_priority`;
    }

    if (sla_hours) {
      const newDeadline = new Date(Date.now() + parseInt(sla_hours, 10) * 3600 * 1000);
      params.push(newDeadline);
      query += `, sla_deadline = $${params.length}`;
    }

    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING id, ticket_number, status, priority, assigned_technician_id, sla_deadline`;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const updated = result.rows[0];

    await recordAuditLog('COMPLAINT_ASSIGNED', 'complaints', id, req.user.id, {
      technician_id,
      priority,
      status: updated.status
    });

    res.json({
      message: 'Ticket updated and technician assigned successfully',
      complaint: updated
    });
  } catch (err) {
    console.error('Assign ticket error:', err);
    res.status(500).json({ error: 'Failed to assign technician: ' + err.message });
  }
});

/**
 * POST /api/complaints/:id/feedback
 * Submit rating (1-5) and feedback notes -> Transitions ticket to CLOSED
 */
router.post('/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback_notes } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }

    const result = await db.query(`
      UPDATE public.complaints
      SET rating = $1,
          feedback_notes = $2,
          status = 'CLOSED',
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, ticket_number, status, rating, feedback_notes
    `, [parseInt(rating, 10), feedback_notes || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    await recordAuditLog('FEEDBACK_SUBMITTED', 'complaints', id, req.user.id, {
      rating: parseInt(rating, 10),
      notes: feedback_notes
    });

    res.json({
      message: 'Feedback submitted and complaint officially closed. Thank you!',
      complaint: result.rows[0]
    });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Failed to record feedback: ' + err.message });
  }
});

module.exports = router;

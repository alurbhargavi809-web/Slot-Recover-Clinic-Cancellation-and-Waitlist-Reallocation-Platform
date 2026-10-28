const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * GET /api/disputes
 * List disputes for auditor / department head review
 */
router.get('/', requireRole(['department_head', 'admin']), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        d.id, d.reason, d.status, d.resolution_notes, d.created_at, d.resolved_at,
        c.id as complaint_id, c.ticket_number, c.title as complaint_title, c.priority,
        u.full_name as disputed_by_name, u.email as disputed_by_email,
        dept.name as department_name, z.name as zone_name
      FROM public.complaint_disputes d
      JOIN public.complaints c ON d.complaint_id = c.id
      JOIN public.user_profiles u ON d.disputed_by = u.id
      JOIN public.departments dept ON c.department_id = dept.id
      JOIN public.campus_zones z ON c.zone_id = z.id
      ORDER BY 
        CASE d.status
          WHEN 'OPEN' THEN 1
          WHEN 'UNDER_REVIEW' THEN 2
          ELSE 3
        END, d.created_at DESC;
    `);

    res.json({ count: result.rows.length, disputes: result.rows });
  } catch (err) {
    console.error('Fetch disputes error:', err);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

/**
 * POST /api/complaints/:id/dispute
 * Complainant files dispute / appeal if issue remains unresolved
 */
router.post('/complaints/:id/dispute', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'A specific explanation of why the resolution was inadequate (min 10 characters) is required' });
    }

    // Verify ticket exists
    const compRes = await db.query(`SELECT id, ticket_number, status FROM public.complaints WHERE id = $1`, [id]);
    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint ticket not found' });
    }

    // Insert dispute record
    const disputeRes = await db.query(`
      INSERT INTO public.complaint_disputes (complaint_id, disputed_by, reason, status)
      VALUES ($1, $2, $3, 'UNDER_REVIEW')
      RETURNING id, complaint_id, reason, status, created_at;
    `, [id, req.user.id, reason.trim()]);

    // Update complaint status to DISPUTED and flag as escalated
    await db.query(`
      UPDATE public.complaints
      SET status = 'DISPUTED',
          is_escalated = TRUE,
          escalation_level = 'ESCALATED',
          updated_at = NOW()
      WHERE id = $1;
    `, [id]);

    await recordAuditLog('DISPUTE_FILED', 'complaint_disputes', disputeRes.rows[0].id, req.user.id, {
      complaint_id: id,
      reason: reason.trim()
    });

    res.status(201).json({
      message: 'Dispute submitted. Ticket re-opened as DISPUTED and prioritized for Department Head review.',
      dispute: disputeRes.rows[0]
    });
  } catch (err) {
    console.error('File dispute error:', err);
    res.status(500).json({ error: 'Failed to submit dispute: ' + err.message });
  }
});

/**
 * PATCH /api/disputes/:id/review
 * Department Head / Admin accepts or rejects dispute
 */
router.patch('/:id/review', requireRole(['department_head', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, resolution_notes } = req.body; // decision: 'ACCEPTED' or 'REJECTED'

    if (!['ACCEPTED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: "Decision must be either 'ACCEPTED' or 'REJECTED'" });
    }

    const dispRes = await db.query(
      `SELECT d.id, d.complaint_id, d.status FROM public.complaint_disputes d WHERE d.id = $1`,
      [id]
    );

    if (dispRes.rows.length === 0) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const dispute = dispRes.rows[0];

    // Update dispute record
    await db.query(`
      UPDATE public.complaint_disputes
      SET status = $1,
          resolution_notes = $2,
          resolved_at = NOW()
      WHERE id = $3;
    `, [decision, resolution_notes || null, id]);

    // Update complaint based on decision
    if (decision === 'ACCEPTED') {
      // Re-open ticket for technician rework
      await db.query(`
        UPDATE public.complaints
        SET status = 'IN_PROGRESS',
            updated_at = NOW()
        WHERE id = $1;
      `, [dispute.complaint_id]);
    } else {
      // Confirmed resolved
      await db.query(`
        UPDATE public.complaints
        SET status = 'RESOLVED',
            is_escalated = FALSE,
            escalation_level = 'NORMAL',
            updated_at = NOW()
        WHERE id = $1;
      `, [dispute.complaint_id]);
    }

    await recordAuditLog('DISPUTE_REVIEWED', 'complaint_disputes', id, req.user.id, {
      decision,
      notes: resolution_notes
    });

    res.json({
      message: `Dispute review finalized. Outcome: ${decision}.`,
      decision,
      complaint_id: dispute.complaint_id
    });
  } catch (err) {
    console.error('Review dispute error:', err);
    res.status(500).json({ error: 'Failed to review dispute: ' + err.message });
  }
});

module.exports = router;

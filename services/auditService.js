const db = require('../config/db');

/**
 * Inserts an immutable audit event into the audit_logs table.
 */
async function recordAuditLog(eventType, entityName, entityId, actorId, payload = {}) {
  try {
    await db.query(
      `INSERT INTO public.audit_logs (event_type, entity_name, entity_id, actor_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventType, entityName, entityId, actorId || null, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR] Failed to record audit entry:', err.message);
  }
}

module.exports = {
  recordAuditLog
};

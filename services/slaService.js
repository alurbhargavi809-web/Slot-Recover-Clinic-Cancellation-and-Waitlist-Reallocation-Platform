const db = require('../config/db');

// Standard SLA thresholds in hours
const SLA_HOURS = {
  P1_CRITICAL: 2,   // Emergency / Safety hazard / Campus-wide
  P2_HIGH: 8,       // Classroom / Lab / Infrastructure blocker
  P3_MEDIUM: 24,    // Standard lighting / furniture / AC routine
  P4_ROUTINE: 72    // Preventive / Aesthetic maintenance
};

/**
 * Calculates the SLA deadline for a ticket given its priority.
 */
function calculateSlaDeadline(priority, baseDate = new Date()) {
  const hours = SLA_HOURS[priority] || 24;
  const deadline = new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
  return deadline;
}

/**
 * Evaluates remaining time and sets escalation status.
 */
function getSlaStatus(slaDeadline, isResolved = false) {
  if (!slaDeadline) return { level: 'NORMAL', isOverdue: false, remainingMs: null, label: 'No SLA' };
  
  const now = new Date();
  const deadline = new Date(slaDeadline);
  const diffMs = deadline.getTime() - now.getTime();

  if (isResolved) {
    return { level: 'NORMAL', isOverdue: false, remainingMs: 0, label: 'Completed' };
  }

  if (diffMs < 0) {
    const overdueHours = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
    const overdueMins = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    return {
      level: 'ESCALATED',
      isOverdue: true,
      remainingMs: diffMs,
      label: `Breached by ${overdueHours}h ${overdueMins}m`
    };
  }

  const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
  const minsRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  // Warning when less than 2 hours or < 25% of time left
  if (hoursRemaining <= 2) {
    return {
      level: 'WARNING',
      isOverdue: false,
      remainingMs: diffMs,
      label: `${hoursRemaining}h ${minsRemaining}m left (Urgent)`
    };
  }

  return {
    level: 'NORMAL',
    isOverdue: false,
    remainingMs: diffMs,
    label: `${hoursRemaining}h ${minsRemaining}m left`
  };
}

/**
 * Scans open tickets and updates is_escalated and escalation_level in the database.
 */
async function updateEscalations() {
  try {
    const now = new Date().toISOString();
    
    // Mark overdue as ESCALATED
    await db.query(`
      UPDATE public.complaints
      SET is_escalated = TRUE,
          escalation_level = 'ESCALATED',
          updated_at = NOW()
      WHERE status NOT IN ('RESOLVED', 'CLOSED')
        AND sla_deadline IS NOT NULL
        AND sla_deadline < $1
        AND escalation_level != 'ESCALATED'
    `, [now]);

    // Mark nearing deadline as WARNING (within 2 hours)
    await db.query(`
      UPDATE public.complaints
      SET escalation_level = 'WARNING',
          updated_at = NOW()
      WHERE status NOT IN ('RESOLVED', 'CLOSED')
        AND sla_deadline IS NOT NULL
        AND sla_deadline >= $1
        AND sla_deadline <= ($1::timestamptz + interval '2 hours')
        AND escalation_level = 'NORMAL'
    `, [now]);
  } catch (err) {
    console.error('[SLA ESCALATION ERROR] Failed to run escalation sweep:', err.message);
  }
}

module.exports = {
  SLA_HOURS,
  calculateSlaDeadline,
  getSlaStatus,
  updateEscalations
};

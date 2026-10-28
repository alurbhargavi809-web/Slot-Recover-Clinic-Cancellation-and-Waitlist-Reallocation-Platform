const db = require('../config/db');

/**
 * Tokenizes text into lowercase normalized keywords, removing short words/stop-words.
 */
function extractKeywords(text) {
  if (!text) return new Set();
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
    'with', 'not', 'this', 'that', 'there', 'from', 'by', 'room', 'block', 'floor',
    'please', 'very', 'due', 'has', 'have', 'been', 'getting', 'having'
  ]);
  
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

/**
 * Calculates Jaccard similarity between two keyword sets.
 */
function calculateSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function isUUID(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Finds duplicate complaints matching criteria.
 */
async function findDuplicateSuggestions({ zone_id, department_id, asset_id, title = '', description = '', exclude_id = null }) {
  try {
    const validZone = isUUID(zone_id) ? zone_id : null;
    const validDept = isUUID(department_id) ? department_id : null;
    const validAsset = isUUID(asset_id) ? asset_id : null;

    // Only search among active tickets
    let query = `
      SELECT 
        c.id, c.ticket_number, c.title, c.description, c.priority, c.status,
        c.created_at, c.upvotes_count, c.sla_deadline,
        z.name as zone_name,
        d.name as department_name,
        a.asset_tag, a.name as asset_name,
        u.full_name as complainant_name
      FROM public.complaints c
      JOIN public.campus_zones z ON c.zone_id = z.id
      JOIN public.departments d ON c.department_id = d.id
      LEFT JOIN public.campus_assets a ON c.asset_id = a.id
      JOIN public.user_profiles u ON c.complainant_id = u.id
      WHERE c.status NOT IN ('RESOLVED', 'CLOSED')
    `;
    const params = [];

    if (exclude_id && isUUID(exclude_id)) {
      params.push(exclude_id);
      query += ` AND c.id != $${params.length}`;
    }

    if (validAsset) {
      // Prioritize same asset
      params.push(validAsset);
      query += ` AND (c.asset_id = $${params.length}`;
      if (validZone && validDept) {
        params.push(validZone);
        params.push(validDept);
        query += ` OR (c.zone_id = $${params.length - 1} AND c.department_id = $${params.length}))`;
      } else {
        query += `)`;
      }
    } else if (validZone && validDept) {
      params.push(validZone);
      params.push(validDept);
      query += ` AND c.zone_id = $${params.length - 1} AND c.department_id = $${params.length}`;
    } else if (validZone) {
      params.push(validZone);
      query += ` AND c.zone_id = $${params.length}`;
    }

    query += ` ORDER BY c.created_at DESC LIMIT 20;`;

    const res = await db.query(query, params);
    const candidateRows = res.rows;

    const inputKeywords = extractKeywords(`${title} ${description}`);
    const suggestions = [];

    for (const row of candidateRows) {
      let score = 0;
      const reasons = [];

      // 1. Same asset check (strongest indicator)
      if (asset_id && row.asset_id === asset_id) {
        score += 65;
        reasons.push('Identical physical equipment/asset tag');
      }

      // 2. Same zone and department
      if (row.zone_id === zone_id && row.department_id === department_id) {
        score += 25;
        reasons.push('Same building zone and maintenance department');
      }

      // 3. Keyword / text similarity
      const candidateKeywords = extractKeywords(`${row.title} ${row.description}`);
      const textSim = calculateSimilarity(inputKeywords, candidateKeywords);
      const textBoost = Math.round(textSim * 40);
      score += textBoost;

      if (textSim > 0.15) {
        reasons.push(`Similar symptom keywords (${Math.round(textSim * 100)}% match)`);
      }

      // Normalise score max 98%
      const finalConfidence = Math.min(Math.max(score, 20), 98);

      // If either same asset or confidence >= 35%, include in suggestions
      if ((asset_id && row.asset_id === asset_id) || finalConfidence >= 35) {
        suggestions.push({
          id: row.id,
          ticket_number: row.ticket_number,
          title: row.title,
          description: row.description,
          priority: row.priority,
          status: row.status,
          zone_name: row.zone_name,
          department_name: row.department_name,
          asset_tag: row.asset_tag,
          asset_name: row.asset_name,
          complainant_name: row.complainant_name,
          created_at: row.created_at,
          upvotes_count: row.upvotes_count,
          confidence_score: finalConfidence,
          match_reasons: reasons
        });
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence_score - a.confidence_score);

    return suggestions;
  } catch (err) {
    console.error('[DUPLICATE CHECK ERROR]:', err.message);
    return [];
  }
}

module.exports = {
  findDuplicateSuggestions,
  extractKeywords
};

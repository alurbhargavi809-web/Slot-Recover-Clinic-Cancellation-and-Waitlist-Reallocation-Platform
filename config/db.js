const { Pool } = require('pg');
require('dotenv').config();

// Supabase PostgreSQL Pooler configuration
let connectionString = process.env.DATABASE_URL || '';
// Strip sslmode from query string so pg uses the ssl options object below
connectionString = connectionString.replace(/([?&])sslmode=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Supabase pooler connection without custom CA
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

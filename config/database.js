const { Pool } = require('pg');
require('dotenv').config();

let pool;

async function initPostgres() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('POSTGRES_URL not set');
  pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
  // Test connection
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    await pool.end();
    pool = undefined;
    throw err;
  }
  console.log('PostgreSQL connected');
}

function getPool() {
  if (!pool) throw new Error('PostgreSQL not initialized');
  return pool;
}

module.exports = { initPostgres, getPool };

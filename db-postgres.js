/**
 * OAV Mantra - PostgreSQL Connection Adapter
 * Supports Connection Pooling, SSL for Cloud DBs (Neon, Supabase, Render, AWS),
 * and parameterized query helpers.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

const connectionString = process.env.DATABASE_URL || '';

const poolConfig = connectionString ? {
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
} : {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'oav_mantra',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL client error:', err.message);
});

async function query(text, params = []) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production' && duration > 200) {
        console.warn(`⚠️ Slow query (${duration}ms): ${text.slice(0, 100)}`);
    }
    return res;
}

async function testConnection() {
    try {
        const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name');
        console.log(`✅ Connected to PostgreSQL database "${res.rows[0].db_name}" at ${res.rows[0].current_time}`);
        return true;
    } catch (err) {
        console.error('❌ PostgreSQL connection failed:', err.message);
        return false;
    }
}

module.exports = {
    pool,
    query,
    testConnection
};

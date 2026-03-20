/**
 * PostgreSQL adapter with SQLite-compatible API.
 * Converts ? placeholders to $1, $2, etc. and provides prepare().get(), .all(), .run()
 */
const { Pool } = require('pg');

function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function toPgSql(sql) {
  let s = sql
    .replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'NOW()')
    .replace(/datetime\s*\(\s*['"]now['"]\s*,\s*\?\)/gi, 'NOW() + ?::interval');
  const insertIgnore = s.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (insertIgnore) {
    const [, table, cols] = insertIgnore;
    const pk = cols.split(',')[0].trim();
    s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO') +
      ` ON CONFLICT (${pk}) DO NOTHING`;
  }
  return s;
}

function createDb(pool) {
  return {
    prepare(sql) {
      const pgSql = toPgParams(toPgSql(sql));
      return {
        async get(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows[0];
        },
        async all(...params) {
          const r = await pool.query(pgSql, params);
          return r.rows;
        },
        async run(...params) {
          const r = await pool.query(pgSql, params);
          return { changes: r.rowCount ?? 0 };
        },
      };
    },
    async query(sql, params = []) {
      const pgSql = toPgParams(sql);
      return pool.query(pgSql, params);
    },
  };
}

async function initPg(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  const db = createDb(pool);
  return { pool, db };
}

module.exports = { createDb, initPg, toPgParams };

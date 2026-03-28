const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;
let pool = null;
let ensureSchemaFn = null;
let readyPromise = null;

if (config.databaseUrl) {
  const { initPg } = require('./pg');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema-pg.sql'), 'utf8');

  async function runSchemaPg() {
    const client = await pool.connect();
    try {
      await client.query(schemaSql);
    } finally {
      client.release();
    }
  }

  readyPromise = initPg(config).then(async ({ pool: p, db: d }) => {
    pool = p;
    db = d;
    const { rows } = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'");
    if (!rows.length) {
      await runSchemaPg();
    } else {
      const { rows: cols } = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('position', 'user_position')"
      );
      const hasPosition = cols.some(r => r.column_name === 'position');
      const hasUserPosition = cols.some(r => r.column_name === 'user_position');
      if (hasPosition && !hasUserPosition) {
        await pool.query('ALTER TABLE users RENAME COLUMN position TO user_position');
      } else if (!hasUserPosition) {
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS user_position TEXT');
      }
      await pool.query('ALTER TABLE sponsor_wallets ADD COLUMN IF NOT EXISTS watermark_image_mime TEXT');
      await pool.query('ALTER TABLE sponsor_wallets ADD COLUMN IF NOT EXISTS watermark_image_updated_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_content_types TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_niche_tags TEXT');
      await pool.query('ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_types TEXT');
      await pool.query('ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS niche_tags TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS user_roles TEXT');
      await pool.query(`
        UPDATE users
        SET user_roles = (json_build_array(user_type))::text
        WHERE user_roles IS NULL OR TRIM(COALESCE(user_roles, '')) = ''
      `).catch(() => {});
      await pool.query(`
        CREATE TABLE IF NOT EXISTS campaign_drafts (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id),
          title TEXT,
          payload TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_campaign_drafts_owner ON campaign_drafts(owner_id)');
    }
    ensureSchemaFn = runSchemaPg;
    return db;
  });
} else {
  const Database = require('better-sqlite3');
  const dbPath = path.isAbsolute(config.databasePath)
    ? config.databasePath
    : path.join(__dirname, '..', config.databasePath);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');

  function wrapSqlite(stmt) {
    return {
      get: (...p) => Promise.resolve(stmt.get(...p)),
      all: (...p) => Promise.resolve(stmt.all(...p)),
      run: (...p) => Promise.resolve(stmt.run(...p)),
    };
  }

  db = {
    prepare(sql) {
      return wrapSqlite(sqlite.prepare(sql));
    },
  };

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const migrations = require('./migrations');

  function ensureSchemaSqlite() {
    const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!table) sqlite.exec(schema);
    else migrations.run(sqlite);
  }

  ensureSchemaFn = () => Promise.resolve(ensureSchemaSqlite());
  readyPromise = Promise.resolve(ensureSchemaFn()).then(() => db);
}

async function ensureSchema() {
  await readyPromise;
  if (ensureSchemaFn) await ensureSchemaFn();
}

const dbProxy = new Proxy({}, {
  get(_, prop) {
    if (!db) throw new Error('Database not initialized - ensure ensureSchema() has completed');
    return db[prop];
  },
});
module.exports = { db: dbProxy, ensureSchema, ready: readyPromise };

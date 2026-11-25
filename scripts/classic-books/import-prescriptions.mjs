import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';

const table = 't_prescriptions';
const lockName = 'qingnang.t_prescriptions.classic-import';
const fields = [
  'id', 'name', 'modern_dose', 'decoction', 'indications', 'explanation',
  'cited', 'tags', 'abbreviation', 'item_order',
];
const requiredText = ['name', 'explanation', 'cited', 'tags', 'abbreviation', 'item_order'];
const datasetUrl = new URL('../../database/classic-prescriptions.json', import.meta.url);

function digest(rows) {
  const values = rows.map(row => fields.map(key => row[key]));
  return createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');
}

function validate(rows) {
  if (rows.length !== 2000 || new Set(rows.map(row => row.name)).size !== rows.length) {
    throw new Error('Expected 2,000 unique prescription names');
  }
  for (const [index, row] of rows.entries()) {
    if (row.id !== index + 1 || !requiredText.every(key => typeof row[key] === 'string' && row[key])) {
      throw new Error(`Invalid record at index ${index}`);
    }
    if (!row.explanation.startsWith('原方组成（古籍原单位）\n') || !row.source?.url) {
      throw new Error(`Missing original composition or source at ID ${row.id}`);
    }
    for (const field of fields.slice(1)) {
      if (row[field] !== null && typeof row[field] !== 'string') {
        throw new Error(`Invalid ${field} at ID ${row.id}`);
      }
    }
  }
}

async function connect(env) {
  const host = env.PRESCRIPTIONS_DB_HOST;
  const port = Number(env.PRESCRIPTIONS_DB_PORT || 3306);
  const user = env.PRESCRIPTIONS_DB_USER;
  const password = env.PRESCRIPTIONS_DB_PASSWORD;
  if (!host || !user || password === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Set PRESCRIPTIONS_DB_HOST, PRESCRIPTIONS_DB_USER, PRESCRIPTIONS_DB_PASSWORD and a valid port');
  }
  const ca = env.PRESCRIPTIONS_DB_SSL_CA
    ? await fs.readFile(env.PRESCRIPTIONS_DB_SSL_CA, 'utf8')
    : undefined;
  const ssl = ca
    ? { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2' }
    : { rejectUnauthorized: false, minVersion: 'TLSv1.2' };
  return mysql.createConnection({
    host, port, user, password, ssl, database: 'qingnang',
    charset: 'utf8mb4', connectTimeout: 10000,
  });
}

async function verifyTarget(connection) {
  const [[identity]] = await connection.query('SELECT DATABASE() AS database_name, @@sql_mode AS sql_mode');
  const [[engine]] = await connection.execute(
    'SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  const [[cipher]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const strict = /\bSTRICT_(ALL|TRANS)_TABLES\b/.test(identity.sql_mode);
  if (identity.database_name !== 'qingnang' || engine?.engine !== 'InnoDB' || !cipher?.Value || !strict) {
    throw new Error('Expected the qingnang InnoDB table, TLS and strict SQL mode');
  }
}

async function readRows(connection, lock = false) {
  const [rows] = await connection.query(
    `SELECT ${fields.join(', ')} FROM ${table} ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
  );
  return rows;
}

async function getSummary(connection, expectedDigest, lock = false) {
  const rows = await readRows(connection, lock);
  const [[summary]] = await connection.query(
    `SELECT COUNT(DISTINCT name) AS unique_names, COUNT(DISTINCT cited) AS sources
     FROM ${table}`,
  );
  const actualDigest = digest(rows);
  if (rows.length !== 2000 || summary.unique_names !== 2000 || actualDigest !== expectedDigest) {
    throw new Error(`Read-back verification failed (${rows.length} rows, ${summary.unique_names} unique names)`);
  }
  return { rows: rows.length, ...summary, sha256: actualDigest };
}

async function insertRows(connection, records) {
  const placeholders = '(' + fields.map(() => '?').join(', ') + ')';
  const batchSize = 100;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const [result] = await connection.execute(
      `INSERT INTO ${table} (${fields.join(', ')}) VALUES ${batch.map(() => placeholders).join(', ')}`,
      batch.flatMap(row => fields.map(field => row[field])),
    );
    if (result.affectedRows !== batch.length || result.warningStatus !== 0) {
      throw new Error(`Unexpected database result at ID ${batch[0].id}`);
    }
  }
}

async function importRows(connection, records, expectedDigest, mode) {
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw new Error('Could not acquire the prescription import lock');
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const existing = await readRows(connection, true);
    if (existing.length && (existing.length !== records.length || digest(existing) !== expectedDigest)) {
      throw new Error(`The table contains ${existing.length} records from a different dataset`);
    }
    const inserted = existing.length ? 0 : records.length;
    if (inserted) await insertRows(connection, records);
    const summary = await getSummary(connection, expectedDigest, true);
    if (mode === '--apply') {
      await connection.commit();
      return { committed: true, inserted, ...summary };
    }
    await connection.rollback();
    return { committed: false, rolled_back: inserted, ...summary };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

async function main() {
  const [mode = '--check', ...rest] = process.argv.slice(2);
  if (rest.length || !['--check', '--rollback-test', '--apply', '--verify'].includes(mode)) {
    throw new Error('Use --check, --rollback-test, --apply or --verify');
  }
  const { records } = JSON.parse(await fs.readFile(datasetUrl, 'utf8'));
  validate(records);
  const expectedDigest = digest(records);
  if (mode === '--check') {
    console.log(JSON.stringify({ rows: records.length, sha256: expectedDigest }));
    return;
  }
  const connection = await connect(process.env);
  try {
    await verifyTarget(connection);
    const result = mode === '--verify'
      ? await getSummary(connection, expectedDigest)
      : await importRows(connection, records, expectedDigest, mode);
    console.log(JSON.stringify({ target: 'qingnang.t_prescriptions', mode, ...result }));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  // Driver errors may contain SQL and record contents, so report their code only.
  console.error(error.code ?? error.message);
  process.exitCode = 1;
});

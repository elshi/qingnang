import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { sha256 } from './common.mjs';
import { readQuantity, formatDose } from './build-structured-cases.mjs';
import { buildShanghanlunCases } from './build-shanghanlun-cases.mjs';

const args = process.argv.slice(2);
const batchFlags = ['--structured', '--expansion', '--shanghanlun'];
const expansion = args.includes('--expansion');
const shanghanlun = args.includes('--shanghanlun');
const structured = expansion || shanghanlun || args.includes('--structured');
const datasetUrl = new URL(
  shanghanlun ? '../../database/shanghanlun-cases.json'
    : expansion ? '../../database/classic-cases-expansion.json'
    : structured ? '../../database/structured-classic-cases.json' : '../../database/classic-cases.json',
  import.meta.url,
);
const table = 't_cases';
const lockName = 'qingnang.t_cases.classic-import';
const operator = '古籍整理';
const textLimits = {
  diseases: 200, symptoms: 2000, subject: 10, doctor: 10, dynasty: 10,
  bookname: 30, prescription: 200, summary: 2000, method: 1000, course_days: 50,
  ...(structured ? { treatment: 20, modern_prescription: 6000 } : {}),
};
const contentFields = [...Object.keys(textLimits), 'content'];
const insertFields = [...contentFields, 'kind', 'status', 'op_uname'];
const readFields = [...new Set([
  ...insertFields, 'id', 'origin_symptoms', 'temp_tags', 'gender', 'confidence',
  'edit_time', 'treatment', 'modern_prescription',
])];
const optional = new Set(['prescription', 'method', 'course_days']);

function validateStructuredRow(row, index) {
  const tags = row.symptoms.split('/');
  const medicines = JSON.parse(row.modern_prescription);
  const groups = shanghanlun && Array.isArray(medicines?.[0]) ? medicines : [medicines];
  const minimum = shanghanlun ? 1 : 3;
  if (row.treatment !== '方药' || tags.some(tag => !tag || tag.length > 20)
      || new Set(tags).size !== tags.length || !row.source.paragraphs.includes(row.source.prescription_paragraph)
      || groups.some(group => !Array.isArray(group) || group.length < minimum
        || new Set(group.map(item => item.name)).size !== group.length)) {
    throw new Error(`Invalid structured record at position ${index}`);
  }
  for (const item of groups.flat()) {
    const quantity = typeof item.original_dose === 'string' ? readQuantity(item.original_dose) : null;
    if (typeof item.name !== 'string' || !item.name.trim() || typeof item.note !== 'string'
        || typeof item.dose !== 'string' || (shanghanlun && item.dose !== '')
        || (item.dose ? !quantity || quantity.raw !== item.original_dose || formatDose(quantity) !== item.dose
          : item.original_dose !== undefined)) {
      throw new Error(`Invalid medicine in record ${index}`);
    }
  }
}

function validateDataset(dataset) {
  const { records, sources, digital_text } = dataset;
  const expectedSources = structured ? 5 : 7;
  const validCounts = shanghanlun ? records?.length > 0 && sources?.length === 1
    : expansion ? dataset.requested === 30000 && records?.length > 0 && records.length <= dataset.requested && sources?.length > 0
      : records?.length === 1000 && sources?.length === expectedSources;
  if (!validCounts || digital_text?.license !== 'CC0') {
    throw new Error('Case totals or source licensing metadata do not match the selected batch');
  }
  const references = new Map(sources.map(source => [source.key, source]));
  const locations = new Set();
  const seen = new Set();
  const counts = new Map();
  for (const [index, row] of records.entries()) {
    for (const [field, limit] of Object.entries(textLimits)) {
      const value = row[field];
      if (value === null && optional.has(field)) continue;
      if (typeof value !== 'string' || !value.trim() || [...value].length > limit) {
        throw new Error(`Invalid ${field} at record ${index + 1}`);
      }
    }
    const source = references.get(row.source?.book);
    const paragraphIds = row.source?.paragraphs;
    const location = `${row.source?.book}:${shanghanlun ? row.source?.chapter_key : ''}:${paragraphIds?.[0]}`;
    if (typeof row.content !== 'string' || !row.content.trim() || Buffer.byteLength(row.content) > 65535
        || !source || source.bookname !== row.bookname || source.source_url !== row.source.url
        || !paragraphIds?.length || row.content.split('\n').length !== paragraphIds.length
        || !paragraphIds.every((number, i) => Number.isInteger(number) && number > (paragraphIds[i - 1] ?? 0))
        || sha256(row.content) !== row.source.sha256 || seen.has(row.source.sha256) || locations.has(location)) {
      throw new Error(`Invalid or duplicated case source at record ${index + 1}`);
    }
    locations.add(location);
    seen.add(row.source.sha256);
    counts.set(source.key, (counts.get(source.key) ?? 0) + 1);
    if (structured) validateStructuredRow(row, index + 1);
  }
  if (sources.some(source => counts.get(source.key) !== source.selected)) {
    throw new Error('Source totals do not match the dataset');
  }
}

function digest(rows) {
  return sha256(JSON.stringify(rows.map(row => contentFields.map(field => row[field]))));
}

async function connect(env) {
  const host = env.CASES_DB_HOST;
  const port = Number(env.CASES_DB_PORT || 3306);
  const user = env.CASES_DB_USER;
  const password = env.CASES_DB_PASSWORD;
  if (!host || !user || password === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Set CASES_DB_HOST, CASES_DB_USER, CASES_DB_PASSWORD and a valid port');
  }
  const ca = env.CASES_DB_SSL_CA ? await fs.readFile(env.CASES_DB_SSL_CA, 'utf8') : undefined;
  return mysql.createConnection({
    host, port, user, password, database: 'qingnang', charset: 'utf8mb4', connectTimeout: 10000,
    ssl: { ca, rejectUnauthorized: Boolean(ca), minVersion: 'TLSv1.2' },
  });
}

async function verifySchema(connection) {
  const [[identity]] = await connection.query('SELECT DATABASE() AS name, @@sql_mode AS sql_mode');
  const [[tableInfo]] = await connection.execute(
    'SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  const [[cipher]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  if (identity.name !== 'qingnang' || tableInfo?.engine !== 'InnoDB' || !cipher?.Value
      || !/\bSTRICT_(?:ALL|TRANS)_TABLES\b/u.test(identity.sql_mode)) {
    throw new Error('Expected the qingnang InnoDB table, TLS and strict SQL mode');
  }
  const [fields] = await connection.query(`SHOW COLUMNS FROM ${table}`);
  const schema = new Map(fields.map(field => [field.Field, field]));
  if (!readFields.every(field => schema.has(field)) || schema.get('id').Key !== 'PRI'
      || !schema.get('id').Extra.includes('auto_increment')
      || ['origin_symptoms', 'temp_tags'].some(field => schema.get(field).Null !== 'YES' || schema.get(field).Default !== null)) {
    throw new Error('The t_cases schema does not match the import columns or NULL defaults');
  }
}

async function readRows(connection, lock = false) {
  const [rows] = await connection.query(
    `SELECT ${readFields.join(', ')} FROM ${table} ORDER BY id${lock ? ' FOR UPDATE' : ''}`,
  );
  return rows;
}

function classify(existing, records) {
  const wanted = new Map(records.map(row => [row.content, row]));
  const matched = new Map();
  for (const row of existing) {
    const source = wanted.get(row.content);
    if (!source) continue;
    if (matched.has(row.content) || contentFields.some(field => row[field] !== source[field])
        || row.kind !== 1 || row.status !== 1 || row.op_uname !== operator
        || row.origin_symptoms !== null || row.temp_tags !== null) {
      throw new Error(`Existing case ID ${row.id} conflicts with a source record`);
    }
    matched.set(row.content, row);
  }
  return matched;
}

function summarize(existing, records) {
  const matched = classify(existing, records);
  if (matched.size !== records.length) throw new Error(`Verified only ${matched.size} of ${records.length} case rows`);
  const verified = records.map(row => matched.get(row.content));
  const ids = verified.map(row => row.id);
  return {
    rows: verified.length, first_id: Math.min(...ids), last_id: Math.max(...ids),
    sources: new Set(verified.map(row => row.bookname)).size,
    sha256: digest(verified),
  };
}

async function insert(connection, records) {
  const tuple = '(' + insertFields.map(() => '?').join(', ') + ')';
  const batchSize = 60;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const [result] = await connection.execute(
      `INSERT INTO ${table} (${insertFields.join(', ')}) VALUES ${batch.map(() => tuple).join(', ')}`,
      batch.flatMap(row => [...contentFields.map(field => row[field]), 1, 1, operator]),
    );
    if (result.affectedRows !== batch.length || result.warningStatus !== 0) {
      throw new Error(`Unexpected result after inserting at offset ${offset}`);
    }
  }
}

function checkNormalizedDuplicates(existing, pending) {
  const normalize = content => content.replace(/^（案\d+(?:[～至—-]\d+)?）/u, '')
    .normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
  const archived = new Map(existing.filter(row => row.content).map(row => [normalize(row.content), row.id]));
  for (const row of pending) {
    const duplicate = archived.get(normalize(row.content));
    if (duplicate !== undefined) throw new Error(`Existing case ID ${duplicate} has matching normalized source text`);
  }
}

async function apply(connection, records) {
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw new Error('Could not acquire the cases import lock');
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const existing = await readRows(connection, true);
    const matched = classify(existing, records);
    const pending = records.filter(row => !matched.has(row.content));
    if (expansion || shanghanlun) checkNormalizedDuplicates(existing, pending);
    await insert(connection, pending);
    const rows = await readRows(connection, true);
    const after = new Map(rows.map(row => [row.id, row]));
    if (existing.some(row => JSON.stringify(row) !== JSON.stringify(after.get(row.id)))) {
      throw new Error('Existing case rows differ during import verification');
    }
    const summary = summarize(rows, records);
    await connection.commit();
    return { inserted: pending.length, ...(expansion || shanghanlun ? { before: existing.length, after: rows.length } : {}), ...summary };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

async function main() {
  const [mode = '--check', ...rest] = args.filter(arg => !batchFlags.includes(arg));
  if (rest.length || args.filter(arg => batchFlags.includes(arg)).length > 1 || !['--check', '--verify', '--apply'].includes(mode)) {
    throw new Error('Use --check, --verify or --apply with at most one of --structured, --expansion or --shanghanlun');
  }
  const data = JSON.parse(await fs.readFile(datasetUrl, 'utf8'));
  validateDataset(data);
  if (shanghanlun && JSON.stringify(data) !== JSON.stringify(await buildShanghanlunCases())) {
    throw new Error('The Shanghanlun dataset differs from the archived source and reviewed selections');
  }
  if (mode === '--check') {
    console.log(JSON.stringify({ rows: data.records.length, sha256: digest(data.records) }));
    return;
  }
  const connection = await connect(process.env);
  try {
    await verifySchema(connection);
    const result = mode === '--apply'
      ? await apply(connection, data.records)
      : summarize(await readRows(connection), data.records);
    console.log(JSON.stringify({ table: 'qingnang.t_cases', mode, ...result }));
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

const table = 't_acupoints';
const lockName = 'qingnang.t_acupoints.standard-repair';
const dataset = JSON.parse(await fs.readFile(new URL('../database/acupoints-standard-2021.json', import.meta.url), 'utf8'));
const { meridian_points: meridianPoints, extra_points: extraPoints, sources } = dataset;
const nationalCode = { SJ: 'TE', RN: 'CV', DU: 'GV' };
const historicalExtra = new Set(['EX-B5', 'EX-B9']);
const crossMeetings = new Map([['ST8', '阳维脉'], ['ST30', '冲脉']]);
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const namesByCode = new Map(meridianPoints.map(point => [point.code, point]));
const extrasByCode = new Map(extraPoints.flatMap(point => point.codes.map(code => [code, point])));
const newExtras = extraPoints.filter(point => point.codes.length === 0);

function appendLine(value, line) {
  const text = (value ?? '').trim();
  return text.split(/\r?\n/u).includes(line) ? value : [text, line].filter(Boolean).join('\n');
}

function addLocation(row, point, standard) {
  if (!point.locate) return;
  const section = `《${standard}》第 ${point.section} 节`;
  if (!(row.locate ?? '').startsWith(section)) {
    row.locate = [`${section}\n${point.locate}`, row.locate?.trim()].filter(Boolean).join('\n\n');
  }
}

function readTitle(title) {
  const match = title?.normalize('NFKC').match(/^([^()]+)\(([A-Z-]+\d+\+?)\)$/u);
  return match ? { name: match[1], code: match[2] } : { name: title, code: '' };
}

function pinyinKey(value) {
  return (value ?? '').normalize('NFKC').replace(/[\s'’]+/gu, '').toLowerCase();
}

function repairRow(before) {
  const row = { ...before };
  const { name, code } = readTitle(before.name);
  const canonical = code === 'EX-HN3' ? 'GV24+' : code.replace(/^(SJ|RN|DU)/u, prefix => nationalCode[prefix]);
  const meridian = namesByCode.get(canonical);
  const extra = extrasByCode.get(code);
  if (meridian) {
    assert.ok(meridian.name === name || (canonical === 'TE11' && name === '清冷渊')
      || (canonical === 'GB22' && name === '渊液'), `Unexpected name for ${before.name}`);
    if (code === 'EX-HN3') {
      assert.equal(name, '印堂');
      assert.ok(!row.meridian && !row.pulse);
      row.pulse = '督脉';
      row.adscription = `督脉（${sources[0].name}）`;
    }
    assert.equal(row.meridian || row.pulse, meridian.channel, `Unexpected channel for ${before.name}`);
    row.name = `${meridian.name}（${canonical}）`;
    row.item_order = meridian.order;
    if (name !== meridian.name) row.alias = appendLine(row.alias, `旧名：${name}`);
    if (code !== canonical) row.alias = appendLine(row.alias, `旧编码：${code}`);
    if (pinyinKey(row.pinyin) !== pinyinKey(meridian.pinyin)) row.pinyin = meridian.pinyin;
    if (!row.adscription?.trim()) row.adscription = meridian.channel;
    if (!row.pulse && crossMeetings.has(canonical)) row.pulse = crossMeetings.get(canonical);
    if (canonical === 'GV10' && !row.indications?.trim()) {
      row.indications = '《针灸问答》记载气喘、久咳。';
    }
    addLocation(row, meridian, sources[0].name);
  } else if (extra) {
    assert.ok(extra.name === name || (extra.name === '金津玉液' && ['金津', '玉液'].includes(name)),
      `Unexpected extra-point name for ${before.name}`);
    row.name = `${name}（${code}）`;
    if (row.adscription?.trim() === '经外穴') row.adscription = '经外奇穴';
    if (extra.name === name && pinyinKey(row.pinyin) !== pinyinKey(extra.pinyin)) row.pinyin = extra.pinyin;
    if (extra.name === '金津玉液') row.alias = appendLine(row.alias, '合列名称：金津玉液');
    addLocation(row, extra, sources[1].name);
  } else if (historicalExtra.has(code)) {
    row.notes = appendLine(row.notes, '旧版经外穴目录条目（GB/T 12346—2006）。');
  } else {
    assert.ok(newExtras.some(point => point.name === name), `Unrecognized acupoint ${before.name}`);
  }
  return row;
}

function plan(rows) {
  assert.equal(namesByCode.size, 362);
  assert.equal(extraPoints.length, 51);
  const updated = rows.map(repairRow);
  const timestamp = Math.floor(Date.now() / 1000);
  const lastId = rows.at(-1)?.acupoint_id ?? 0;
  const presentNames = new Set(updated.map(row => readTitle(row.name).name));
  const additions = newExtras.filter(point => !presentNames.has(point.name)).map((point, index) => ({
    acupoint_id: lastId + index + 1,
    name: point.name,
    pinyin: point.pinyin,
    adscription: '经外奇穴',
    locate: `《${sources[1].name}》第 ${point.section} 节\n${point.locate}`,
    position: point.position,
    abbreviation: point.abbreviation,
    item_order: point.order,
    create_time: timestamp,
    edit_time: timestamp,
  }));
  const final = [...updated, ...additions];
  if (new Set(final.map(row => row.name)).size !== final.length) throw new Error('Duplicate acupoint title');
  const titles = new Set(final.map(row => readTitle(row.name).code));
  assert.ok(meridianPoints.every(point => titles.has(point.code)), 'Incomplete standard meridian points');
  assert.ok(extraPoints.every(point => point.codes.length ? point.codes.every(code => titles.has(code))
    : final.some(row => row.name === point.name)), 'Incomplete standard extra points');

  const changes = updated.map((row, index) => ({ id: row.acupoint_id, fields: Object.fromEntries(
    Object.entries(row).filter(([field, value]) => value !== rows[index][field]),
  ) })).filter(change => Object.keys(change.fields).length);
  const fields = {};
  for (const change of changes) {
    for (const field of Object.keys(change.fields)) fields[field] = (fields[field] ?? 0) + 1;
  }
  return { changes, additions, updated, fields };
}

async function connect() {
  const { ACUPOINTS_DB_HOST: host, ACUPOINTS_DB_USER: user, ACUPOINTS_DB_PASSWORD: password,
    ACUPOINTS_DB_PORT: portValue, ACUPOINTS_DB_SSL_CA: caFile } = process.env;
  const port = Number(portValue || 3306);
  assert.ok(host && user && password && Number.isInteger(port) && port > 0 && port <= 65535,
    'Set the ACUPOINTS_DB connection environment variables');
  const ca = caFile ? await fs.readFile(caFile, 'utf8') : undefined;
  const connection = await mysql.createConnection({ host, port, user, password, database: 'qingnang', charset: 'utf8mb4',
    connectTimeout: 10000, ssl: { ca, rejectUnauthorized: Boolean(ca), minVersion: 'TLSv1.2' } });
  try {
    const [[cipher]] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    const [[metadata]] = await connection.execute('SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
    const [[triggers]] = await connection.execute('SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ?', [table]);
    assert.ok(cipher?.Value && metadata?.engine === 'InnoDB' && triggers.total === 0, 'Unexpected acupoint storage or connection');
    return connection;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

async function readRows(connection, lock = false) {
  const [rows] = await connection.query(`SELECT * FROM ${table} ORDER BY acupoint_id${lock ? ' FOR UPDATE' : ''}`);
  return rows;
}

async function writePlan(connection, changes, additions) {
  for (const { id, fields } of changes) {
    const entries = Object.entries(fields);
    const assignments = entries.map(([field]) => `\`${field}\` = ?`).join(', ');
    const [result] = await connection.execute(`UPDATE ${table} SET ${assignments} WHERE acupoint_id = ?`,
      [...entries.map(([, value]) => value), id]);
    assert.equal(result.affectedRows, 1);
    assert.equal(result.warningStatus, 0);
  }
  if (!additions.length) return;
  const fields = Object.keys(additions[0]);
  const values = '(' + fields.map(() => '?').join(', ') + ')';
  const [result] = await connection.execute(
    `INSERT INTO ${table} (${fields.map(field => `\`${field}\``).join(', ')}) VALUES ${additions.map(() => values).join(', ')}`,
    additions.flatMap(row => fields.map(field => row[field])),
  );
  assert.equal(result.affectedRows, additions.length);
  assert.equal(result.warningStatus, 0);
}

async function main() {
  const [mode = '--check'] = process.argv.slice(2);
  assert.ok(['--check', '--apply', '--verify'].includes(mode) && process.argv.length <= 3,
    'Use --check, --apply or --verify');
  const apply = mode === '--apply';
  const connection = await connect();
  let result;
  let backup;
  let expectedDigest;
  let locked = false;
  try {
    if (apply) {
      const [[record]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
      assert.equal(record.acquired, 1, 'Could not obtain the acupoint repair lock');
      locked = true;
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
    }
    const before = await readRows(connection, apply);
    const { changes, additions, updated, fields } = plan(before);
    result = { before: before.length, updated: changes.length, inserted: additions.length,
      fields, additions: additions.map(({ acupoint_id, name }) => ({ acupoint_id, name })) };
    if (mode === '--verify') assert.equal(changes.length + additions.length, 0, 'Acupoint repair is still pending');
    if (apply) {
      if (changes.length || additions.length) {
        backup = path.join(os.tmpdir(), `qingnang-acupoints-before-${Date.now()}.json`);
        await fs.writeFile(backup, JSON.stringify(before), { flag: 'wx' });
        await writePlan(connection, changes, additions);
      }
      const after = await readRows(connection);
      assert.equal(after.length, before.length + additions.length);
      assert.deepEqual(after.slice(0, before.length), updated, 'Existing row differs from the planned changes');
      for (const [index, row] of after.slice(before.length).entries()) {
        const added = additions[index];
        assert.deepEqual(Object.fromEntries(Object.keys(added).map(field => [field, row[field]])), added);
      }
      expectedDigest = digest(after);
      await connection.commit();
    }
  } catch (error) {
    if (locked) await connection.rollback();
    throw error;
  } finally {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    await connection.end();
  }

  if (apply) {
    const verifier = await connect();
    try {
      const after = await readRows(verifier);
      assert.equal(digest(after), expectedDigest, 'Post-commit acupoint rows differ');
      const repeated = plan(after);
      assert.equal(repeated.changes.length + repeated.additions.length, 0);
      result = { ...result, after: after.length, sha256: expectedDigest, backup, verified: true };
    } finally {
      await verifier.end();
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
});

import fs from "node:fs/promises";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const ROOT = new URL("../", import.meta.url);
const CREDENTIALS_PATH = new URL("database/PRIVATE_DATABASE_ACCESS.md", ROOT);
const DATA_PATH = new URL("txt/huangdi-neijing-suwen.json", ROOT);
const ROLLBACK_PATH = new URL("txt/huangdi-neijing-suwen-local-rollback.sql", ROOT);
const REPORT_PATH = new URL("txt/huangdi-neijing-suwen-local-report.json", ROOT);
const BOOK_NAME = "黄帝内经·素问";
const EXPECTED_BOOK_ID = 1;

function parseLocalCredentials(markdown) {
  const blocks = [...markdown.matchAll(/```text\s+type=mysql([\s\S]*?)```/g)];
  if (!blocks.length) throw new Error("No MySQL connection blocks found");
  const values = Object.fromEntries(
    blocks.at(-1)[1].trim().split(/\r?\n/).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  for (const field of ["host", "port", "user", "pass"]) {
    if (!values[field]) throw new Error(`Missing local database credential: ${field}`);
  }
  return values;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function paragraphCount(value) {
  return String(value || "").split("\n").filter(Boolean).length;
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function quoteId(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

function assertDataset(dataset) {
  if (dataset.book_name !== BOOK_NAME || dataset.chapters.length !== 81) {
    throw new Error("Local JSON must contain the canonical 81 Suwen chapters");
  }
  const titles = new Set();
  let paragraphs = 0;
  for (const [index, chapter] of dataset.chapters.entries()) {
    if (chapter.order !== index + 1 || titles.has(chapter.title)) {
      throw new Error(`Invalid JSON chapter order/title at ${chapter.title}`);
    }
    titles.add(chapter.title);
    const contentParagraphs = paragraphCount(chapter.content);
    const shiyiParagraphs = paragraphCount(chapter.shiyi);
    if (!chapter.content || !chapter.shiyi || contentParagraphs !== shiyiParagraphs) {
      throw new Error(`Invalid JSON paragraphs for ${chapter.title}`);
    }
    if (/\r|\n\n|<[^>]+>|'''|\{\{|\[\[/.test(`${chapter.content}${chapter.shiyi}`)) {
      throw new Error(`Invalid JSON markup or line breaks for ${chapter.title}`);
    }
    if (sha256(chapter.content) !== chapter.content_sha256 || sha256(chapter.shiyi) !== chapter.shiyi_sha256) {
      throw new Error(`Invalid JSON hash for ${chapter.title}`);
    }
    paragraphs += contentParagraphs;
  }
  if (paragraphs !== 1882) throw new Error(`Expected 1882 paragraph pairs, found ${paragraphs}`);
  return paragraphs;
}

async function tableColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters'
     ORDER BY ORDINAL_POSITION`,
  );
  return rows;
}

function metadataDigest(rows) {
  return sha256(JSON.stringify(rows.map((row) => ({
    id: Number(row.id),
    book_id: Number(row.book_id),
    volume: row.volume,
    name: row.name,
    subhead: row.subhead,
    abbreviation: row.abbreviation,
    status: Number(row.status),
    item_order: Number(row.item_order),
  }))));
}

function rowDigest(row) {
  return sha256(JSON.stringify(row));
}

function makeRollback(columns, rows) {
  const names = columns.map((column) => column.COLUMN_NAME);
  const inserts = rows.map((row) => {
    const values = names.map((name) => sqlString(row[name])).join(", ");
    return `INSERT INTO \`qingnang\`.\`t_book_chapters\` (${names.map(quoteId).join(", ")}) VALUES (${values});`;
  });
  return [
    `-- Local Suwen snapshot generated ${new Date().toISOString()}`,
    "-- Restores all 82 pre-import records, including 黄帝内经素问序.",
    "START TRANSACTION;",
    `DELETE FROM \`qingnang\`.\`t_book_chapters\` WHERE \`book_id\` = ${EXPECTED_BOOK_ID};`,
    ...inserts,
    "COMMIT;",
    "",
  ].join("\n");
}

async function main() {
  const credentials = parseLocalCredentials(await fs.readFile(CREDENTIALS_PATH, "utf8"));
  const dataset = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const localParagraphs = assertDataset(dataset);
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.user,
    password: credentials.pass,
    database: "qingnang",
    charset: "utf8mb4",
    connectTimeout: 15000,
    multipleStatements: false,
  });

  const report = {
    mode: "local-apply",
    started_at: new Date().toISOString(),
    connection: { host: credentials.host, port: Number(credentials.port), database: "qingnang" },
    local_json: { chapter_count: 81, paragraph_pairs: localParagraphs },
  };

  try {
    const [books] = await connection.execute("SELECT id, name FROM t_books WHERE name = ?", [BOOK_NAME]);
    if (books.length !== 1) throw new Error(`Expected one matching book, found ${books.length}`);
    if (Number(books[0].id) !== EXPECTED_BOOK_ID) {
      throw new Error(`Expected book_id=${EXPECTED_BOOK_ID}, found ${books[0].id}`);
    }

    const columns = await tableColumns(connection);
    const columnMap = new Map(columns.map((column) => [column.COLUMN_NAME, column]));
    for (const required of ["id", "book_id", "name", "content", "item_order", "shiyi"]) {
      if (!columnMap.has(required)) throw new Error(`Missing required column: ${required}`);
    }
    if (columnMap.get("content").DATA_TYPE !== "mediumtext") throw new Error("content must be MEDIUMTEXT");
    if (columnMap.get("shiyi").DATA_TYPE !== "text") throw new Error("shiyi must be TEXT");

    const [before] = await connection.execute(
      "SELECT * FROM t_book_chapters WHERE book_id = ? ORDER BY item_order, id",
      [EXPECTED_BOOK_ID],
    );
    if (before.length !== 82) throw new Error(`Expected 82 existing records including preface, found ${before.length}`);
    const preface = before.find((row) => Number(row.item_order) === 10);
    if (!preface || preface.name !== "黄帝内经素问序") throw new Error("Expected Suwen preface at item_order=10");
    const targetRows = before.filter((row) => Number(row.item_order) >= 20 && Number(row.item_order) <= 820);
    if (targetRows.length !== 81) throw new Error(`Expected 81 target records, found ${targetRows.length}`);
    for (const [index, row] of targetRows.entries()) {
      const expectedOrder = (index + 2) * 10;
      if (Number(row.item_order) !== expectedOrder) {
        throw new Error(`Invalid item_order sequence at id=${row.id}: expected ${expectedOrder}`);
      }
    }
    const distinctOrders = new Set(before.map((row) => Number(row.item_order)));
    if (distinctOrders.size !== before.length) throw new Error("Duplicate item_order values found");

    const maxShiyiBytes = Math.max(...dataset.chapters.map((chapter) => Buffer.byteLength(chapter.shiyi, "utf8")));
    if (maxShiyiBytes > 65535) throw new Error(`Largest shiyi exceeds TEXT capacity: ${maxShiyiBytes} bytes`);

    const beforeMetadataHash = metadataDigest(before);
    const beforePrefaceHash = rowDigest(preface);
    await fs.writeFile(ROLLBACK_PATH, makeRollback(columns, before), "utf8");
    report.preflight = {
      book_id: EXPECTED_BOOK_ID,
      snapshot_rows: before.length,
      target_rows: targetRows.length,
      preface_id: Number(preface.id),
      metadata_sha256: beforeMetadataHash,
      preface_sha256: beforePrefaceHash,
      max_shiyi_bytes: maxShiyiBytes,
    };

    await connection.beginTransaction();
    try {
      let matchedRows = 0;
      let changedRows = 0;
      for (const [index, chapter] of dataset.chapters.entries()) {
        const row = targetRows[index];
        const [result] = await connection.execute(
          `UPDATE t_book_chapters
           SET content = ?, shiyi = ?
           WHERE book_id = ? AND id = ? AND item_order = ?`,
          [chapter.content, chapter.shiyi, EXPECTED_BOOK_ID, row.id, row.item_order],
        );
        if (result.affectedRows !== 1) throw new Error(`Update did not match exactly one row for ${chapter.title}`);
        matchedRows += result.affectedRows;
        changedRows += result.changedRows;
      }

      const [after] = await connection.execute(
        "SELECT * FROM t_book_chapters WHERE book_id = ? ORDER BY item_order, id",
        [EXPECTED_BOOK_ID],
      );
      if (after.length !== 82) throw new Error(`Post-write record count is ${after.length}`);
      const afterPreface = after.find((row) => Number(row.item_order) === 10);
      if (rowDigest(afterPreface) !== beforePrefaceHash) throw new Error("Preface changed during import");
      if (metadataDigest(after) !== beforeMetadataHash) throw new Error("Chapter metadata changed during import");

      const afterTargets = after.filter((row) => Number(row.item_order) >= 20 && Number(row.item_order) <= 820);
      const mismatches = [];
      for (const [index, chapter] of dataset.chapters.entries()) {
        const row = afterTargets[index];
        if (sha256(row.content) !== chapter.content_sha256) mismatches.push(`${chapter.title}:content`);
        if (sha256(row.shiyi) !== chapter.shiyi_sha256) mismatches.push(`${chapter.title}:shiyi`);
      }
      if (mismatches.length) throw new Error(`Post-write hash mismatch: ${mismatches.join(", ")}`);

      await connection.commit();
      report.write = { matched_rows: matchedRows, changed_rows: changedRows, committed: true };
      report.verification = {
        record_count: after.length,
        target_count: afterTargets.length,
        all_hashes_match: true,
        metadata_unchanged: true,
        preface_unchanged: true,
        samples: [1, 5, 72, 73, 74].map((order) => {
          const chapter = dataset.chapters[order - 1];
          const row = afterTargets[order - 1];
          return {
            order,
            id: Number(row.id),
            item_order: Number(row.item_order),
            database_name: row.name,
            json_title: chapter.title,
            content_paragraphs: paragraphCount(row.content),
            shiyi_paragraphs: paragraphCount(row.shiyi),
          };
        }),
      };
    } catch (error) {
      await connection.rollback();
      report.write = { committed: false, error: error.message };
      throw error;
    }

    report.completed_at = new Date().toISOString();
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.failed_at = new Date().toISOString();
    report.error = error.message;
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Local Suwen import failed: ${error.message}`);
  process.exitCode = 1;
});

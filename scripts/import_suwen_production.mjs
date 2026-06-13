import fs from "node:fs/promises";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const ROOT = new URL("../", import.meta.url);
const CREDENTIALS_PATH = new URL("database/PRIVATE_DATABASE_ACCESS.md", ROOT);
const DATA_PATH = new URL("txt/huangdi-neijing-suwen.json", ROOT);
const ROLLBACK_PATH = new URL("txt/huangdi-neijing-suwen-rollback.sql", ROOT);
const REPORT_PATH = new URL("txt/huangdi-neijing-suwen-production-report.json", ROOT);
const BOOK_NAME = "黄帝内经·素问";
const APPLY = process.argv.includes("--apply");
const PREFLIGHT = process.argv.includes("--preflight") || !APPLY;
const ALLOW_INSECURE = process.argv.includes("--allow-insecure");

function parseCredentials(markdown) {
  const block = markdown.match(/```text\s+type=mysql([\s\S]*?)```/);
  if (!block) throw new Error("MySQL connection block not found in private access file");
  const values = Object.fromEntries(
    block[1].trim().split(/\r?\n/).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  for (const field of ["host", "port", "user", "pass", "db"]) {
    if (!values[field]) throw new Error(`Missing database credential: ${field}`);
  }
  return values;
}

function quoteId(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function paragraphCount(value) {
  return String(value || "").split("\n").filter(Boolean).length;
}

function assertDataset(dataset) {
  if (dataset.book_name !== BOOK_NAME || dataset.chapters.length !== 81) {
    throw new Error("Local dataset must contain the canonical 81 Suwen chapters");
  }
  const titles = new Set();
  for (const [index, chapter] of dataset.chapters.entries()) {
    if (chapter.order !== index + 1 || titles.has(chapter.title)) {
      throw new Error(`Invalid local chapter order/title at ${chapter.title}`);
    }
    titles.add(chapter.title);
    const contentLines = paragraphCount(chapter.content);
    const shiyiLines = paragraphCount(chapter.shiyi);
    if (!chapter.content || !chapter.shiyi || contentLines !== shiyiLines) {
      throw new Error(`Invalid local paragraphs for ${chapter.title}`);
    }
    if (/\r|\n\n|<[^>]+>|'''|\{\{|\[\[/.test(`${chapter.content}${chapter.shiyi}`)) {
      throw new Error(`Invalid local markup or line breaks for ${chapter.title}`);
    }
    if (sha256(chapter.content) !== chapter.content_sha256 || sha256(chapter.shiyi) !== chapter.shiyi_sha256) {
      throw new Error(`Invalid local hash for ${chapter.title}`);
    }
  }
}

async function tableColumns(connection, database, table) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [database, table],
  );
  return rows;
}

function makeRollback(bookId, columns, rows) {
  const columnNames = columns.map((column) => column.COLUMN_NAME);
  const deleteSql = `DELETE FROM \`qingnang\`.\`t_book_chapters\` WHERE \`book_id\` = ${Number(bookId)};`;
  const inserts = rows.map((row) => {
    const values = columnNames.map((name) => sqlString(row[name])).join(", ");
    return `INSERT INTO \`qingnang\`.\`t_book_chapters\` (${columnNames.map(quoteId).join(", ")}) VALUES (${values});`;
  });
  return [
    `-- Production snapshot generated ${new Date().toISOString()}`,
    "-- Restores all pre-import chapters for 黄帝内经·素问.",
    "START TRANSACTION;",
    deleteSql,
    ...inserts,
    "COMMIT;",
    "",
  ].join("\n");
}

async function main() {
  const credentials = parseCredentials(await fs.readFile(CREDENTIALS_PATH, "utf8"));
  const dataset = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  assertDataset(dataset);

  const connectionOptions = {
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.user,
    password: credentials.pass,
    database: credentials.db,
    charset: "utf8mb4",
    connectTimeout: 15000,
    multipleStatements: false,
  };
  if (!ALLOW_INSECURE) connectionOptions.ssl = { rejectUnauthorized: true };
  const connection = await mysql.createConnection(connectionOptions);

  const report = {
    mode: APPLY ? "apply" : "preflight",
    started_at: new Date().toISOString(),
    connection: {
      host: credentials.host,
      port: Number(credentials.port),
      database: credentials.db,
      ssl: !ALLOW_INSECURE,
      insecure_override: ALLOW_INSECURE,
    },
    local: { chapter_count: dataset.chapters.length, paragraph_count: dataset.chapters.reduce((sum, c) => sum + c.paragraph_count, 0) },
  };

  try {
    const [books] = await connection.execute(
      "SELECT id, name FROM `qingnang`.`t_books` WHERE name = ?",
      [BOOK_NAME],
    );
    if (books.length !== 1) throw new Error(`Expected exactly one matching book, found ${books.length}`);
    const bookId = Number(books[0].id);
    report.book_id = bookId;

    const columns = await tableColumns(connection, "qingnang", "t_book_chapters");
    const columnMap = new Map(columns.map((column) => [column.COLUMN_NAME, column]));
    for (const required of ["id", "book_id", "title", "content"]) {
      if (!columnMap.has(required)) throw new Error(`Missing required chapter column: ${required}`);
    }
    const hasShiyi = columnMap.has("shiyi");
    report.has_shiyi = hasShiyi;
    report.columns = columns;

    const [existing] = await connection.execute(
      "SELECT * FROM `qingnang`.`t_book_chapters` WHERE book_id = ? ORDER BY id",
      [bookId],
    );
    const canonicalTitles = new Set(dataset.chapters.map((chapter) => chapter.title));
    const matching = existing.filter((row) => canonicalTitles.has(row.title));
    const extras = existing.filter((row) => !canonicalTitles.has(row.title));
    const counts = new Map();
    for (const row of matching) counts.set(row.title, (counts.get(row.title) || 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([title]) => title);
    if (duplicates.length) throw new Error(`Duplicate canonical chapter titles: ${duplicates.join(", ")}`);

    const orderByTitle = new Map(dataset.chapters.map((chapter) => [chapter.title, chapter.order]));
    const matchingOrders = matching.map((row) => ({ id: Number(row.id), order: orderByTitle.get(row.title), title: row.title }));
    for (let index = 1; index < matchingOrders.length; index += 1) {
      if (matchingOrders[index - 1].order > matchingOrders[index].order) {
        throw new Error(`Existing chapter IDs are out of canonical order near ${matchingOrders[index].title}`);
      }
    }
    const existingTitles = new Set(matching.map((row) => row.title));
    const missing = dataset.chapters.filter((chapter) => !existingTitles.has(chapter.title));
    const maxExistingOrder = matchingOrders.reduce((max, row) => Math.max(max, row.order), 0);
    const minMissingOrder = missing.reduce((min, chapter) => Math.min(min, chapter.order), 82);
    if (missing.length && minMissingOrder <= maxExistingOrder) {
      throw new Error(`Adding missing chapter ${minMissingOrder} would break API ID order after existing chapter ${maxExistingOrder}`);
    }

    const maxContentLength = Math.max(...dataset.chapters.map((chapter) => chapter.content.length));
    const maxShiyiLength = Math.max(...dataset.chapters.map((chapter) => chapter.shiyi.length));
    const contentCapacity = columnMap.get("content").CHARACTER_MAXIMUM_LENGTH;
    const shiyiCapacity = hasShiyi ? columnMap.get("shiyi").CHARACTER_MAXIMUM_LENGTH : null;
    if (contentCapacity !== null && Number(contentCapacity) < maxContentLength) throw new Error("content column is too small");
    if (hasShiyi && shiyiCapacity !== null && Number(shiyiCapacity) < maxShiyiLength) throw new Error("shiyi column is too small");

    report.preflight = {
      existing_count: existing.length,
      matching_count: matching.length,
      missing: missing.map(({ order, title }) => ({ order, title })),
      extras: extras.map(({ id, title }) => ({ id: Number(id), title })),
      max_content_length: maxContentLength,
      max_shiyi_length: maxShiyiLength,
    };

    await fs.writeFile(ROLLBACK_PATH, makeRollback(bookId, columns, existing), "utf8");
    report.rollback_snapshot_rows = existing.length;

    if (PREFLIGHT && !APPLY) {
      report.completed_at = new Date().toISOString();
      await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await connection.beginTransaction();
    let updated = 0;
    let inserted = 0;
    try {
      for (const chapter of dataset.chapters) {
        if (existingTitles.has(chapter.title)) {
          const fields = hasShiyi ? "content = ?, shiyi = ?" : "content = ?";
          const values = hasShiyi ? [chapter.content, chapter.shiyi, bookId, chapter.title] : [chapter.content, bookId, chapter.title];
          const [result] = await connection.execute(
            `UPDATE \`qingnang\`.\`t_book_chapters\` SET ${fields} WHERE book_id = ? AND title = ?`,
            values,
          );
          updated += result.affectedRows;
        } else {
          const fields = hasShiyi ? "(book_id, title, content, shiyi)" : "(book_id, title, content)";
          const placeholders = hasShiyi ? "(?, ?, ?, ?)" : "(?, ?, ?)";
          const values = hasShiyi ? [bookId, chapter.title, chapter.content, chapter.shiyi] : [bookId, chapter.title, chapter.content];
          await connection.execute(
            `INSERT INTO \`qingnang\`.\`t_book_chapters\` ${fields} VALUES ${placeholders}`,
            values,
          );
          inserted += 1;
        }
      }

      const selectFields = hasShiyi ? "id, title, content, shiyi" : "id, title, content";
      const [after] = await connection.execute(
        `SELECT ${selectFields} FROM \`qingnang\`.\`t_book_chapters\` WHERE book_id = ? ORDER BY id`,
        [bookId],
      );
      const afterMap = new Map(after.filter((row) => canonicalTitles.has(row.title)).map((row) => [row.title, row]));
      if (afterMap.size !== 81) throw new Error(`Post-write canonical count is ${afterMap.size}, expected 81`);
      const mismatches = [];
      for (const chapter of dataset.chapters) {
        const row = afterMap.get(chapter.title);
        if (sha256(row.content) !== chapter.content_sha256) mismatches.push(`${chapter.title}:content`);
        if (hasShiyi && sha256(row.shiyi) !== chapter.shiyi_sha256) mismatches.push(`${chapter.title}:shiyi`);
      }
      if (mismatches.length) throw new Error(`Post-write hash mismatch: ${mismatches.join(", ")}`);
      await connection.commit();

      report.write = { updated, inserted, committed: true };
      report.verification = {
        canonical_count: afterMap.size,
        all_hashes_match: true,
        samples: [1, 5, 72, 73, 74].map((order) => {
          const chapter = dataset.chapters[order - 1];
          const row = afterMap.get(chapter.title);
          return {
            order,
            id: Number(row.id),
            title: chapter.title,
            content_paragraphs: paragraphCount(row.content),
            shiyi_paragraphs: hasShiyi ? paragraphCount(row.shiyi) : null,
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
  console.error(`Production Suwen import failed: ${error.message}`);
  process.exitCode = 1;
});

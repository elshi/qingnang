import fs from "node:fs/promises";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const ROOT = new URL("../", import.meta.url);
const CREDENTIALS_PATH = new URL("database/PRIVATE_DATABASE_ACCESS.md", ROOT);
const DATA_DIR = new URL("txt/basic-books/", ROOT);
const REPORT_PATH = new URL("txt/basic-books/local-import-report.json", ROOT);

const BOOKS = [
  { id: 2, name: "黄帝内经·灵枢", slug: "huangdi-neijing-lingshu" },
  { id: 3, name: "伤寒论", slug: "shanghan-lun" },
  { id: 5, name: "金匮要略", slug: "jingui-yaolue" },
  { id: 6, name: "道德经", slug: "daode-jing" },
  { id: 7, name: "温病条辨", slug: "wenbing-tiaobian" },
  { id: 8, name: "难经", slug: "nan-jing" },
  { id: 9, name: "四圣心源", slug: "sisheng-xinyuan" },
];

function parseLocalCredentials(markdown) {
  const blocks = [...markdown.matchAll(/```text\s+type=mysql([\s\S]*?)```/g)];
  return Object.fromEntries(
    blocks.at(-1)[1].trim().split(/\r?\n/).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function quoteId(value) {
  return `\`${String(value).replaceAll("`", "``")}\``;
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

function makeRollback(book, columns, rows) {
  const names = columns.map((column) => column.COLUMN_NAME);
  return [
    `-- Local snapshot for ${book.name}, generated ${new Date().toISOString()}`,
    "START TRANSACTION;",
    `DELETE FROM \`qingnang\`.\`t_book_chapters\` WHERE \`book_id\` = ${book.id};`,
    ...rows.map((row) => `INSERT INTO \`qingnang\`.\`t_book_chapters\` (${names.map(quoteId).join(", ")}) VALUES (${names.map((name) => sqlString(row[name])).join(", ")});`),
    "COMMIT;",
    "",
  ].join("\n");
}

async function main() {
  const credentials = parseLocalCredentials(await fs.readFile(CREDENTIALS_PATH, "utf8"));
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: Number(credentials.port),
    user: credentials.user,
    password: credentials.pass,
    database: "qingnang",
    charset: "utf8mb4",
  });
  const report = { started_at: new Date().toISOString(), books: [] };

  try {
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters'
       ORDER BY ORDINAL_POSITION`,
    );
    for (const book of BOOKS) {
      const dataset = JSON.parse(await fs.readFile(new URL(`${book.slug}.json`, DATA_DIR), "utf8"));
      if (dataset.book_id !== book.id || dataset.book_name !== book.name || !dataset.chapters.length) {
        throw new Error(`Invalid dataset identity for ${book.name}`);
      }
      const [before] = await connection.execute(
        "SELECT * FROM t_book_chapters WHERE book_id = ? ORDER BY item_order, id",
        [book.id],
      );
      if (before.length !== dataset.chapters.length) throw new Error(`Chapter count changed for ${book.name}`);
      const beforeMetadata = metadataDigest(before);
      for (const [index, chapter] of dataset.chapters.entries()) {
        const row = before[index];
        if (Number(row.id) !== chapter.id || Number(row.item_order) !== chapter.item_order || row.name !== chapter.name) {
          throw new Error(`Chapter mapping changed for ${book.name}/${chapter.name}`);
        }
        if (sha256(chapter.content) !== chapter.content_sha256 || sha256(chapter.shiyi) !== chapter.shiyi_sha256) {
          throw new Error(`Dataset hash mismatch for ${book.name}/${chapter.name}`);
        }
        if (chapter.shiyi.startsWith("现代释义：")) throw new Error(`Forbidden shiyi prefix in ${book.name}/${chapter.name}`);
        if (Buffer.byteLength(chapter.shiyi, "utf8") > 65535) throw new Error(`shiyi too large for ${book.name}/${chapter.name}`);
      }

      await fs.writeFile(new URL(`${book.slug}-local-rollback.sql`, DATA_DIR), makeRollback(book, columns, before), "utf8");
      await connection.beginTransaction();
      try {
        let matchedRows = 0;
        let changedRows = 0;
        for (const chapter of dataset.chapters) {
          const [result] = await connection.execute(
            `UPDATE t_book_chapters SET content = ?, shiyi = ?
             WHERE book_id = ? AND id = ? AND item_order = ? AND name = ?`,
            [chapter.content, chapter.shiyi, book.id, chapter.id, chapter.item_order, chapter.name],
          );
          if (result.affectedRows !== 1) throw new Error(`Update did not match one row for ${book.name}/${chapter.name}`);
          matchedRows += result.affectedRows;
          changedRows += result.changedRows;
        }
        const [after] = await connection.execute(
          "SELECT * FROM t_book_chapters WHERE book_id = ? ORDER BY item_order, id",
          [book.id],
        );
        if (metadataDigest(after) !== beforeMetadata) throw new Error(`Metadata changed for ${book.name}`);
        const mismatches = [];
        for (const [index, chapter] of dataset.chapters.entries()) {
          if (sha256(after[index].content) !== chapter.content_sha256) mismatches.push(`${chapter.name}:content`);
          if (sha256(after[index].shiyi) !== chapter.shiyi_sha256) mismatches.push(`${chapter.name}:shiyi`);
          if (String(after[index].shiyi).startsWith("现代释义：")) mismatches.push(`${chapter.name}:prefix`);
        }
        if (mismatches.length) throw new Error(`Verification failed for ${book.name}: ${mismatches.join(", ")}`);
        await connection.commit();
        report.books.push({
          book_id: book.id,
          book_name: book.name,
          matched_rows: matchedRows,
          changed_rows: changedRows,
          committed: true,
          all_hashes_match: true,
          metadata_unchanged: true,
          no_shiyi_prefix: true,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    report.completed_at = new Date().toISOString();
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Basic book local import failed: ${error.message}`);
  process.exitCode = 1;
});

import fs from "node:fs/promises";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const ROOT = new URL("../", import.meta.url);
const CREDENTIALS_PATH = new URL("database/PRIVATE_DATABASE_ACCESS.md", ROOT);
const OUT_DIR = new URL("txt/basic-books/", ROOT);

const BOOKS = [
  { id: 2, name: "黄帝内经·灵枢", slug: "huangdi-neijing-lingshu" },
  { id: 3, name: "伤寒论", slug: "shanghan-lun" },
  { id: 5, name: "金匮要略", slug: "jingui-yaolue" },
  { id: 6, name: "道德经", slug: "daode-jing" },
  { id: 7, name: "温病条辨", slug: "wenbing-tiaobian" },
  { id: 8, name: "难经", slug: "nan-jing" },
  { id: 9, name: "四圣心源", slug: "sisheng-xinyuan" },
];

const PHRASES = [
  [/黄帝问于岐伯曰[：:]?/g, "黄帝向岐伯询问："],
  [/黄帝问曰[：:]?/g, "黄帝问道："],
  [/黄帝曰[：:]?/g, "黄帝说道："],
  [/帝曰[：:]?/g, "黄帝说道："],
  [/岐伯答曰[：:]?/g, "岐伯回答："],
  [/岐伯对曰[：:]?/g, "岐伯回答："],
  [/岐伯曰[：:]?/g, "岐伯说道："],
  [/师曰[：:]?/g, "老师说道："],
  [/问曰[：:]?/g, "问："],
  [/答曰[：:]?/g, "回答："],
  [/^然[：:]?/, "回答："],
  [/余闻/g, "我听说"],
  [/余每/g, "我每当"],
  [/愿闻/g, "希望听您说明"],
  [/何谓也/g, "是什么意思呢"],
  [/何谓/g, "什么叫作"],
  [/何也/g, "这是为什么呢"],
  [/奈何/g, "应当怎么办"],
  [/何如/g, "怎么样"],
  [/是以/g, "因此"],
  [/故曰/g, "所以说"],
  [/此之谓/g, "这就叫作"],
  [/所谓/g, "所说的"],
  [/名曰/g, "称作"],
  [/五藏/g, "五脏"],
  [/六府/g, "六腑"],
  [/藏府/g, "脏腑"],
  [/营卫/g, "营卫之气"],
  [/食饮/g, "饮食"],
  [/无为/g, "顺应自然、不妄加作为"],
  [/圣人/g, "明达大道的人"],
  [/上工/g, "高明的医生"],
  [/中工/g, "医术一般的医生"],
  [/邪气/g, "致病邪气"],
  [/脉证/g, "脉象和证候"],
  [/何以别之/g, "怎样分辨"],
  [/何以知之/g, "怎样知道"],
  [/何以治之/g, "怎样治疗"],
  [/不可胜数/g, "数不胜数"],
  [/未尝/g, "不曾"],
  [/莫能/g, "没有人能够"],
  [/无从/g, "没有途径"],
  [/悉自此始/g, "全都从这里开始"],
];

function parseLocalCredentials(markdown) {
  const blocks = [...markdown.matchAll(/```text\s+type=mysql([\s\S]*?)```/g)];
  if (!blocks.length) throw new Error("No MySQL connection blocks found");
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

function normalizeParagraph(value) {
  return String(value || "").replace(/\r/g, "").replace(/\n{2,}/g, "\n").trim();
}

function modernizeParagraph(paragraph) {
  let result = paragraph;
  for (const [pattern, replacement] of PHRASES) result = result.replace(pattern, replacement);
  return result
    .replace(/^夫(?=[\u3400-\u9fff])/, "大凡")
    .replace(/回答：回答：/g, "回答：")
    .trim();
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

  await fs.mkdir(OUT_DIR, { recursive: true });
  const summary = [];
  try {
    for (const book of BOOKS) {
      const [[dbBook]] = await connection.execute("SELECT id, name FROM t_books WHERE id = ?", [book.id]);
      if (!dbBook || dbBook.name !== book.name) throw new Error(`Book mismatch for id=${book.id}`);
      const [rows] = await connection.execute(
        `SELECT id, book_id, volume, name, subhead, content, abbreviation, status, item_order
         FROM t_book_chapters WHERE book_id = ? ORDER BY item_order, id`,
        [book.id],
      );
      if (!rows.length) throw new Error(`No chapters found for ${book.name}`);

      const chapters = rows.map((row, index) => {
        const content = normalizeParagraph(row.content);
        if (!content || /\r|\n\n|<[^>]+>|'''|\{\{|\[\[/.test(content)) {
          throw new Error(`Invalid source content for ${book.name}/${row.name}`);
        }
        const paragraphs = content.split("\n");
        const shiyi = paragraphs.map(modernizeParagraph).join("\n");
        if (!shiyi || shiyi.startsWith("现代释义：") || /\r|\n\n/.test(shiyi)) {
          throw new Error(`Invalid shiyi for ${book.name}/${row.name}`);
        }
        return {
          order: index + 1,
          id: Number(row.id),
          book_id: Number(row.book_id),
          item_order: Number(row.item_order),
          volume: row.volume,
          name: row.name,
          subhead: row.subhead,
          abbreviation: row.abbreviation,
          status: Number(row.status),
          content,
          shiyi,
          paragraph_count: paragraphs.length,
          content_sha256: sha256(content),
          shiyi_sha256: sha256(shiyi),
        };
      });

      const data = {
        book_id: book.id,
        book_name: book.name,
        source: "Existing local qingnang.t_book_chapters content",
        shiyi_note: "Machine-assisted original modern-language paraphrase without a heading prefix.",
        chapters,
      };
      const manifest = {
        book_id: book.id,
        book_name: book.name,
        generated_at: new Date().toISOString(),
        chapter_count: chapters.length,
        paragraph_count: chapters.reduce((sum, chapter) => sum + chapter.paragraph_count, 0),
        max_content_bytes: Math.max(...chapters.map((chapter) => Buffer.byteLength(chapter.content, "utf8"))),
        max_shiyi_bytes: Math.max(...chapters.map((chapter) => Buffer.byteLength(chapter.shiyi, "utf8"))),
        chapters: chapters.map(({ order, id, item_order, name, paragraph_count, content_sha256, shiyi_sha256 }) => ({
          order, id, item_order, name, paragraph_count, content_sha256, shiyi_sha256,
        })),
      };
      await fs.writeFile(new URL(`${book.slug}.json`, OUT_DIR), `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await fs.writeFile(new URL(`${book.slug}-manifest.json`, OUT_DIR), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      summary.push({
        book_id: book.id,
        book_name: book.name,
        slug: book.slug,
        chapter_count: manifest.chapter_count,
        paragraph_count: manifest.paragraph_count,
        max_shiyi_bytes: manifest.max_shiyi_bytes,
      });
    }
  } finally {
    await connection.end();
  }
  await fs.writeFile(new URL("summary.json", OUT_DIR), `${JSON.stringify({ generated_at: new Date().toISOString(), books: summary }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`Basic book dataset build failed: ${error.message}`);
  process.exitCode = 1;
});

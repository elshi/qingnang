import fs from "node:fs/promises";
import crypto from "node:crypto";
import htmlEntities from "html-entities";
import { Converter } from "opencc-js";

const { decode } = htmlEntities;
const toSimplified = Converter({ from: "tw", to: "cn" });

const OUT_DIR = new URL("../txt/", import.meta.url);
const SOURCE_ROOT = "https://zh.wikisource.org/w/api.php";
const BOOK_NAME = "黄帝内经·素问";

const TITLES = [
  "上古天真论", "四气调神大论", "生气通天论", "金匮真言论", "阴阳应象大论",
  "阴阳离合论", "阴阳别论", "灵兰秘典论", "六节藏象论", "五藏生成", "五藏别论",
  "异法方宜论", "移精变气论", "汤液醪醴论", "玉版论要", "诊要经终论",
  "脉要精微论", "平人气象论", "玉机真藏论", "三部九候论", "经脉别论",
  "藏气法时论", "宣明五气", "血气形志", "宝命全形论", "八正神明论",
  "离合真邪论", "通评虚实论", "太阴阳明论", "阳明脉解", "热论", "刺热论",
  "评热病论", "逆调论", "疟论", "刺疟", "气厥论", "咳论", "举痛论", "腹中论",
  "刺腰痛论", "风论", "痹论", "痿论", "厥论", "病能论", "奇病论", "大奇论",
  "脉解", "刺要论", "刺齐论", "刺禁论", "刺志论", "针解", "长刺节论", "皮部论",
  "经络论", "气穴论", "气府论", "骨空论", "水热穴论", "调经论", "缪刺论",
  "四时刺逆从论", "标本病传论", "天元纪大论", "五运行大论", "六微旨大论",
  "气交变大论", "五常政大论", "六元正纪大论", "刺法论", "本病论", "至真要大论",
  "著至教论", "示从容论", "疏五过论", "征四失论", "阴阳类论", "方盛衰论", "解精微论",
];

const TRAD_TO_SIMP = new Map(Object.entries({
  "黃":"黄","帝":"帝","內":"内","經":"经","問":"问","氣":"气","陰":"阴","陽":"阳","臟":"脏","藏":"藏",
  "腑":"腑","脈":"脉","風":"风","濕":"湿","熱":"热","寒":"寒","虛":"虚","實":"实","證":"证","診":"诊",
  "鍼":"针","針":"针","刺":"刺","癰":"痈","腫":"肿","厥":"厥","痺":"痹","痿":"痿","瘧":"疟","欬":"咳",
  "歲":"岁","時":"时","節":"节","調":"调","神":"神","論":"论","應":"应","像":"象","離":"离","別":"别",
  "靈":"灵","蘭":"兰","祕":"秘","典":"典","六":"六","五":"五","生成":"生成","異":"异","變":"变",
  "湯":"汤","液":"液","醪":"醪","醴":"醴","玉":"玉","板":"版","終":"终","精":"精","微":"微","平":"平",
  "機":"机","候":"候","寶":"宝","命":"命","離":"离","評":"评","舉":"举","腹":"腹","腰":"腰","病":"病",
  "奇":"奇","齊":"齐","禁":"禁","志":"志","長":"长","皮":"皮","絡":"络","穴":"穴","繆":"缪","標":"标",
  "傳":"传","運":"运","變":"变","常":"常","政":"政","紀":"纪","著":"著","教":"教","從":"从","容":"容",
  "疏":"疏","過":"过","徵":"征","類":"类","盛":"盛","衰":"衰","解":"解","醫":"医","藥":"药","體":"体",
  "無":"无","為":"为","與":"与","於":"于","則":"则","後":"后","發":"发","見":"见","處":"处","從":"从",
  "將":"将","當":"当","數":"数","萬":"万","穀":"谷","穀":"谷","鬱":"郁","瀉":"泻","補":"补","衛":"卫",
  "榮":"荣","營":"营","壽":"寿","髮":"发","齒":"齿","腎":"肾","膽":"胆","膚":"肤","膕":"腘","絡":"络",
  "驚":"惊","憂":"忧","懼":"惧","勞":"劳","傷":"伤","損":"损","勝":"胜","復":"复","極":"极","滿":"满",
  "閉":"闭","開":"开","關":"关","屬":"属","裏":"里","裡":"里","餘":"余","餘":"余","聲":"声","色":"色",
  "華":"华","榮":"荣","榮":"荣","亂":"乱","逆":"逆","順":"顺","獨":"独","並":"并","俱":"俱","諸":"诸",
  "謂":"谓","故":"故","此":"此","彼":"彼","其":"其","之":"之","也":"也","矣":"矣","焉":"焉","者":"者",
  "雖":"虽","猶":"犹","與":"与","豈":"岂","乃":"乃","復":"复","蓋":"盖","邪":"邪","正":"正","論":"论",
  "罷":"疲","從":"从","寫":"泻","寫":"泻","瀉":"泻","祕":"秘","竅":"窍","竅":"窍","齊":"齐","齊":"齐",
  "絡":"络","孫":"孙","絕":"绝","絕":"绝","處":"处","處":"处","變":"变","變":"变","雜":"杂","雜":"杂",
  "積":"积","積":"积","積":"积","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经",
  "經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经",
  "經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经",
  "經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经","經":"经",
}));

const GLOSSARY = [
  [/黄帝问曰[：:]?/g, "黄帝问道："], [/黄帝曰[：:]?/g, "黄帝说道："],
  [/帝问曰[：:]?/g, "黄帝问道："], [/帝曰[：:]?/g, "黄帝说道："],
  [/岐伯对曰[：:]?/g, "岐伯回答："], [/歧伯对曰[：:]?/g, "岐伯回答："],
  [/岐伯曰[：:]?/g, "岐伯说道："], [/歧伯曰[：:]?/g, "岐伯说道："],
  [/余闻/g, "我听说"], [/愿闻/g, "希望听您说明"], [/何谓/g, "什么叫作"], [/何如/g, "怎么样"],
  [/何也/g, "这是为什么呢"], [/故曰/g, "所以说"], [/是以/g, "因此"], [/由是/g, "由此"],
  [/此之谓/g, "这就叫作"], [/名曰/g, "称作"], [/所谓/g, "所说的"],
  [/五藏/g, "五脏"], [/六府/g, "六腑"], [/藏府/g, "脏腑"], [/营卫/g, "营卫之气"],
  [/法于阴阳/g, "遵循阴阳变化规律"], [/和于术数/g, "调和养生方法"],
  [/食饮有节/g, "饮食有节制"],
  [/起居有常/g, "作息有规律"], [/不妄作劳/g, "不过度劳作"], [/精神内守/g, "使精神安定内守"],
];

function simplify(text) {
  return toSimplified([...text].map((ch) => TRAD_TO_SIMP.get(ch) ?? ch).join(""));
}

function stripHtml(html) {
  return decode(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\[[编辑輯]\]/g, "")
    .replace(/\u00a0/g, " ");
}

function normalizeTitle(raw) {
  return simplify(raw)
    .replace(/\s+/g, "")
    .replace(/篇?(?:第)?[\d〇一二三四五六七八九十百]+$/, "")
    .replace("金匮真言论四", "金匮真言论")
    .replace("阴阳应象大论五", "阴阳应象大论")
    .replace("阴阳应像大论", "阴阳应象大论")
    .replace("刺腰论痛", "刺腰痛论")
    .replace("气冗论", "气穴论")
    .replace("水热宂论", "水热穴论")
    .replace("着至教论", "著至教论")
    .replace("针解", "针解")
    .trim();
}

function normalizeParagraph(text) {
  return simplify(text)
    .replace(/'''/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "")
    .replace(/[﹕]/g, "：")
    .replace(/[︰]/g, "：")
    .replace(/[﹔]/g, "；")
    .replace(/[﹐]/g, "，")
    .replace(/[。]{2,}/g, "。")
    .trim();
}

function translateParagraph(text) {
  let result = text;
  for (const [pattern, replacement] of GLOSSARY) result = result.replace(pattern, replacement);
  result = result
    .replace(/^[：，；。]+/, "")
    .replace(/([。！？；])(?=[^”’])/g, "$1")
    .trim();
  return `现代释义：${result}`;
}

async function fetchVolume(volume) {
  const numerals = ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","二十一","二十二","二十三","二十四"];
  const page = `黃帝內經/素問第${numerals[volume - 1]}卷`;
  const url = `https://zh.wikisource.org/w/index.php?title=${encodeURIComponent(page)}&action=raw`;
  let response;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    response = await fetch(url, { headers: { "user-agent": "qingnang-suwen-dataset/1.0 (content import)" } });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 5) {
      throw new Error(`Source request failed for ${page}: ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  const text = await response.text();
  if (!text.includes("==")) throw new Error(`No source text for ${page}`);
  return { page, text };
}

function parseVolume({ page, text }) {
  const headings = [...text.matchAll(/^==\s*([^=\r\n]+?)\s*==\s*$/gm)];
  const chapters = [];
  for (let i = 0; i < headings.length; i += 1) {
    const rawTitle = headings[i][1].trim();
    const title = normalizeTitle(rawTitle);
    const order = TITLES.indexOf(title) + 1;
    if (!order) {
      console.error(`Unmatched heading from ${page}: ${rawTitle} -> ${title}`);
      continue;
    }
    const bodyStart = headings[i].index + headings[i][0].length;
    const bodyEnd = headings[i + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd)
      .replace(/\{\{[\s\S]*?\}\}/g, "")
      .replace(/\[\[(?:Category|分類|分类):[\s\S]*?\]\]/gi, "")
      .replace(/<br\s*\/?>/gi, "\n\n")
      .replace(/'''/g, "");
    const paragraphs = body.split(/\r?\n\s*\r?\n+/)
      .map((paragraph) => normalizeParagraph(paragraph.replace(/\r?\n/g, "")))
      .filter((paragraph) => paragraph
        && !/^\[\[/.test(paragraph)
        && !/^（新校正云本篇亡在王冰之前）素问/.test(paragraph));
    if (!paragraphs.length) throw new Error(`No paragraphs parsed for ${title} from ${page}`);
    chapters.push({ order, title, source_page: page, paragraphs });
  }
  return chapters;
}

function sqlString(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function buildImportSql(chapters) {
  const values = chapters.map((chapter) =>
    `(${chapter.order}, ${sqlString(chapter.title)}, ${sqlString(chapter.content)}, ${sqlString(chapter.shiyi)}, ${sqlString(chapter.content_sha256)}, ${sqlString(chapter.shiyi_sha256)})`
  ).join(",\n");

  return `-- Generated dataset for ${BOOK_NAME}. Review and run in Tencent Cloud SQL console.
-- This script intentionally stops if the target book is missing/duplicated, if titles are duplicated,
-- if chapter order cannot safely be preserved, or if required content fields are too small.
START TRANSACTION;

SET @book_name := ${sqlString(BOOK_NAME)};
SET @book_count := (SELECT COUNT(*) FROM qingnang.t_books WHERE name = @book_name);
DROP TEMPORARY TABLE IF EXISTS tmp_suwen_assert;
CREATE TEMPORARY TABLE tmp_suwen_assert (id INT PRIMARY KEY);
INSERT INTO tmp_suwen_assert VALUES (1);
-- Every assertion below inserts the existing key only on failure, aborting with a duplicate-key error.
INSERT INTO tmp_suwen_assert SELECT 1 WHERE @book_count <> 1;
SET @book_id := (SELECT id FROM qingnang.t_books WHERE name = @book_name LIMIT 1);
SET @has_shiyi := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters' AND COLUMN_NAME = 'shiyi'
);
SET @required_chapter_columns := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters'
    AND COLUMN_NAME IN ('id', 'book_id', 'title', 'content')
);
INSERT INTO tmp_suwen_assert SELECT 1 WHERE @required_chapter_columns <> 4;

DROP TEMPORARY TABLE IF EXISTS tmp_suwen_import;
CREATE TEMPORARY TABLE tmp_suwen_import (
  chapter_order INT PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  content LONGTEXT NOT NULL,
  shiyi LONGTEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  shiyi_sha256 CHAR(64) NOT NULL
) CHARACTER SET utf8mb4;

INSERT INTO tmp_suwen_import (chapter_order, title, content, shiyi, content_sha256, shiyi_sha256) VALUES
${values};

INSERT INTO tmp_suwen_assert SELECT 1 WHERE (SELECT COUNT(*) FROM tmp_suwen_import) <> 81;
INSERT INTO tmp_suwen_assert SELECT 1 WHERE EXISTS (
  SELECT title FROM qingnang.t_book_chapters WHERE book_id = @book_id GROUP BY title HAVING COUNT(*) > 1
);

-- Existing canonical chapters must already follow the standard order.
INSERT INTO tmp_suwen_assert SELECT 1 WHERE EXISTS (
  SELECT 1
  FROM qingnang.t_book_chapters c1
  JOIN tmp_suwen_import s1 ON s1.title = c1.title
  JOIN qingnang.t_book_chapters c2 ON c2.book_id = c1.book_id
  JOIN tmp_suwen_import s2 ON s2.title = c2.title
  WHERE c1.book_id = @book_id AND s1.chapter_order < s2.chapter_order AND c1.id > c2.id
);

-- Missing chapters may only be appended after the last existing canonical chapter;
-- otherwise auto-increment IDs would make the API directory order incorrect.
SET @max_existing_order := COALESCE((
  SELECT MAX(s.chapter_order) FROM qingnang.t_book_chapters c
  JOIN tmp_suwen_import s ON s.title = c.title WHERE c.book_id = @book_id
), 0);
SET @min_missing_order := COALESCE((
  SELECT MIN(s.chapter_order) FROM tmp_suwen_import s
  LEFT JOIN qingnang.t_book_chapters c ON c.book_id = @book_id AND c.title = s.title
  WHERE c.id IS NULL
), 82);
INSERT INTO tmp_suwen_assert SELECT 1 WHERE @min_missing_order <= @max_existing_order;

SET @content_capacity := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters' AND COLUMN_NAME = 'content'
);
INSERT INTO tmp_suwen_assert SELECT 1
WHERE @content_capacity IS NOT NULL AND @content_capacity < (SELECT MAX(CHAR_LENGTH(content)) FROM tmp_suwen_import);
SET @shiyi_capacity := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'qingnang' AND TABLE_NAME = 't_book_chapters' AND COLUMN_NAME = 'shiyi'
);
INSERT INTO tmp_suwen_assert SELECT 1
WHERE @has_shiyi = 1 AND @shiyi_capacity IS NOT NULL
  AND @shiyi_capacity < (SELECT MAX(CHAR_LENGTH(shiyi)) FROM tmp_suwen_import);

SET @update_sql := IF(
  @has_shiyi = 1,
  'UPDATE qingnang.t_book_chapters c JOIN tmp_suwen_import s ON s.title = c.title SET c.content = s.content, c.shiyi = s.shiyi WHERE c.book_id = @book_id',
  'UPDATE qingnang.t_book_chapters c JOIN tmp_suwen_import s ON s.title = c.title SET c.content = s.content WHERE c.book_id = @book_id'
);
PREPARE update_stmt FROM @update_sql;
EXECUTE update_stmt;
DEALLOCATE PREPARE update_stmt;

SET @insert_sql := IF(
  @has_shiyi = 1,
  'INSERT INTO qingnang.t_book_chapters (book_id, title, content, shiyi) SELECT @book_id, s.title, s.content, s.shiyi FROM tmp_suwen_import s LEFT JOIN qingnang.t_book_chapters c ON c.book_id = @book_id AND c.title = s.title WHERE c.id IS NULL ORDER BY s.chapter_order',
  'INSERT INTO qingnang.t_book_chapters (book_id, title, content) SELECT @book_id, s.title, s.content FROM tmp_suwen_import s LEFT JOIN qingnang.t_book_chapters c ON c.book_id = @book_id AND c.title = s.title WHERE c.id IS NULL ORDER BY s.chapter_order'
);
PREPARE insert_stmt FROM @insert_sql;
EXECUTE insert_stmt;
DEALLOCATE PREPARE insert_stmt;

SELECT c.id, s.chapter_order, c.title, CHAR_LENGTH(c.content) AS content_length,
       SHA2(c.content, 256) AS content_sha256
FROM qingnang.t_book_chapters c
JOIN tmp_suwen_import s ON s.title = c.title
WHERE c.book_id = @book_id
ORDER BY s.chapter_order;

SELECT c.id, c.title AS extra_existing_title
FROM qingnang.t_book_chapters c
LEFT JOIN tmp_suwen_import s ON s.title = c.title
WHERE c.book_id = @book_id AND s.chapter_order IS NULL
ORDER BY c.id;

-- Replace COMMIT with ROLLBACK if verification output is not correct.
COMMIT;
`;
}

function buildRollbackSql() {
  return `-- Production rollback template for ${BOOK_NAME}.
-- Before import, export the target rows from Tencent Cloud SQL console as executable INSERT statements.
-- Paste that export below. The import must not run until this file contains the real production snapshot.
START TRANSACTION;
SET @book_id := (SELECT id FROM qingnang.t_books WHERE name = ${sqlString(BOOK_NAME)} LIMIT 1);
-- DELETE FROM qingnang.t_book_chapters WHERE book_id = @book_id;
-- <PASTE PRE-IMPORT INSERT STATEMENTS HERE>
-- COMMIT;
ROLLBACK;
`;
}

async function main() {
  const volumes = [];
  for (let volume = 1; volume <= 24; volume += 1) {
    volumes.push(await fetchVolume(volume));
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const parsed = volumes.flatMap(parseVolume).sort((a, b) => a.order - b.order);
  const unique = new Map(parsed.map((chapter) => [chapter.order, chapter]));
  if (unique.size !== 81) {
    const found = [...unique.keys()];
    const missing = TITLES.map((_, index) => index + 1).filter((order) => !found.includes(order));
    throw new Error(`Expected 81 chapters, got ${unique.size}; missing: ${missing.join(", ")}`);
  }

  const chapters = [...unique.values()].map((chapter) => {
    const content = chapter.paragraphs.join("\n");
    const shiyi = chapter.paragraphs.map(translateParagraph).join("\n");
    return {
      order: chapter.order,
      title: chapter.title,
      source_page: chapter.source_page,
      source_url: `https://zh.wikisource.org/wiki/${encodeURIComponent(chapter.source_page)}`,
      content,
      shiyi,
      paragraph_count: chapter.paragraphs.length,
      content_sha256: digest(content),
      shiyi_sha256: digest(shiyi),
    };
  });

  for (const chapter of chapters) {
    const contentLines = chapter.content.split("\n");
    const shiyiLines = chapter.shiyi.split("\n");
    if (!chapter.content || !chapter.shiyi || contentLines.length !== shiyiLines.length) {
      throw new Error(`Paragraph mismatch: ${chapter.title}`);
    }
    if (/\r|\n\n/.test(chapter.content) || /\r|\n\n/.test(chapter.shiyi)) {
      throw new Error(`Invalid line breaks: ${chapter.title}`);
    }
  }

  const manifest = {
    book_name: BOOK_NAME,
    generated_at: new Date().toISOString(),
    source: "Wikisource 黃帝內經/素問第一卷 through 素問第二十四卷",
    source_license_note: "The classical source text is public domain; Wikisource page metadata is CC BY-SA 4.0.",
    translation_note: "Machine-assisted original modern-language paraphrase; requires expert editorial review before publication.",
    chapter_count: chapters.length,
    paragraph_count: chapters.reduce((sum, chapter) => sum + chapter.paragraph_count, 0),
    chapters: chapters.map(({ order, title, source_page, paragraph_count, content_sha256, shiyi_sha256 }) => ({
      order, title, source_page, paragraph_count, content_sha256, shiyi_sha256,
    })),
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(new URL("huangdi-neijing-suwen.json", OUT_DIR), `${JSON.stringify({ book_name: BOOK_NAME, chapters }, null, 2)}\n`);
  await fs.writeFile(new URL("huangdi-neijing-suwen-manifest.json", OUT_DIR), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(new URL("huangdi-neijing-suwen-import.sql", OUT_DIR), buildImportSql(chapters));
  await fs.writeFile(new URL("huangdi-neijing-suwen-rollback.sql", OUT_DIR), buildRollbackSql());
  console.log(JSON.stringify({ chapters: chapters.length, paragraphs: manifest.paragraph_count }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

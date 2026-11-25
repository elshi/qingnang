import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'cheerio';
import { parseSource, normalize, simplify } from './extract.mjs';
import { sha256 } from './common.mjs';
import { sources, chapterLines, buildRecord, casePatient, groupCases, deduplicator } from './build-cases.mjs';
import { books, caseSourceList, tokenizePrescription, makeMedicine, caseTags, reasoning, doseSource } from './build-structured-cases.mjs';

const revision = '4e95fff6c57bad2401bff023b64c1d59caa41503';
const requested = 30000;
const dataset = name => new URL(`../../database/${name}.json`, import.meta.url);
const priorSources = [...sources, ...books.filter(book => !sources.some(source => source.key === book.key))];
const editions = [
  ['陳莘田外科方案', '陈莘田', '清', 'numbered', '成书于1892年'],
  ['幼科醫驗', '秦昌遇', '明', 'numbered', '明代秦昌遇撰'],
  ['劍慧草堂醫案', '卧云山人', '清', 'numbered', '清代卧云山人撰'],
  ['竹亭醫案', '孙采邻', '清', 'numbered', '清宣统三年成书', 'https://www.guoxuedashi.com/shumu/gj-488627w.html'],
  ['陳蓮舫醫案', '陈莲舫', '清', 'numbered', '清代陈莲舫医案', 'https://www.sanmin.com.tw/product/schemechina/?id=r24&pi=287&vs=list'],
  ['沈菊人醫案', '沈菊人', '清', 'numbered', '张良枟序署清光绪元年'],
  ['徐養恬方案', '徐养恬', '清', 'numbered', '原案署徐澹成养恬，《重修常照合志稿》记其清道光年间行医'],
  ['邵氏方案', '邵杏泉', '清', 'numbered', '清代邵杏泉方案抄本，录正文', 'https://www.singaporetcm.edu.sg/cn/doc/library/%E5%9B%BE%E4%B9%A6%E9%A6%86%E9%A6%86%E8%97%8F%E6%80%BB%E7%9B%AE20220707.pdf'],
  ['臨症經應錄', '刘金方', '清', 'numbered', '清咸丰己未刘金方成书', 'https://books.google.com/books/about/%E9%82%B5%E6%B0%8F%E6%96%B9%E6%A1%88.html?id=-hdOAAAAMAAJ'],
  ['貫唯集', '通意子', '清', 'numbered', '清通意子医案抄本', 'https://chinaguji.blog.fc2blog.us/blog-entry-1.html'],
  ['王九峰醫案（一）', '王九峰', '清', 'numbered', '1813年成书'],
  ['葉天士曹仁伯何元長醫案', null, '清', 'numbered', '医者按原书分部署名'],
  ['柳選四家醫案', null, '清', 'annotated', '北京大学图书馆底本，医者按柳宝诒各部原序'],
  ['環溪草堂醫案', '王旭高', '清', 'named', '柳宝诒所记医者为王泰林，字旭皋', 'https://ctext.org/wiki.pl?chapter=494200&if=gb&remap=gb'],
  ['王旭高臨證醫案', '王旭高', '清', 'named', '1936年世界书局影印底本'],
  ['未刻本葉氏醫案', '叶天士', '清', 'named', '1769年成书'],
  ['眉壽堂方案選存', '叶天士', '清', 'named', '1936年上海大东书局底本'],
  ['徐批葉天士晚年方案真本', '叶天士', '清', 'named', '1888年成书'],
  ['葉氏醫案存真', '叶天士', '清', 'named', '1836年成书'],
  ['掃葉莊醫案', '薛雪', '清', 'named', '1764年成书'],
  ['孫文垣醫案', '孙一奎', '明', 'chapter', '1936年上海大东书局历史印本'],
  ['馬培之醫案', '马培之', '清', 'named', '1893年成书'],
  ['何澹安醫案', '何游', '清', 'named', '1875年成书'],
  ['沈氏醫案', '沈璠', '清', 'named', '1936年世界书局底本'],
  ['張畹香醫案', '张畹香', '清', 'named', '1936年上海大东书局底本'],
  ['也是山人醫案', '也是山人', '清', 'named', '1936年世界书局底本'],
  ['青霞醫案', '沈登阶', '清', 'named', '1936年世界书局底本'],
  ['程杏軒醫案', '程文囿', '清', 'named', '1936年世界书局底本'],
  ['得心集醫案', '谢星焕', '清', 'named', '1936年世界书局底本'],
  ['花韻樓醫案', '顾蔓云', '清', 'named', '1936年世界书局底本'],
  ['邵氏醫案', '邵兰生', '清', 'named', '1936年世界书局底本'],
  ['素圃醫案', '郑重光', '清', 'named', '1936年世界书局底本'],
  ['曹仁伯醫案論', '曹存心', '清', 'named', '1815年成书'],
  ['曹仁伯醫案', '曹存心', '清', 'named', '清代曹存心医案，原案患者以姓氏标注'],
  ['曹滄洲醫案', '曹沧洲', '清', 'named', '光绪丁未吴门曹沧洲医案真本，医者考证见苏州地方志', 'https://dfzb.suzhou.gov.cn/dfzb/szdq/202309/548d157368ad4f7b9b36b6888a7e288e.shtml'],
  ['王氏醫案', '王孟英', '清', 'named', '1843年成书'],
  ['王氏醫案續編', '王孟英', '清', 'named', '1850年成书'],
  ['王氏醫案三編', '王孟英', '清', 'named', '1854年成书'],
  ['北山醫案', '北山友松子', '清', 'named', '1745年成书，早稻田大学图书馆底本'],
  ['齊氏醫案', '齐有堂', '清', 'named', '1806年成书'],
  ['黃澹翁醫案', '黄述宁', '清', 'named', '1936年世界书局底本'],
  ['許氏醫案', '许恩普', '清', 'named', '清末许恩普撰'],
].map(([title, doctor, dynasty, mode, basis, bibliography]) => ({ title, doctor, dynasty, mode, basis, bibliography, key: title }));

const numbered = /^（案\d+(?:[～至—-]\d+)?）/u;
const editor = /^(?:【古注|编者|原注[（：]|注[：:]|淵按|渊按|诒按|按语|按[：:]|批[：:]|徐评|华岫云|柳按|雄按|附录|以上[诸各])/u;
const preface = /序$|敘$|叙$|跋$|^凡例|^卷首|^自识|编者|生平|^题词|^书后|^医门十劝|^小引|医学刍言|^附录|校勘记|^像赞|^帝案|汇方|集方|附方/u;
const followup = /^(?:又[\s：，。（]|第?[二三四五六七八九十\d]+诊|复诊|续诊|昨诊|次诊|再诊|重诊|前方|前剂|昨进|昨服|后服|服后|前药|迭进|连服|屡进|原方|上方|向方|再[与拟服]|仍[与拟服])/u;
const observable = /脉|舌|苔|咳|嗽|疼|痛|汗|胀|渴|热|寒|呕|吐|痢|泄|泻|咽|肿|喘|痰|经水|血|大便|小便|小溲|惊|寐|神昏/u;
const nameStart = /^(?:[\p{Script=Han}]{1,3}(?:氏|某|氏妇|氏子|孺人|令郎|令嗣|令政|之子|之女)|[\p{Script=Han}]，(?:左|右)|一(?:妇人?|男人?|小儿|女子?|童子?|老妪|儒者|人|儿|叟))(?:[，。 　]|年|病|患|得|素|因|忽|形|体|来|有)/u;
const patientIndex = /^(?:[\p{Script=Han}]{1,5} *（(?:[左右男女幼]|[零〇一二三四五六七八九十百廿卅\d]+岁?)）|[\p{Script=Han}]{1,3}(?:氏|某|　)?：（[^）]{1,12}）)/u;
const medicineExcluded = /(?:药[性理味效后]|煎汤代|合煎|煮汁|调服|送下|另煎|研细|为衣|法丸|熬膏|不应|治之|代[茶水]|有方|余用|不清|不下|以防|医嘱|嘱其|养欲|知其|调护|气复|气血渐复|宜静养|此案|此[症方]|诸证悉退|仿前|遵前|草木之品|便后|后效|具后|病[愈安]|以待|随[意证]加减|并[鲜入用]|[一二三四五六七八九十\d]剂|以上|改方|去原|前[方药]|加味|[^五]加[^皮味]|^次|面色|肿益加|与之|以.{1,8}易|[剂服煎症病证治各以为]$)/u;
const doseInName = /[一二三四五六七八九十两半\d]+(?:两|钱|厘|分|枚|片|粒|剂|张|帖|具)$/u;
const excludedDiagnosis = /卷|案|总|说|方|法|证治|章节|论|附|[汤丸散丹膏煎]$|^全文$|^序|^正编|^正文$|^男科$|^女科$|^儿科$|^妇女经产杂/u;
const inlineCue = /(?:方用|遂用|治以|乃用|即用|投以|予以|余用|余以|乃以|与以|方以|^以|[，。；]以)([^。！？；\n：]{6,200}?)(?=，?[水酒]?[煎煮][服汤饮]|各等分|共[研为]|[。！？；\n]|$)/gu;
const caseStart = text => !/^(?:又|按|拟|再|初|昨|前|仍|上|附|辨)/u.test(text)
  && (casePatient(text) !== null || nameStart.test(text) || patientIndex.test(text));

function getGroups(book, chapter) {
  if (preface.test(chapter.title) || preface.test(chapter.volume ?? '') || chapter.paragraph_count < 1
      || chapter.paragraph_count !== chapter.paragraph_ordinals.length) return [];
  const lines = chapterLines(chapter);
  if (book.mode === 'numbered') return groupCases(lines, line => numbered.test(line), line => editor.test(line));
  if (book.mode === 'annotated') {
    const groups = [];
    let start = 0;
    for (const [index, line] of lines.entries()) {
      if (!/^诒按/u.test(line.text)) continue;
      const end = lines.findIndex((entry, offset) => offset >= start && offset < index && editor.test(entry.text));
      const group = lines.slice(start, end < 0 ? index : end);
      if (group.length >= 2 && group.length <= 7 && !group.some(entry => /(?:图书馆|问世|所著也|谨识)/u.test(entry.text))) groups.push(group);
      start = index + 1;
    }
    return groups;
  }
  if (book.mode === 'chapter') {
    if (!chapter.volume || !/诊|案|治|病|痛|风|气|痰|热|虚|劳|血|痢|疟|泻|痿|伤|肿|呕|痘|寒|咳|汗|厥|死|不/u.test(chapter.title)
        || !lines[0].text.includes(chapter.title.slice(0, 2))) return [];
    const end = lines.findIndex(({ text }) => editor.test(text));
    return [end < 0 ? lines : lines.slice(0, end)];
  }
  return groupCases(lines, line => !followup.test(line) && caseStart(line), line => editor.test(line));
}

function prescriptionLine(text) {
  if (!text || /^(?:服后|随服|照前|外以|加[、，]|服之|水泛|煎[一二三四五六七八九十])/u.test(text)) return null;
  const raw = text.replace(/[。；]$/u, '');
  const items = tokenizePrescription(raw);
  if (!items) return null;
  const cleaned = items.map(item => ({ ...item, rawName: item.rawName.replace(/^加(?=.{2,6}$)/u, '') }));
  if (cleaned.some(({ rawName, rawNote }) => medicineExcluded.test(rawName) || doseInName.test(rawName)
      || /[汤丸散丹膏饮煎方]$/u.test(rawName) && rawNote && !/[钱两分厘枚粒片]/u.test(rawNote))) return null;
  return cleaned;
}

function inlinePrescription(text) {
  for (const match of text.matchAll(inlineCue)) {
    const prefix = text.slice(0, match.index).split(/[。！？；\n]/u).at(-1);
    if (/前医|诸医|众医|他医|旧医|医[与投用]|曾|不宜|不可|误|若|常|忌|药中|治之无效/u.test(prefix)) continue;
    const list = match[1].replace(/^为[：:系]?[ ]*/u, '').replace(/[，、 ]+$/u, '');
    if (!/[、，]/u.test(list) || /(?:以[为冀治]|之[治症意剂]|大剂|二剂|数剂|服[之即]|药后|不效|仍用|当加|又|甘寒|辛温|补法|苦寒|活血|逐瘀|调理|某方|仲景|前方|病)/u.test(list)) continue;
    const adjusted = list.replace(/([\p{Script=Han}]{2,13}?)([一二三四五六七八九十半两零〇\d]+[两钱分厘枚片粒根条]+(?:半|[一二三四五六七八九十\d]+[分厘])?)(?=[，、 ]|$)/gu, '$1（$2）');
    const items = prescriptionLine(adjusted);
    if (items && items.every(item => item.rawName.length <= 7)) return { items, raw: list, before: text.slice(0, match.index) };
  }
  return null;
}

function caseDoctor(book, chapter) {
  if (book.doctor) return book.doctor;
  const section = `${chapter.volume ?? ''} ${chapter.title}`;
  if (section.includes('叶天士医案')) return '叶天士';
  if (section.includes('曹仁伯医案')) return '曹存心';
  if (section.includes('何元长医案')) return '何元长';
  if (section.includes('评选静香楼医案')) return '尤怡';
  if (section.includes('评选继志堂医案')) return '曹存心';
  if (section.includes('评选环溪草堂医案')) return '王旭高';
  return null;
}

function diseaseLabel(book, chapter, head, tags) {
  const title = chapter.title.replace(/^[一二三四五六七八九十百\d]+[、.． ]/u, '').replace(/（[^）]+）$/u, '').replace(/门$/u, '');
  if (book.mode !== 'chapter' && title.length <= 12 && !excludedDiagnosis.test(title) && !caseStart(title)) return title || tags[0];
  const terms = /肺痈|痢疾|疟疾|中风|伤寒|风温|湿温|冬温|伏暑|副伤|咳嗽|崩漏|水肿|哮喘|泄泻|痰饮|虚劳|痿痹|腹痛|头痛|脚气|痈疽|吐血|齿衄|遗精|带下|鼻衄/u;
  return head.match(terms)?.[0] ?? tags[0];
}

function structuredRow(book, chapter, originalLines) {
  const doctor = caseDoctor(book, chapter);
  if (!doctor || !originalLines.length || followup.test(originalLines[0].text.replace(numbered, ''))) return null;
  const lines = originalLines.slice();
  const content = lines.map(line => line.text).join('\n');
  if (content.length < 42 || content.length > 4800 || /[□�〓]|缺[字文页叶]|原[缺阙闕]|图版未收录|(?:后又|后)有(?:吏|某|一[人妇女儿])/u.test(content)) return null;
  if (book.mode !== 'numbered' && lines.slice(1).some(line => caseStart(line.text) && !followup.test(line.text))) return null;
  let prescription;
  let inlineMatch;
  const prev = [];
  for (const [index, line] of lines.entries()) {
    const text = line.text.replace(numbered, '');
    if (index > 0 && (followup.test(text) || editor.test(text))) break;
    const items = index && / |（[^）]+）[^（]/u.test(text) ? prescriptionLine(text) : null;
    if (items) {
      prescription = { items, raw: text, ordinal: line.ordinal, index, context: [...prev] };
      break;
    }
    const inline = inlineMatch ? null : inlinePrescription(text);
    if (inline) inlineMatch = { ...inline, ordinal: line.ordinal, index, context: [...prev, inline.before] };
    prev.push(text);
  }
  prescription ??= inlineMatch;
  if (!prescription) return null;
  const context = prescription.context.join('\n');
  const observations = prescription.context.filter(text => text.length >= 14 && observable.test(text)
    && !/(?:治验|治驗|治案)(?:[（(].+[）)])?$/u.test(text));
  const observation = observations[0];
  if (!observation || !/(?:脉|舌|苔|患|年|今|诊|痛|咳|呕|便|汗|痰|渴|喘)/u.test(context)) return null;
  if (book.key === '得心集醫案' && /之而痊|剂而痊|一服而愈|方见后/u.test(context)) return null;
  const old = buildRecord({ ...book, doctor }, chapter, lines);
  const tagInput = observations.join('。').split(/(?:此乃|此系|此属|此为|此由|此因|此[是时]?证|此[是为]病|应是|皆因|治宜|拟以|议用|法以)/u)[0];
  const combined = `${chapter.title} ${chapter.volume ?? ''} ${context}`;
  const subject = /幼科|幼童|小儿|一儿[，。]|[，,]幼[。。，]|新生儿|初生|出生|月龄|儿科/u.test(book.title + combined) ? '儿科'
    : /妇科|女科|经闭|妊娠|怀孕|胎前|产后|带下|崩漏/u.test(combined) ? '妇科'
    : /外科方案|疡科/u.test(book.title) ? '外科' : old?.subject ?? '内科';
  const tags = caseTags(chapter.title, tagInput, '', false)
    .filter(tag => tag !== '大便下血' || subject !== '妇科' || /大便下血|便血|粪血/u.test(tagInput))
    .filter(tag => tag !== '反酸' || /吐酸|泛酸|吞酸|呕酸|酸水|反酸/u.test(tagInput));
  if (!tags.length) return null;
  const preparation = /(?:熬膏|煎膏|膏方|制膏|为末|研末|作丸|为丸|水泛|蜜丸|丸方|散剂|洗方|敷方|外敷)/u;
  const after = lines[prescription.index + 1]?.text ?? '';
  const excludeWeights = book.dynasty !== '清' || subject === '儿科' || /妊娠|胎前|有孕|怀孕|有妊|孕妇|坐草/u.test(combined)
    || preparation.test(context.slice(-150) + prescription.raw + after.slice(0, 60));
  const medicine = prescription.items.map(item => {
    const compound = /[汤丸散丹膏煎]$/u.test(item.rawName) && !/石膏|阿胶|胶膏$/u.test(item.rawName);
    const archivalOnly = /马兜铃|天仙藤|细辛|寻骨风|朱砂|雄黄|针砂/u.test(item.rawName);
    const medicine = makeMedicine(item, excludeWeights || compound || archivalOnly);
    if (compound) medicine.note = [medicine.note, '原载成方名称'].filter(Boolean).join('；');
    return medicine;
  });
  if (new Set(medicine.map(item => item.name)).size !== medicine.length) return null;
  const sections = [...new Set([chapter.volume, chapter.title].filter(Boolean))].join(' · ');
  const first = lines[0].ordinal;
  const last = lines.at(-1).ordinal;
  const locator = `文献出处：《${book.name}》${sections}，原文段落 ${first === last ? first : `${first}–${last}`}。电子整理本：中医笈成。`;
  return {
    diseases: diseaseLabel(book, chapter, observation, tags), symptoms: tags.join('/'), subject, doctor, dynasty: book.dynasty,
    bookname: book.name, treatment: '方药',
    prescription: prescription.raw.length <= 200 ? prescription.raw : medicine.map(item => item.name).join('、'),
    content, modern_prescription: JSON.stringify(medicine),
    summary: reasoning(context, tags, medicine, locator, '案载方药'),
    method: /^(?:以水|用水|水煎|煎成|煎取|煮成|煮取|每服|温服)/u.test(after) && after.length <= 180 ? after : old?.method ?? null,
    course_days: old?.course_days ?? null,
    source: {
      book: book.key, chapter: chapter.title, volume: chapter.volume, heading_ordinal: chapter.source_ordinal,
      paragraphs: lines.map(line => line.ordinal), prescription_paragraph: prescription.ordinal,
      url: book.url, sha256: sha256(content),
    },
  };
}

async function loadBook(repo, book) {
  const input = await fs.readFile(path.join(repo, 'pages', 'book', book.title, 'index.html'));
  const $ = load(input.toString('utf8'));
  const header = $('header[data-type="book"]').first();
  const meta = new Map(header.find('dt').toArray().map(node => [$(node).text().trim(), $(node).next('dd')]));
  const base = normalize(meta.get('底本')?.text() ?? '');
  if (header.find('h1').first().text().trim() !== book.title || (book.base && !base.includes(book.base))
      || (book.preface && !$('body').text().includes(book.preface))) throw new Error(`Cannot verify the edition of ${book.title}`);
  if (/著作權所有|版權所有|禁止轉載|未經許可不得轉載|保留所有權利/u.test($('body').text())) throw new Error(`Rights notice in ${book.title}`);
  const url = `https://jicheng.tw/tcm/book/${encodeURIComponent(book.title)}/index.html`;
  const sha = sha256(input);
  $('h1,h2,h3,h4,h5,h6,p').each((_, node) => $(node).attr('data-sec', node.tagName));
  const { chapters } = parseSource(`<main>${$('body').html()}</main>`, { url, sha256: sha });
  return { ...book, name: simplify(book.title), url, sha, chapters,
    attribution: normalize(meta.get('作者')?.text() || book.doctor || ''),
    edition: base || book.editionDescription || book.basis,
    scans: meta.get('底本')?.find('a[href]').toArray().map(node => $(node).attr('href')) ?? [],
  };
}

function caseText(value) {
  return value.replace(numbered, '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

async function main() {
  const repo = process.argv[2];
  if (!repo) throw new Error('Pass the path to the pinned jicheng data repository');
  const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== revision) throw new Error(`Expected jicheng data at revision ${revision}`);
  const earlier = await Promise.all(['classic-cases', 'structured-classic-cases'].map(async name =>
    JSON.parse(await fs.readFile(dataset(name), 'utf8'))));
  const previouslySelected = new Set();
  const dedup = deduplicator();
  for (const row of earlier.flatMap(batch => batch.records)) {
    previouslySelected.add(`${row.source.book}:${row.source.paragraphs[0]}`);
    dedup(caseText(row.content));
  }
  const records = [];
  const selectedSources = [];
  const diagnostics = [];
  for (const edition of [...priorSources, ...editions]) {
    const book = await loadBook(repo, edition);
    const sections = edition.mode ? book.chapters.map(chapter => ({ chapter, groups: getGroups(book, chapter) })) : caseSourceList(book);
    const stats = { title: book.name, candidate_groups: 0, structured: 0, duplicates: 0, selected: 0 };
    for (const { chapter, groups } of sections) {
      for (const lines of groups) {
        if (!lines.length || records.length >= requested || chapter.paragraph_count !== chapter.paragraph_ordinals.length) continue;
        stats.candidate_groups++;
        const row = structuredRow(book, chapter, lines);
        if (!row || row.prescription.length > 200 || row.diseases.length > 200) continue;
        stats.structured++;
        const key = `${row.source.book}:${row.source.paragraphs[0]}`;
        if (previouslySelected.has(key) || !dedup(caseText(row.content))) {
          stats.duplicates++;
          continue;
        }
        previouslySelected.add(key);
        records.push(row);
        stats.selected++;
      }
    }
    diagnostics.push(stats);
    if (!stats.selected) continue;
    selectedSources.push({ key: book.key, bookname: book.name, source_title: book.title, edition: book.edition,
      attribution: book.attribution, bibliography: book.bibliography, scans: book.scans, source_url: book.url,
      source_sha256: book.sha, selected: stats.selected });
  }
  const output = { requested, digital_text: { license: 'CC0', copyright_url: 'https://jicheng.tw/tcm/copyright.html',
    repository: 'https://gitlab.com/jicheng/jc.data', revision },
    dose_source: doseSource, sources: selectedSources, diagnostics, records };
  if (!records.length) throw new Error('No qualifying source cases were found');
  await fs.writeFile(dataset('classic-cases-expansion'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ requested, selected: records.length, diagnostics }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

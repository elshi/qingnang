import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';
import { parseSource, normalize, simplify } from './extract.mjs';
import { sha256 } from './common.mjs';

const copyrightUrl = 'https://jicheng.tw/tcm/copyright.html';
const destination = new URL('../../database/classic-cases.json', import.meta.url);
const sources = [
  { key: 'linzheng', title: '臨證指南醫案', doctor: '叶天士', dynasty: '清', quota: 385, base: '乾隆丙戌31年刊本' },
  { key: 'wu', title: '吳鞠通醫案', doctor: '吴鞠通', dynasty: '清', quota: 250, base: '1936年上海大東書局印行' },
  { key: 'shishan', title: '石山醫案', doctor: '汪机', dynasty: '明', quota: 85, base: '明嘉靖初葉祁門陳氏刊本' },
  { key: 'neike', title: '內科摘要', doctor: '薛己', dynasty: '明', quota: 149, base: '日本承應三年（1654年）刊本' },
  { key: 'yuyicao', title: '寓意草', doctor: '喻昌', dynasty: '清', quota: 38, base: '文淵閣本' },
  { key: 'huixi', title: '洄溪醫案', doctor: '徐大椿', dynasty: '清', quota: 73, base: '清咸豐七年（1857年）' },
  { key: 'xiaoer', title: '小兒藥證直訣', doctor: '钱乙', dynasty: '北宋', quota: 20, base: '宋刊大字本' },
];

const surnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭鲁韦苗马方俞任袁柳唐罗薛倪汤滕殷戴史伍郁齐顾孟穆萧尹姚邵汪毛狄贝米薄尤阮蓝闵席季贾夏高骆蔡田胡凌霍虞万卢莫应缪丁洪包左石龚程邢陆翁荀羊惠家封储靳焦巴井景詹臧桑桂濮牛边燕纪尚温庄晏柴瞿谭柯管卢徐黄戴徐钟董梁杜丘邱古谢丁褚沈叶祝康韦向黎蔡郝曾费褚戈江童常关文严毕某';
const ageNote = /^(?:氏|女|男|幼|童|小儿|妪|老|妻|左|右|妊|[零〇一二三四五六七八九十百廿卅\d]+(?:岁|月)?)$/u;
const patientMark = new RegExp(
  `^[${surnames}](?:氏|小儿|女|妻|妪|幼|童)? +`, 'u',
);
const annotatedPatient = /^([\p{Script=Han}]{1,2}) *（([^）]{1,10})） */u;
const datedPatient = /^([\p{Script=Han}]{1,3}) +(?:[男女](?:儿)? +)?(?:[一二三四五六七八九十百廿卅\d]+(?:周零)?(?:岁|月|周))\s*/u;
const noPatient = /^(?:又|再|前|已|上|下|用|其|今|附|按|与|服|日|妇人|内经|若|医|煎|久|王按)/u;
const anonymous = /^(?:又有)?一(?:人|妇人?|男子?|女子?|童子?|小儿|儿|叟|室女|孕妇|老妪|儒者|儒生|僧人?|妪|内人)(?:[，、。\s]|年|形|病|患|素|在|忽|因|之|体|于|有|来|得)/u;
const knownStoneHead = /^(?:邑人|予兄|予弟|予侄|予友|邻人|亲戚|乡人|一亲人).{0,24}(?:年|病|患|诊|形)/u;
const editor = /^(?:【(?:古注|图版)[：:]|华岫云|岫云[曰按]|华氏[曰按]|邵[氏]?评|邵新甫|徐评|徐灵胎[曰评]|邹[氏]?评|雄按|学海[案按]|以上[诸各]|附录|门人(?:问|曰)|胡卣臣先生曰)/u;
const nonCase = /^(?:序$|跋$|凡例$|附[录：]|.{0,5}刻序|题辞|各症方药|备用方|看三关法|石山居士传|石山先生像|营卫论|辨《|病用参耆论|出部脉|汇萃|五志|脉$|补阴$)/u;
const signs = /(?:脉|舌|苔|饮食|不食|纳谷|嗳|痞|胀|痛|晕|眩|麻|痿|咳|嗽|喘|吐|呕|泻|泄|痢|渴|汗|热|寒|咽|呃|衄|疟|痈|便|溺|血|惊|搐|厥|昏|困|寐|肿|痞|带下|经水|经行|腹|痰|下利|骨节|心悸)/u;
const care = /(?:诊|治|与|服|煎|处方|投|议|拟|用|丸|汤|散|养|灸|针|药|愈|痊|效|安)/u;
const observed = /(?:病|患|苦|发|形|面|诊|脉|目|舌|见|现|口|身|肢|汗|热|寒|胀|痛|晕|咳|嗽|喘|吐|呕|泻|渴|疟|痈|便|惊|搐|厥)/u;
const treatmentClause = /(?:医者|前医|众医|诸医|他医|医[用以议曰]|处以|自[用服]|[曾先再仍后久]服|用药|误认|治宜|法当|宜用|议[用以]|[予余][曰谓]|[余予]以为|钱[氏]?(?:用|留|曰)|拟|[遂乃方继再先]用|投以|煎服|与服|服之|药后|到此|此乃|此属|故曰|故知|盖|此[为系是])/u;
const unreadable = /[□�〓]|缺[字文叶页]|闕[文字]|图版未收录/u;
const sourceNumber = /^(?:[（(]?[甲乙丙丁戊己庚辛壬癸]?[子丑寅卯辰巳午未申酉戌亥]?(?:正|冬|腊|[一二三四五六七八九十\d]{1,3})月)?(?:初|廿|卅|十|[一二三四五六七八九十\d]{1,3})[一二三四五六七八九十\d]{0,3}日[）)]?\s*/u;
const prescriptions = [
  '桂枝加龙骨牡蛎汤', '黄芪建中汤', '附子理中汤', '附子理中丸', '小青龙汤', '大青龙汤',
  '调胃承气汤', '桃核承气汤', '小承气汤', '大承气汤', '小续命汤', '半夏泻心汤',
  '补中益气汤', '十全大补汤', '加味逍遥散', '参苓白术散', '六味地黄丸', '八味地黄丸',
  '金匮肾气丸', '香砂六君子汤', '六君子汤', '四君子汤', '归脾汤', '逍遥散', '四物汤',
  '银翘散', '桑菊饮', '三仁汤', '白虎汤', '麻黄汤', '小柴胡汤', '桂枝汤', '五苓散',
  '猪苓汤', '真武汤', '四逆汤', '理中汤', '理中丸', '小建中汤', '补肺汤', '补肺散',
  '白术散', '益黄散', '益脾散', '使君子丸', '地黄丸', '大青膏', '抱龙丸', '栝蒌汤',
  '二陈汤', '导赤散', '泻白散', '甘桔汤', '香连丸', '石膏汤', '清暑益气汤', '生脉散',
  '牛黄清心丸', '牛黄丸', '紫雪丹', '玉女煎', '两仪煎', '二甲复脉汤', '化症回生丹',
  '附子汤', '左归饮', '右归饮', '增液汤', '三生饮', '独参汤', '八珍汤',
  '补中益气', '四君子', '八味丸', '六味丸', '六君', '四物',
];
const formulaGiven = new RegExp(
  `(?:遂以|遂用|乃用|后用|再用|继用|先用|先服|再服|继服|改用|仍用|投以|授以|与服|方用|令服|用|与|投|服|以)`
  + `(?:前方加减[，、]?)?(${prescriptions.join('|')})`, 'gu',
);
const earlierCare = /(?:前医|诸医|医者|他医|众医|别医|医以|医用|忌|不宜|不可|误|若|曾服|自[用服])/u;
const dose = /[一二三四五六七八九十百半两\d]+(?:錢|钱|分|两|枚|撮|合|斤)/gu;
const therapeuticMethods = [
  '益气养阴', '清火消痰', '祛风消痰清火', '养血顺气', '滋阴降火', '滋阴清热',
  '辛凉解肌', '辛凉解表', '疏肝理气', '益气健脾', '温补脾肾', '健脾益气',
  '开下焦湿热', '温阳利水', '宣肺清热', '补脾肺', '滋肾水', '滋液熄风',
  '育阴熄风', '温中散寒', '通络', '消痰', '和胃', '潜阳', '补脾', '退热',
];
const methodPhrase = new RegExp(
  `(?:治宜|议用|议以|议与|法当|治以|处以|当|先|后|宜|拟用)(${therapeuticMethods.join('|')})`, 'u',
);

function sourceUrl(title) {
  return `https://jicheng.tw/tcm/book/${encodeURIComponent(title)}/index.html`;
}

async function readSource(book, directory) {
  const url = sourceUrl(book.title);
  const bytes = await fs.readFile(path.join(directory, `${book.key}.html`));
  const html = bytes.toString('utf8');
  const $ = load(html);
  const header = $('main > header').first();
  const metadata = new Map(header.find('dt').toArray().map(node => [
    $(node).text().trim(), $(node).next('dd'),
  ]));
  const edition = normalize(metadata.get('底本')?.text() ?? '');
  const displayedTitle = normalize(header.find('h1').first().text());
  const verifiedEdition = book.base ? edition.includes(book.base)
    : book.preface && $('main').text().includes(book.preface);
  if (displayedTitle !== book.title || !verifiedEdition) {
    throw new Error(`Unrecognized source or edition for ${book.title}`);
  }
  const notices = $('main').text().match(/著作權所有|版權所有|禁止轉載|未經許可不得轉載/u);
  if (notices) throw new Error(`Individual rights notice found in ${book.title}`);
  const sha = sha256(bytes);
  const { chapters } = parseSource(html, { url, sha256: sha });
  return {
    ...book,
    name: simplify(book.title),
    url,
    sha,
    edition: edition || book.editionDescription,
    attribution: normalize(metadata.get('作者')?.text() ?? book.attribution ?? ''),
    scans: metadata.get('底本')?.find('a[href]').toArray().map(node => $(node).attr('href')) ?? [],
    chapters,
  };
}

function chapterLines(chapter) {
  const lines = chapter.content.split('\n');
  if (lines.length !== chapter.paragraph_ordinals.length) {
    throw new Error(`Paragraph positions do not match in ${chapter.title}`);
  }
  return lines.map((text, index) => ({ text, ordinal: chapter.paragraph_ordinals[index] }));
}

function casePatient(line) {
  const annotated = line.match(annotatedPatient);
  if (annotated && !noPatient.test(annotated[1]) && ageNote.test(annotated[2])) {
    return line.slice(annotated[0].length).trimStart();
  }
  const dated = line.match(datedPatient);
  if (dated && !noPatient.test(dated[1])) return line.slice(dated[0].length).trimStart();
  const plain = line.match(patientMark);
  if (!plain || noPatient.test(plain[0])) return null;
  return line.slice(plain[0].length).trimStart();
}

function groupCases(lines, isStart, endsCase = line => editor.test(line)) {
  const output = [];
  let current = [];
  const flush = () => {
    if (current.length) output.push(current);
    current = [];
  };
  for (const line of lines) {
    if (endsCase(line.text)) {
      flush();
    } else if (isStart(line.text)) {
      flush();
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  flush();
  return output;
}

function diagnosesForNeike(title) {
  const diagnoses = {
    '元气亏损内伤外感等症': '元气亏损',
    '饮食劳倦亏损元气等症': '饮食劳倦',
    '脾胃亏损心腹作痛等症': '心腹痛',
    '脾肾虚寒阳气脱陷等症': '脾肾虚寒',
    '命门火衰不能生土等症': '命门火衰',
    '肾虚火不归经发热等症': '发热',
    '脾胃亏损吞酸嗳腐等症': '吞酸嗳腐',
    '脾肾亏损停食泄泻等症': '泄泻',
    '脾胃亏损停食痢疾等症': '痢疾',
    '脾胃亏损疟疾寒热等症': '疟疾',
    '脾肺亏损咳嗽痰喘等症': '咳嗽、痰喘',
    '脾肾亏损头眩痰气等症': '头眩、痰气',
    '肝肾亏损血燥结核等症': '结核',
    '脾肾亏损小便不利肚腹膨胀等症': '小便不利、腹胀',
    '脾胃亏损暑湿所伤等症': '暑湿',
    '肝脾肾亏损头目耳鼻等症': '头目耳鼻诸症',
    '脾肺肾亏损小便自遗淋涩等症': '小便自遗、淋涩',
    '脾肺肾亏损虚劳怯弱等症': '虚劳',
    '脾肺肾亏损遗精吐血便血等症': '遗精、吐血、便血',
    '肝脾肾亏损下部疮肿等症': '疮肿',
    '脾肺肾亏损大便秘结等症': '便秘',
  };
  return diagnoses[title.replace(/^[一二三四五六七八九十]+、/u, '')] ?? null;
}

// The composite and repeated-patient titles in this volume need separate collation.
const yuyiExclude = /^(?:序|先议病后用药|与门人定议病式|金道宾后案|面论大司马王岵翁|直推王岵翁|论体盛绝孕治法|陆子坚调摄方论|论士大夫|论治伤寒药中|与黄我兼世兄书|论吴叔宝无病)|(?:各不同|种种受证|乃室及|二女|二郎三郎|乃母.*及自病)/u;
const yuyiLabels = [
  '真阳上脱', '伤寒后余热', '伤寒', '咳血', '吐血', '失血', '血证', '血蛊', '疟',
  '单腹胀', '肺痈', '膈气', '耳鸣', '痿痹', '足患', '喘病', '漏证', '疝证', '痰饮',
  '痞块', '风废', '肠澼', '积热', '痰病', '痈疖', '交肠', '绝孕',
];
const yuyiSpecificLabels = new Map([
  [17, '溺水后发热昏迷'], [71, '大便后寒热'], [76, '肠风下血'],
  [111, '呕吐、不食'], [130, '脾约便艰'], [182, '腹痛'],
]);
const xiaoerLabels = [
  '惊搐', null, '发搐', '吐泻、慢惊', '咳嗽', '咳嗽、胸满短气', '肺热', '疮疹', '惊搐',
  '疮疹', '潮热发搐', '夜间发热', '发热', null, '吐泻', '吐泻、壮热', '吐泻', '泄泻', null,
  '虫痛', '咳嗽、咯血', '脏热', '癖',
];

function patientNarrative(line) {
  return !editor.test(line) && !/^(?:盖|愚按|夫|若|又|按|凡|附|此|经[云曰]|窃谓|前方|前症|或问|论曰)/u.test(line)
    && observed.test(line.slice(0, 115)) && care.test(line);
}

function chapterGroups(book, chapter) {
  if (nonCase.test(chapter.title) || /〔图版|附录/u.test(chapter.volume ?? '')) return [];
  const lines = chapterLines(chapter);
  if (book.key === 'linzheng' || book.key === 'wu') {
    if (!chapter.volume || /要略/u.test(chapter.volume) || chapter.title === '幼科要略') return [];
    return groupCases(lines, line => casePatient(line) !== null, line =>
      editor.test(line) || (book.key === 'linzheng' && /^(?:内经止有|此门诸案|是门诸案|观前诸案)/u.test(line)));
  }
  if (book.key === 'shishan') {
    if (!/^卷之/u.test(chapter.volume ?? '')) return [];
    return groupCases(lines, line => anonymous.test(line) || knownStoneHead.test(line));
  }
  if (book.key === 'neike') {
    if (!diagnosesForNeike(chapter.title)) return [];
    return lines.filter(line => patientNarrative(line.text)).map(line => [line]);
  }
  if (book.key === 'huixi') {
    return groupCases(lines, line => patientNarrative(line) && /(?:余|我|予)/u.test(line));
  }
  if (book.key === 'yuyicao') {
    if (yuyiExclude.test(chapter.title)) return [];
    const end = lines.findIndex(line => editor.test(line.text) || /^附.{0,10}(?:治验|医案)/u.test(line.text));
    return [end === -1 ? lines : lines.slice(0, end)];
  }
  if (book.key === 'xiaoer' && chapter.title === '卷中·记尝所治病二十三证') {
    return lines.flatMap((line, index) => xiaoerLabels[index] ? [[line]] : []);
  }
  return [];
}

function diseaseName(book, chapter, lines) {
  if (book.key === 'neike') return diagnosesForNeike(chapter.title);
  if (book.key === 'yuyicao') {
    return yuyiSpecificLabels.get(chapter.source_ordinal)
      ?? yuyiLabels.find(name => chapter.title.includes(name)) ?? chapter.title;
  }
  if (book.key === 'xiaoer') return xiaoerLabels[chapter.paragraph_ordinals.indexOf(lines[0].ordinal)];
  return chapter.title.replace(/（[^）]+）$/u, '');
}

function subjectFor(book, chapter, disease) {
  if (book.key === 'xiaoer' || (book.key === 'linzheng' && chapter.volume === '卷十')) return '儿科';
  if (book.key === 'linzheng' && chapter.volume === '卷九') return '妇科';
  if (/小儿|小男|乃郎|惊痫|痘症|恶痘/u.test(chapter.title)) return '儿科';
  if (/调经|淋带|崩漏|妊病|胎前|产后|试胎|胎中|子利|绝孕|^崩$/u.test(disease)) return '妇科';
  if (/^眼目$|^目$|^耳$|^鼻$|^牙$|^咽喉$|^耳脓$|^失音$|^喉痹$/u.test(disease)) return '五官科';
  if (/^疮疡$|^[^肺肠肝]*痈$|脚疮|疮肿|下疳|疽$|对口|发背|流注|筋瘤|乳疖|痈疖|杨梅疮/u.test(disease)) return '外科';
  return '内科';
}

function symptomExcerpt(firstLine, hasPatientMark) {
  let body = hasPatientMark ? casePatient(firstLine) ?? firstLine : firstLine;
  body = body
    .replace(/^[一二三四五六七八九十百零廿\d]+岁\s*/u, '')
    .replace(/^(?:[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])?\s*/u, '')
    .replace(sourceNumber, '');
  const stopping = body.search(treatmentClause);
  const beforeCare = stopping >= 0 ? body.slice(0, stopping) : body;
  const opening = signs.test(beforeCare) ? beforeCare : body;
  const sentences = opening.split(/[。！？；]/u).filter(line => signs.test(line) && !treatmentClause.test(line));
  const selected = sentences.slice(0, 3).join('。').replace(/[，、；：。\s]+$/gu, '');
  if (selected && selected.length <= 165) return selected;
  const clauses = (selected || opening).split(/[，、。！？；]/u);
  const short = [];
  for (const clause of clauses) {
    if (clause.length > 58 || short.join('，').length + clause.length > 130) break;
    if (signs.test(clause) && !treatmentClause.test(clause)) short.push(clause);
  }
  return short.join('，') || null;
}

function originalPrescription(lines, book) {
  if (book.key === 'linzheng' || book.key === 'wu') {
    for (const { text } of lines.slice(1, 5)) {
      if (text.length > 200 || /[。；：]/u.test(text) || casePatient(text) || editor.test(text)) continue;
      const ingredients = text.split(/\s+/u);
      const hasDose = /（[^）]{0,24}(?:钱|分|两|枚|片|撮|合|斤)[^）]{0,12}）/u.test(text);
      if ((hasDose || ingredients.length >= 4) && ingredients.length >= 3
          && /^[\p{Script=Han}]{2,8}(?:（|\s)/u.test(text)
          && !/^(?:又|再|用|煮|每服|服|上|前|水|酒|明早|今|夜|令)/u.test(text)) return text;
    }
  }
  const text = lines.map(line => line.text).join(' ');
  for (const match of text.matchAll(/(?:方用|遂用|初用|乃用|令用|予以|余用)([\p{Script=Han}][^。；！？]{7,170}?)(?=煎服|煎汤|为末|作末|[。；！？]|$)/gu)) {
    const prefix = text.slice(Math.max(0, match.index - 10), match.index);
    const ingredients = match[1].replace(/[，、\s]+$/gu, '');
    if (!earlierCare.test(prefix) && !/病减|不效|乃又|医用|汤加|方加/u.test(ingredients)
        && [...ingredients.matchAll(dose)].length >= 2) {
      return ingredients;
    }
  }
  const matches = [...text.matchAll(formulaGiven)].filter(match => {
    const prefix = text.slice(Math.max(0, match.index - 10), match.index);
    return !earlierCare.test(prefix);
  });
  return [...new Set(matches.map(match => match[1]))].slice(0, 4).join('、') || null;
}

function originalMethod(lines) {
  const text = lines.map(line => line.text).join(' ');
  const match = text.match(/(?:治宜|法当|治法当|治以|议以|议用|拟用|宜)([\p{Script=Han}]{2,18}(?:之法|法))(?=[，。；、：\s]|$)/u);
  return match?.[1] ?? text.match(methodPhrase)?.[1] ?? null;
}

function buildRecord(book, chapter, lines) {
  if (!lines.length) return null;
  const text = lines.map(line => line.text).join('\n');
  const leading = lines[0].text;
  if (text.length < 45 || text.length > 4800 || unreadable.test(text) || !care.test(text) || !signs.test(leading)) return null;
  const diseases = diseaseName(book, chapter, lines);
  const symptoms = symptomExcerpt(leading, ['linzheng', 'wu'].includes(book.key));
  if (!diseases || !symptoms || symptoms.length < 5) return null;
  const prescription = originalPrescription(lines, book);
  const method = originalMethod(lines);
  const course = text.match(/连服([一二三四五六七八九十两半\d]{1,5}[日天])(?=[，。；])/u)?.[1] ?? null;
  const first = lines[0].ordinal;
  const last = lines.at(-1).ordinal;
  const range = first === last ? `原文段落 ${first}` : `原文段落 ${first}–${last}`;
  const section = [chapter.volume, chapter.title].filter(Boolean).join(' · ');
  const diagnosis = text.match(/(?:予曰[：:]此|余曰[：:]此|予以为|余以为)([^。！？；：\n]{5,45})(?=[。！？；\n])/u)?.[1];
  const location = `文献出处：《${book.name}》${section}，${range}。电子整理本：中医笈成。`;
  return {
    diseases, symptoms, subject: subjectFor(book, chapter, diseases),
    doctor: book.doctor, dynasty: book.dynasty, bookname: book.name, prescription,
    content: text, summary: diagnosis ? `${location}\n案中辨证摘录：“${diagnosis}”。` : location,
    method, course_days: course,
    source: {
      book: book.key, chapter: chapter.title, volume: chapter.volume, heading_ordinal: chapter.source_ordinal,
      paragraphs: lines.map(line => line.ordinal), url: book.url, sha256: sha256(text),
    },
  };
}

function normalizeCase(text) {
  return text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

function ngrams(text) {
  const grams = new Set();
  for (let index = 0; index <= text.length - 8; index++) grams.add(text.slice(index, index + 8));
  return grams;
}

function deduplicator() {
  const exact = new Set();
  const index = new Map();
  const sizes = [];
  return text => {
    const normalized = normalizeCase(text);
    if (exact.has(normalized)) return false;
    const grams = ngrams(normalized);
    const overlap = new Map();
    for (const piece of grams) {
      for (const id of index.get(piece) ?? []) overlap.set(id, (overlap.get(id) ?? 0) + 1);
    }
    for (const [id, match] of overlap) {
      const shortest = Math.min(sizes[id], grams.size);
      if (shortest >= 35 && match / shortest >= 0.7 && match / (sizes[id] + grams.size - match) >= 0.43) return false;
    }
    const id = sizes.length;
    sizes.push(grams.size);
    exact.add(normalized);
    for (const piece of grams) {
      if (!index.has(piece)) index.set(piece, []);
      index.get(piece).push(id);
    }
    return true;
  };
}

function rankChapters(chapters) {
  const ranked = chapters.map(rows => [...rows].sort((first, second) => {
    const score = row => Number(Boolean(row.prescription)) * 6 + Number(Boolean(row.method)) * 3
      + Math.min(row.symptoms.length, 85) / 36 + Math.min(row.content.length, 1000) / 550;
    return score(second) - score(first);
  }));
  const result = [];
  for (let offset = 0; ranked.some(chapter => chapter.length > offset); offset++) {
    for (const chapter of ranked) if (chapter[offset]) result.push(chapter[offset]);
  }
  return result;
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) throw new Error('Provide the directory with the seven named HTML source snapshots');
  const collection = await Promise.all(sources.map(book => readSource(book, directory)));
  const candidates = collection.map(book => rankChapters(book.chapters.map(chapter =>
    chapterGroups(book, chapter).map(lines => buildRecord(book, chapter, lines)).filter(Boolean),
  )));
  console.log('Eligible by source:', Object.fromEntries(collection.map((book, i) => [book.name, candidates[i].length])));
  const accept = deduplicator();
  const records = [];
  const offsets = candidates.map(() => 0);
  for (const [index, book] of collection.entries()) {
    for (let taken = 0; taken < book.quota && offsets[index] < candidates[index].length;) {
      const row = candidates[index][offsets[index]++];
      if (accept(row.content)) {
        records.push(row);
        taken++;
      }
    }
  }
  while (records.length < 1000) {
    const before = records.length;
    for (const [i, rows] of candidates.entries()) {
      while (offsets[i] < rows.length) {
        const row = rows[offsets[i]++];
        if (accept(row.content)) {
          records.push(row);
          break;
        }
      }
      if (records.length === 1000) break;
    }
    if (records.length === before) throw new Error(`Only ${records.length} distinct cases qualified`);
  }
  if (records.length !== 1000) throw new Error(`Expected exactly 1000 cases, got ${records.length}`);
  const locations = new Set();
  for (const row of records) {
    const { book, heading_ordinal, paragraphs, sha256: digest } = row.source;
    const source = collection.find(item => item.key === book);
    const chapter = source.chapters.find(item => item.source_ordinal === heading_ordinal);
    const originals = new Map(chapterLines(chapter).map(line => [line.ordinal, line.text]));
    const located = paragraphs.map(number => originals.get(number)).join('\n');
    const key = `${book}:${paragraphs[0]}`;
    if (located !== row.content || sha256(located) !== digest || locations.has(key)) {
      throw new Error(`Case does not match its unique source location: ${key}`);
    }
    locations.add(key);
  }
  const metadata = collection.map(book => ({
    key: book.key, bookname: book.name, edition: book.edition, historical_attribution: book.attribution,
    source_url: book.url, scans: book.scans, snapshot_sha256: book.sha,
    selected: records.filter(row => row.source.book === book.key).length,
  }));
  await fs.writeFile(destination, JSON.stringify({
    digital_text: { site: '中医笈成', license: 'CC0', statement: copyrightUrl },
    sources: metadata,
    records,
  }, null, 2) + '\n', 'utf8');
  console.log('Selected by source:', Object.fromEntries(metadata.map(book => [book.bookname, book.selected])));
}

export { sources, readSource, chapterLines, chapterGroups, buildRecord, casePatient, groupCases, deduplicator };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

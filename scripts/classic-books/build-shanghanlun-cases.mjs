import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sha256 } from './common.mjs';

const corpus = new URL('../../txt/classic-books/', import.meta.url);
const output = new URL('../../database/shanghanlun-cases.json', import.meta.url);
const bookKey = 'shanghanlun';

// Each number is the one-based line in the named chapter of the stored edition.
const selections = new Map([
  [152, [
    [12, '太阳中风', '发热/自汗/恶风/恶寒/鼻鸣/干呕', ['桂枝汤'], '条文并列阳浮、阴弱及汗出恶风等表现，归为太阳中风，原载桂枝汤。'],
    [28, '太阳病发汗后漏汗', '汗出不止/恶风/小便难/四肢拘急', ['桂枝加附子汤'], '辨治起于发汗后漏汗不止，兼见恶风、小便难及四肢屈伸不利，原载桂枝加附子汤。'],
    [43, '太阳病如疟状', '发热恶寒/身痒/热多寒少', ['桂枝麻黄各半汤'], '条文先列脉微缓及脉微恶寒两种转归，再以面有热色、身痒辨其未解，原载桂枝麻黄各半汤。'],
    [54, '桂枝汤后烦渴', '大汗/烦渴/脉洪大', ['白虎加人参汤'], '条文以服桂枝汤后大汗出、烦渴不解和脉洪大为辨治要点，原载白虎加人参汤。'],
  ]],
  [184, [
    [1, '太阳病项背强', '项背强/无汗/恶风', ['葛根汤'], '项背强而无汗、恶风，是本条列举的辨治要点，原载葛根汤。'],
    [12, '太阳病误下后下利', '下利不止/脉促/喘/汗出', ['葛根黄芩黄连汤'], '条文从桂枝证误下后下利叙起，以脉促说明表未解，并在喘而汗出一支列葛根黄芩黄连汤。'],
    [17, '太阳病无汗而喘', '头痛/发热/身疼/腰痛/骨节疼痛/恶风/无汗/喘', ['麻黄汤'], '条文同列发热、周身疼痛、恶风及无汗而喘，原载麻黄汤。'],
    [24, '太阳病无汗烦躁', '脉浮紧/发热/恶寒/身疼/无汗/烦躁', ['大青龙汤'], '条文以脉浮紧、无汗烦躁等表现列大青龙汤，并另列脉微弱、汗出恶风时的禁例。'],
    [30, '伤寒表不解兼水气', '干呕/发热/咳嗽/喘', ['小青龙汤'], '条文并述表未解与心下有水气，以干呕、发热咳嗽为主述，另列渴、下利等或见表现，原载小青龙汤。'],
    [90, '伤寒吐下后气上冲', '心下逆满/气上冲胸/头眩/脉沉紧', ['茯苓桂枝白术甘草汤'], '条文记吐下后心下逆满、气上冲胸及起身眩晕，原载茯苓桂枝白术甘草汤，并记再发汗之变。'],
    [117, '太阳病水逆', '发热/烦/口渴/水入则吐', ['五苓散'], '渴而欲饮、饮水即吐在条文中定名水逆，原载五苓散。'],
    [132, '汗下后烦热胸窒', '烦热/胸中窒', ['栀子豉汤'], '条文以发汗或下后出现烦热、胸中窒为辨治要点，原载栀子豉汤。'],
    [165, '小柴胡汤所载寒热证', '往来寒热/胸胁苦满/不欲饮食/心烦/喜呕', ['小柴胡汤'], '条文列往来寒热、胸胁苦满、不欲饮食和心烦喜呕等主述，继列数种或见表现，原载小柴胡汤。'],
    [179, '伤寒心悸而烦', '心悸/烦', ['小建中汤'], '条文以伤寒二三日、心中悸而烦为辨治要点，原载小建中汤。'],
  ]],
  [283, [
    [16, '结胸热实', '心下痛/按之石硬/脉沉紧', ['大陷胸汤'], '条文定名结胸热实，并列脉沉紧、心下痛和按之石硬，原载大陷胸汤。'],
    [19, '小结胸', '心下按痛/脉浮滑', ['小陷胸汤'], '条文以病位在心下、按之则痛、脉浮滑辨小结胸，原载小陷胸汤。'],
    [51, '误下后心下痞', '心下满而不痛', ['半夏泻心汤'], '条文区分误下后柴胡证仍在、心下硬痛的结胸及心下满而不痛的痞。本条整理痞的一支，原载半夏泻心汤。'],
    [75, '汗解后胃中不和', '心下痞硬/干噫食臭/腹中雷鸣/下利', ['生姜泻心汤'], '条文以汗出解后胃中不和为背景，合述心下痞硬、干噫食臭、腹鸣和下利，原载生姜泻心汤。'],
    [81, '误下后胃虚痞利', '下利/谷不化/腹中雷鸣/心下痞硬/干呕/心烦', ['甘草泻心汤'], '条文记屡下而痞益甚，并以胃中虚、客气上逆解释其痞，原载甘草泻心汤。'],
    [92, '汗吐下后痞硬噫气', '心下痞硬/噫气', ['旋覆代赭汤'], '汗、吐或下后，条文以心下痞硬、噫气不除为辨治要点，原载旋覆代赭汤。'],
    [148, '伤寒脉结代心动悸', '脉结代/心悸', ['炙甘草汤'], '条文将脉结代与心动悸并列，原载炙甘草汤。'],
  ]],
  [337, [
    [29, '阳明病未吐下而心烦', '心烦', ['调胃承气汤'], '条文特指未经过吐下而心烦的阳明病，原载可与调胃承气汤。'],
    [43, '阳明病多汗谵语', '多汗/大便硬/谵语', ['小承气汤'], '条文以多汗、津液外出说明胃燥便硬，并联系谵语，原载小承气汤。'],
    [50, '二阳并病表证已罢', '潮热/手足汗出/大便难/谵语', ['大承气汤'], '辨治以太阳证已罢为前提，合看潮热、手足汗出、大便难和谵语，原载大承气汤。'],
    [53, '阳明病渴而小便不利', '脉浮/发热/口渴/小便不利', ['猪苓汤'], '本条位于阳明篇辨治条文中，以脉浮、发热、口渴及小便不利并见为要点，原载猪苓汤。'],
    [80, '阳明病瘀热发黄', '头汗出/身无汗/小便不利/口渴/发黄', ['茵陈蒿汤'], '条文对举发热有汗与仅头汗出的两种情形，以后者兼小便不利、渴饮辨为瘀热在里，原载茵陈蒿汤。'],
    [91, '阳明病食谷欲呕', '食谷欲呕', ['吴茱萸汤'], '条文先将食谷欲呕归入阳明并列吴茱萸汤，继以服汤反剧辨属上焦。'],
    [99, '阳明脾约', '趺阳脉浮涩/小便数/大便硬', ['麻子仁丸'], '条文以趺阳浮涩、小便数与大便硬辨脾约，原载麻子仁丸。'],
  ]],
  [422, [
    [4, '太阳转少阳', '胸胁硬满/干呕/不能食/往来寒热/脉沉紧', ['小柴胡汤'], '条文记太阳未解而转少阳，在未经吐下的前提下列胁下硬满、干呕不能食和往来寒热，原载小柴胡汤。'],
  ]],
  [434, [
    [4, '太阴病脉浮', '脉浮', ['桂枝汤'], '本条从太阴病见脉浮这一条件论发汗，原载桂枝汤。'],
    [7, '太阳误下后太阴腹痛', '腹满/腹痛', ['桂枝加芍药汤', '桂枝加大黄汤'], '条文将太阳病误下后腹满时痛归太阴，列桂枝加芍药汤。大实痛另列桂枝加大黄汤，两方对应不同表现。'],
  ]],
  [443, [
    [21, '少阴初病反发热', '发热/脉沉', ['麻黄细辛附子汤'], '条文以少阴初病反见发热、脉沉为辨治要点，原载麻黄细辛附子汤。'],
    [31, '少阴病心烦不得卧', '心烦/不得卧', ['黄连阿胶汤'], '条文记少阴病二三日以上出现心中烦、不得卧，原载黄连阿胶汤。'],
    [41, '少阴病身痛手足寒', '身痛/手足寒/骨节痛/脉沉', ['附子汤'], '条文同列身体痛、骨节痛、手足寒及脉沉，原载附子汤。'],
    [47, '少阴病下利便脓血', '腹痛/小便不利/下利不止/便脓血', ['桃花汤'], '条文以腹痛、小便不利而持续下利、便脓血为辨治要点，原载桃花汤。'],
    [83, '少阴病水气', '腹痛/小便不利/四肢沉重疼痛/下利', ['真武汤'], '条文以腹痛、小便不利、四肢沉重疼痛和自下利推为有水气，并另列或见表现，原载真武汤。'],
    [93, '少阴病四逆', '手足逆冷', ['四逆散'], '条文以四逆为主述，咳、悸、小便不利、腹痛与泄利下重分列为或见表现，原载四逆散。'],
  ]],
  [489, [
    [13, '厥阴篇蛔厥', '手足厥冷/时烦/食后呕/吐蛔', ['乌梅丸'], '条文对举脏厥烦躁无暂安与蛔厥时静时烦、食后呕及吐蛔，蛔厥一支原载乌梅丸。'],
    [29, '厥阴篇脉滑而厥', '脉滑/手足厥冷', ['白虎汤'], '条文将脉滑而厥辨为里有热，原载白虎汤。'],
    [30, '厥阴篇手足厥寒', '手足厥寒/脉细欲绝', ['当归四逆汤'], '条文以手足厥寒、脉细欲绝为辨治要点，原载当归四逆汤。'],
    [50, '厥阴篇寒格', '寒下/食入即吐', ['干姜黄芩黄连人参汤'], '条文以本有寒下、又经吐下为背景，列寒格而食入即吐的表现，原载干姜黄芩黄连人参汤。'],
    [66, '厥阴篇热利下重', '热利/下重', ['白头翁汤'], '条文以热利、下重为辨治要点，原载白头翁汤。'],
  ]],
  [547, [
    [9, '霍乱篇寒热分治', '头痛/发热/身疼痛', ['五苓散', '理中丸'], '这里的霍乱是原书病类。条文在头痛、发热、身痛的背景下，以热多饮水和寒多不用水分列五苓散与理中丸。'],
    [15, '霍乱篇吐利兼厥冷', '吐利/汗出/发热/恶寒/四肢拘急/手足厥冷', ['四逆汤'], '条文并载吐利、汗出、发热恶寒及四肢拘急厥冷，原载四逆汤。'],
  ]],
  [558, [
    [6, '大病差后劳复', '劳复', ['枳实栀子豉汤'], '条文以大病初愈后因劳而复为辨治背景，原载枳实栀子豉汤。'],
    [12, '大病差后腰下水气', '腰以下有水气', ['牡蛎泽泻散'], '条文所载水气位于腰以下，见于大病差后，原载牡蛎泽泻散。'],
    [18, '伤寒解后虚羸', '虚羸/少气/气逆欲吐', ['竹叶石膏汤'], '条文记伤寒解后仍见虚羸、少气、气逆欲吐，原载竹叶石膏汤。'],
  ]],
]);

const preparation = /^(?:生(?:用)?$|炮|炙|酒洗|清酒洗|水渍|暖水洗|洗|去|破|切|擘|熬|汤浸|绵裹|碎|筛|别作|出汗|一半(?:全用|筛末))/u;

function readFormula(chapters, name) {
  const headings = chapters.flatMap(chapter => chapter.lines.flatMap((line, index) =>
    line === `${name}方` ? [{ chapter, index }] : []));
  if (headings.length !== 1) throw new Error(`Expected one formula heading for ${name}, found ${headings.length}`);
  const [{ chapter, index }] = headings;
  const composition = chapter.lines[index + 1];
  const tokens = [...composition.matchAll(/([\p{Script=Han}]+)((?:【古注：[^】]+】)*)(?:\s+|$)/gu)];
  if (!tokens.length || tokens.map(token => token[0]).join('') !== composition) {
    throw new Error(`Unexpected ingredients format for ${name}`);
  }
  const medicines = tokens.map(([, medicine, annotations]) => ({
    name: medicine,
    note: [...annotations.matchAll(/【古注：（([^）]+)）】/gu)]
      .flatMap(match => match[1].split('，')).filter(part => preparation.test(part)).join('、'),
    dose: '',
  }));
  return {
    prescription: `${name}：${composition.replace(/【古注：（([^）]+)）】/gu, '（$1）')}`,
    medicines,
    reference: { name, chapter_key: chapter.chapter_key, chapter: chapter.title, volume: chapter.volume,
      heading_line: index + 1, composition_line: index + 2, composition_sha256: sha256(composition) },
  };
}

export async function buildShanghanlunCases() {
  const [chapterFile, catalog] = await Promise.all(['chapters/shanghanlun.json', 'sources.json'].map(async file =>
    JSON.parse(await fs.readFile(new URL(file, corpus), 'utf8'))));
  const sourceEntry = catalog.sources.find(source => source.key === bookKey);
  const part = sourceEntry?.parts[0];
  if (sourceEntry?.parts.length !== 1 || part.title !== '傷寒論（宋本）' || !sourceEntry.license.digital_edits.startsWith('CC0-1.0')) {
    throw new Error('Expected the archived Song edition and its CC0 text license');
  }
  const chapters = chapterFile.chapters.filter(chapter => selections.has(chapter.source_ordinal)).map(chapter => {
    if (chapter.source_sha256 !== part.sha256 || sha256(chapter.content) !== chapter.content_sha256) {
      throw new Error(`Source checksum mismatch for ${chapter.title}`);
    }
    return { ...chapter, lines: chapter.content.split('\n') };
  });
  const records = [];
  const formulas = new Map();
  for (const [ordinal, selected] of selections) {
    const chapter = chapters.find(entry => entry.source_ordinal === ordinal);
    for (const [line, diseases, symptoms, names, analysis] of selected) {
      const content = chapter.lines[line - 1];
      if (!content || !names.every(name => content.includes(name))) {
        throw new Error(`Cannot locate ${names.join('、')} in ${chapter.title} line ${line}`);
      }
      const prescriptions = names.map(name => {
        if (!formulas.has(name)) formulas.set(name, readFormula(chapters, name));
        return formulas.get(name);
      });
      const groups = prescriptions.map(formula => formula.medicines);
      records.push({
        diseases, symptoms, subject: '内科', doctor: '张仲景', dynasty: '东汉', bookname: '伤寒论', treatment: '方药',
        prescription: prescriptions.map(formula => formula.prescription).join('\n'),
        content, modern_prescription: JSON.stringify(groups.length === 1 ? groups[0] : groups),
        summary: `辨证条文。${analysis}\n文献出处：《伤寒论》（宋本）${chapter.volume} · ${chapter.title}，中医笈成电子整理本。`,
        method: null, course_days: null,
        source: { book: bookKey, chapter_key: chapter.chapter_key, chapter: chapter.title, volume: chapter.volume,
          url: chapter.source_url, paragraphs: [line], prescription_paragraph: line, sha256: sha256(content),
          chapter_sha256: chapter.content_sha256, formulas: prescriptions.map(formula => formula.reference) },
      });
    }
  }
  return {
    digital_text: { site: '中医笈成', license: 'CC0', statement: sourceEntry.license.url },
    sources: [{ key: bookKey, bookname: '伤寒论', edition: part.title, edition_basis: part.metadata['底本'],
      source_url: part.url, snapshot_sha256: part.sha256, scans: part.edition_links, selected: records.length }],
    records,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildShanghanlunCases().then(async data => {
    await fs.writeFile(output, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Selected ${data.records.length} Shanghanlun source passages`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

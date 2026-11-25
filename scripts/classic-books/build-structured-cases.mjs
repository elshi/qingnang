import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  sources, readSource, chapterLines, chapterGroups, buildRecord, casePatient, groupCases, deduplicator,
} from './build-cases.mjs';
import { sha256 } from './common.mjs';

const oldUrl = new URL('../../database/classic-cases.json', import.meta.url);
const outputUrl = new URL('../../database/structured-classic-cases.json', import.meta.url);
const gramsPerQian = 3;
const doseSource = 'https://xxgk.qinshui.gov.cn/xzf/qswtj/fdzdgknr/gzdt/202312/t20231207_1899438.shtml';
const desired = new Map([['shiliu', 390], ['linzheng', 255], ['wu', 35], ['shentang', 245], ['jingxiang', 75]]);
const rejection = {};
const books = [
  { key: 'shiliu', title: '張聿青醫案', doctor: '张聿青', dynasty: '清', base: '戊午江陰吳氏刊行本' },
  ...sources.filter(book => desired.has(book.key)),
  {
    key: 'shentang', title: '慎五堂治驗錄', doctor: '钱艺', dynasty: '清',
    attribution: '錢藝撰，錢雅樂等輯',
    preface: '始同治紀元至於光緒五年',
    editionDescription: '电子文本源页未列刊本，依原序及前十卷的清代医案正文',
  },
  {
    key: 'jingxiang', title: '靜香樓醫案', doctor: '尤怡', dynasty: '清',
    attribution: '尤怡撰，柳寶詒選評',
    preface: '光緒二十六年庚子二月下旬',
    editionDescription: '电子文本源页未列刊本，依清光绪二十六年柳宝诒序及案文',
  },
];

const symptomPatterns = [
  ['寒热往来', /寒热往来|往来寒热|寒热交作|时寒时热/u],
  ['恶寒', /恶寒|洒淅恶寒|畏冷|怯冷|畏寒/u],
  ['恶风', /恶风|畏风/u],
  ['发热', /发热|身热|壮热|大热|热势炽|发烧/u],
  ['潮热', /潮热|午后潮热/u],
  ['夜热', /夜热|暮热|夜间发热/u],
  ['手足心热', /五心烦热|掌心热|手足心热/u],
  ['自汗', /自汗|汗自出|动则汗出|自动汗出/u],
  ['盗汗', /盗汗|寐中汗出|睡中汗出/u],
  ['多汗', /汗多|大汗|汗出不止|汗出甚多/u],
  ['无汗', /无汗|不得汗|汗未出|遍体汗闭/u],
  ['头痛', /头痛|头疼|巅顶作痛|巅痛|脑痛|头作痛/u],
  ['头胀', /头胀|头重如裹|头重/u],
  ['眩晕', /眩晕|眩冒|头眩|头晕|头旋|目眩|眼花/u],
  ['耳鸣', /耳鸣|耳中鸣/u], ['耳聋', /耳聋|两耳失聪|耳不聪|耳失聪/u],
  ['目赤', /目赤|眼赤|两目红/u], ['视物昏花', /目昏|眼花|视物不明|视物昏花/u],
  ['鼻塞', /鼻塞|鼻窍不通/u], ['流涕', /流涕|涕流|鼻流清涕/u],
  ['鼻衄', /鼻衄|鼻血|鼻出血/u], ['牙痛', /牙痛|齿痛|牙疼/u], ['齿衄', /齿衄|牙龈出血/u],
  ['咽痛', /咽痛|喉痛|咽疼|咽喉肿痛|喉间作痛/u],
  ['咽干', /咽干|咽燥|嗌干|嗌燥|咽喉干燥/u],
  ['口渴', /口渴|大渴|作渴|消渴|引饮|渴饮|渴甚|烦渴|渴欲饮/u],
  ['口干', /口干|口燥|口中干/u], ['口苦', /口苦|口中苦/u],
  ['咳嗽', /咳嗽|咳逆|咳呛|呛咳|咳甚|作咳|干咳|咳而/u],
  ['咳痰', /咯痰|咳痰|咳而痰|吐痰|呛痰/u], ['痰多', /痰多|痰盛|多痰|痰涎涌盛/u],
  ['喘促', /喘促|喘急|气喘|喘息|喘逆|呼吸急促|作喘|喘甚/u],
  ['气短', /气短|短气|气促|呼吸促/u], ['咯血', /咯血|嗽血|痰中带血|咳血|痰里红|痰血|痰红|痰涎带红/u], ['吐血', /吐血|呕血|呕红|吐红/u],
  ['声音嘶哑', /声哑|失音|音哑|音嗄|声音低哑/u],
  ['胸闷', /胸闷|胸中闷|胸痞|胸中痞闷|胸间窒塞|胸中不爽/u],
  ['胸痛', /胸痛|胸中痛|胸中作痛|胸中微痛|胸膺痛/u], ['胁痛', /胁痛|胁疼|胁下痛|胁肋作痛/u],
  ['胁胀', /胁胀|胁满|两胁胀/u],
  ['心悸', /心悸|心动悸|怔忡|惊悸|心中悸动/u],
  ['烦躁', /烦躁|躁扰|烦扰|躁动|烦乱|不宁/u], ['失眠', /不寐|失眠|寐少|少寐|不能寐|不眠|寐难/u],
  ['嗜睡', /多寐|沉睡|昏睡|嗜睡|多睡|欲寐/u], ['神昏', /神昏|昏愦|昏瞀|昏迷|不省人事|神识昏蒙/u],
  ['谵语', /谵语|妄言|妄语|谵妄/u], ['神疲', /神疲|神倦|神惫|气怯神疲/u],
  ['口眼歪斜', /口眼㖞斜|口眼喎斜|口眼歪斜|口角歪斜|口眼斜/u],
  ['言语不利', /言语不利|语言謇涩|言謇|语蹇|言蹇|语言不清|不能言|言语蹇涩|舌强言蹇/u],
  ['四肢抽搐', /四肢抽搐|手足抽搐|手足牵掣|瘛疭|发搐|肢搐|肢体抽搐|手足振颤|肢振/u],
  ['肢体麻木', /肢麻|肢体麻木|手足麻木|半身麻木|手麻|足麻|臂麻/u],
  ['肢体无力', /肢体无力|四肢无力|足软|脚软|下肢无力|手足乏力/u],
  ['肢体不遂', /肢体不遂|半身不遂|偏枯|肢体不利|四肢不遂/u],
  ['手足冷', /手足冷|肢冷|四肢冷|四肢厥冷|手足逆冷|肢厥/u],
  ['畏寒肢冷', /畏寒肢冷|形寒肢冷/u], ['倦怠', /倦怠|乏力|肢倦|懒倦|困倦/u],
  ['水肿', /水肿|浮肿|面目浮肿|面浮|足肿|两腿肿|腿肿/u],
  ['膝痛', /膝痛|膝疼|膝胫作痛/u], ['腰痛', /腰痛|腰疼|腰脊痛|腰胯痛/u],
  ['腰酸', /腰酸|腰酸腿软/u], ['背痛', /背痛|背脊痛|肩背痛|脊背痛/u],
  ['身痛', /身痛|身体痛|遍身疼痛|骨节疼痛|身疼/u],
  ['腹胀', /腹胀|腹满|肚腹膨胀|腹中气胀|腹如鼓/u],
  ['腹痛', /腹痛|腹中作痛|腹中疼痛|少腹痛|小腹痛|脐腹痛|肚痛/u],
  ['气上冲胸', /气上冲胸|冲气上逆|气上冲心|气从少腹上冲|气逆上冲/u],
  ['胃脘痛', /脘痛|脘中疼痛|胃痛|胃脘作痛|心下作痛/u],
  ['脘痞', /脘痞|脘闷|脘中堵塞|心下痞|脘中痞闷/u],
  ['食欲减退', /纳少|食少|纳食少|纳食不旺|不思食|不思饮食|不欲食|不能食|不饥不纳|纳谷不振|减谷/u],
  ['恶心', /恶心|恶食欲吐|泛恶|欲呕/u], ['呕吐', /呕吐|欲吐|善呕|作呕|吐水|呕逆|饮入即吐/u],
  ['干呕', /干呕|干哕/u], ['呃逆', /呃逆|呃忒|打呃|呃咳/u],
  ['嗳气', /嗳气|嗳噫|噫气/u], ['反酸', /吐酸|泛酸|吞酸|呕酸|作酸/u],
  ['大便秘结', /便秘|秘结|大便不通|大便不行|便艰|大便燥结|便结/u],
  ['大便溏薄', /便溏|溏泄|便薄|便软|便不实/u],
  ['泄泻', /泄泻|腹泻|下利|作泻|暴泻/u], ['大便下血', /便血|大便下血|下血|下鲜血/u],
  ['里急后重', /里急后重|后重/u], ['大便失禁', /大便不禁|大便失禁/u],
  ['小便短少', /便短|溲短|小便短|小水短|小便少|小水少|尿少/u],
  ['小便不利', /小便不利|小便不通|溺涩|溲涩|小水不利/u],
  ['小便频数', /小便频数|小便数|溲数|尿频|小水频/u], ['小便赤', /溲赤|尿赤|溺赤|小便赤/u],
  ['遗尿', /遗尿|遗溺|小便自遗|尿床/u], ['遗精', /遗精|梦遗|精遗/u],
  ['带下', /带下|赤带|白带/u], ['月经不调', /月经不调|经水不调|月事不调|经期紊乱/u],
  ['经闭', /经闭|月事不行|经水不行|月事不至|经事不行/u],
  ['经量多', /经水过多|经血过多|月事过多|经水过期不止/u], ['恶露不尽', /恶露不尽|恶露未净|恶露仍行/u],
  ['面色苍白', /面色苍白|面白|面色㿠白/u], ['面色萎黄', /面黄|面色萎黄/u],
  ['消瘦', /形瘦|肌肉消削|羸瘦|形体消瘦|体瘦/u],
  ['舌红', /舌红|舌尖红|舌色鲜红/u], ['舌绛', /舌绛|舌质绛/u], ['舌燥', /舌燥|舌无津|舌干/u],
  ['苔黄', /苔黄|舌苔黄/u], ['苔白', /苔白|舌苔白|白苔/u], ['苔腻', /苔腻|苔垢腻|苔黏腻/u],
  ['脉弦', /脉弦|脉沉弦|脉细弦|脉象弦/u], ['脉细', /脉细|脉沉细|脉弦细/u],
  ['脉数', /脉数|脉浮数|脉细数|脉滑数/u], ['脉滑', /脉滑|脉弦滑|脉洪滑/u],
  ['脉沉', /脉沉|脉沉细|脉沉弦/u], ['脉浮', /脉浮|脉浮数|脉浮紧/u],
  ['脉弱', /脉弱|脉微弱|脉细弱|脉无力/u], ['脉缓', /脉缓|脉濡缓/u],
  ['斑疹', /斑疹|发斑|发疹|痧疹|疹点/u], ['皮肤瘙痒', /皮肤瘙痒|身痒|遍身作痒/u],
];

const patterns = [
  '肝肾阴虚', '肝肾亏虚', '脾肾阳虚', '脾肾两虚', '脾胃虚寒', '脾胃气虚',
  '气血两虚', '气阴两伤', '气阴两虚', '气血亏虚', '营卫不和', '卫虚风袭',
  '营阴不足', '阴虚火旺', '真阴不足', '阴液亏损', '阳气虚衰', '中阳不足',
  '中气下陷', '肝风内动', '内风袭络', '痰火内扰', '痰湿内阻', '湿热中阻',
  '湿热蕴结', '湿热内蕴', '肝郁气滞', '气滞血瘀', '瘀血阻络', '肝胃不和',
  '胃气上逆', '浊阴上逆', '清阳不升', '肺气不宣', '肺失宣降', '邪在上焦',
  '邪入营分', '邪入血分', '暑湿伤气', '热盛伤津', '津液亏虚', '热入阳明',
  '风寒束表', '风热犯肺', '外感风寒', '湿邪困脾', '寒邪内伏', '寒湿内阻',
  '痰饮内停', '伏暑', '肺胃津伤', '肺胃阴伤', '胃阴不足', '肾气不纳',
  '气虚不摄', '肝木乘土', '肝阳上亢', '肝火上炎', '阳虚水泛', '心脾两虚',
  '上实下虚', '下虚上实', '肝血内亏', '阴血不足', '营血亏虚', '肝脾不和',
  '痰郁化火', '邪热内陷', '卫阳不固', '风阳上扰', '脾失健运', '肺脾气虚',
  '络脉久伤', '血热妄行', '热结膀胱', '寒热错杂', '正虚邪实', '血虚生风',
];
const therapies = [
  '辛凉解表', '辛凉解肌', '疏风解表', '解肌发表', '调和营卫', '清热解毒',
  '清热化湿', '清热利湿', '清热生津', '清热凉血', '清营凉血', '清化痰火',
  '清火消痰', '清宣肺气', '宣肺降逆', '宣肺化痰', '清肺止咳', '养阴润肺',
  '滋阴降火', '滋阴清热', '育阴潜阳', '滋液熄风', '育阴熄风', '平肝熄风',
  '养血平肝', '柔肝和胃', '疏肝理气', '疏肝和胃', '益气养阴', '滋养胃阴',
  '益气健脾', '健脾益气', '健脾化湿', '和胃降逆', '理气和中', '温中散寒',
  '温补脾肾', '回阳救逆', '温阳利水', '补肾纳气', '活血化瘀', '养血通络',
  '活血通络', '通阳化饮', '利湿化痰', '通宣三焦', '益气固表', '缓中补虚',
  '清气凉营', '清胆和胃', '清热养阴', '宣通络脉', '甘寒养阴', '辛开苦降',
];
const therapyCue = /(?:拟|议|当|宜|治|法|予|处以|务|用|取|从|须|宜先|应以|再从|仍从)/u;
const proofCue = /(?:此乃|乃是|是为|是由|此系|此属|皆为|实由|无非|此为|病由|病因|因是|根于|责之|病在)/gu;
const visits = /^(?:又(?:\s|[：。])|[二三四五六七八九十\d]+诊|复诊|再诊|次诊|续诊|更诊|初[一二三四五六七八九十]+日|[二三四五六七八九十\d]+日\s)/u;
const editorial = /^(?:华岫云|邵新甫|徐评|按[：:]|按语|以上[诸各]|附录|某按|编者)/u;
const startOfTreatment = /(?:医生|前医|诸医|医者|医用|曾服|先服|服药|误用|拟用|议用|治以|遂用|乃用|当用)/u;
const noMedicine = /^(?:同煎|汤煎|每服|另服|治宜|拟用|照前|前方|附方|水煎|每晚|早晚|临睡|先煎|煮成|日服|重煎|研末|下法|为末|鲜者|加减|再诊|去取|方用|煎服|过服|稍减|早服|均研|服后|一剂|同服|饭后|去渣|诸药)/u;
const observationWords = /(?:脉|舌|苔|色白|色赤|目眩|耳|汗|热|寒|咳|嗽|咽|喘|痛|胀|渴|不寐|难寐|纳|不食|足冷|四肢|痰|泄|呕|吐|大便|小便|溺|瘦|倦|气急|抖|红|昏|神疲|心悸|下血)/u;
const argued = /(?:此|乃|盖|故|由|因|为|属|失|伤|虚|痰|热|湿|寒|风|郁|瘀|耗|不纳|不固|不升|不降|不和)/u;
const medicineChars = /[参耆芪苓术桂草葛芎归芍杏仁麻姜枣熟地斛菊桑柏杞犀竹莲陈橘贝柴黄连翘郁附赭龙牡芩麦冬桔梗栝蒌薏蔻香朴砂骨壳柴防风薄荷合沉芦茯神茅蒲延胡藕楂曲芽芒硝泽莪莱菔蔓荆茴前桃牛肉鳖益栀丸丹汁胶粉]/u;
const historicalOnly = /马钱|乌头|草乌|川乌|白附|附片|附子|巴豆|狼毒|甘遂|大戟|芫花|斑蝥|蟾酥|雄黄|砒|轻粉|汞|朱砂|朱茯|铅|雌黄|硇砂|天雄|莨菪|闹羊花|雷公藤|关木通|广防己|青木香|罂粟|藤黄|犀角|羚羊|虎[骨胫]|穿山甲|来复丹/u;
const batchPreparation = /(?:膏方|议膏|膏剂|制膏|煎膏|成膏|收[成作老]*膏|熬膏|梨膏|胶膏丸|炼蜜|加蜜[。为]|蜜丸|捣丸|糊丸|水泛|作丸|为丸|丸极|法丸|为末|作末|散剂|每服[一二三四五六七八九十]丸)/u;
const canonicalNames = new Map(Object.entries({
  熟地: '熟地黄', 大熟地: '熟地黄', 生地: '生地黄', 细生地: '生地黄', 大生地: '生地黄',
  元参: '玄参', 玄参心: '玄参', 川贝: '川贝母', 浙贝: '浙贝母', 甘草梢: '甘草梢',
  炙草: '炙甘草', 生草: '生甘草', 黄耆: '黄芪', 绵黄耆: '黄芪', 广陈皮: '陈皮',
  甜广皮: '陈皮', 广皮: '陈皮', 桔梗: '桔梗', 川芎: '川芎', 枣仁: '酸枣仁',
  枸杞: '枸杞子', 杞子: '枸杞子', 川斛: '石斛', 钗斛: '石斛', 川石斛: '石斛',
  归身: '当归', 全当归: '当归', 粉丹皮: '牡丹皮', 丹皮: '牡丹皮', 云苓: '茯苓',
  白云苓: '茯苓', 茯苓块: '茯苓', 溦茯苓: '茯苓', 云苓皮: '茯苓皮', 泽潟: '泽泻',
  栝蒌仁: '瓜蒌子', 瓜蒌仁: '瓜蒌子', 栝蒌皮: '瓜蒌皮', 栝蒌: '瓜蒌',
  杏泥: '杏仁', 广郁金: '郁金', 苦桔梗: '桔梗', 薏仁: '薏苡仁', 苡仁: '薏苡仁',
  生苡仁: '薏苡仁', 金银花: '金银花', 银花: '金银花', 连心麦冬: '麦冬',
  麦门冬: '麦冬', 天门冬: '天冬', 川朴: '厚朴', 小枳实: '枳实',
}));
const digit = Object.fromEntries([...('零一二三四五六七八九')].map((value, index) => [value, index]));
digit.两 = 2;
const numberLanguage = '[一二三四五六七八九十半两零〇\\d]+';
const weightPattern = new RegExp(`(?:${numberLanguage})?[两钱分厘](?:半|(?:${numberLanguage})[钱分厘])*(?![两钱分厘])`, 'gu');
const countPattern = new RegExp(`(${numberLanguage})(枚|片|粒|个|根|条|茎)`, 'u');

function chineseNumber(text) {
  if (!text) return 1;
  if (text === '半') return 0.5;
  if (/^\d+$/u.test(text)) return Number(text);
  if (text === '〇') return 0;
  if (text in digit) return digit[text];
  if (/^[一二三四五六七八九]?十[一二三四五六七八九]?$/u.test(text)) {
    const [a, b] = text.split('十');
    return (a ? digit[a] : 1) * 10 + (b ? digit[b] : 0);
  }
  return null;
}

function weightInQian(raw) {
  const pieces = [...raw.matchAll(/([一二三四五六七八九十两零〇\d半]*?)([两钱分厘])(半?)/gu)];
  if (!pieces.length || pieces.map(piece => piece[0]).join('') !== raw) return null;
  const factors = { 两: 10, 钱: 1, 分: 0.1, 厘: 0.01 };
  let last = Infinity;
  let qian = 0;
  for (const item of pieces) {
    const amount = chineseNumber(item[1]);
    const unit = factors[item[2]];
    if (amount === null || unit >= last) return null;
    qian += (amount + Number(Boolean(item[3])) * 0.5) * unit;
    last = unit;
  }
  return qian > 0 ? qian : null;
}

function readQuantity(note) {
  if (!note || /(?:约|余|左右|等分|少许|数枚|各|[一二三四五六七八九十\d][、至或～—-][一二三四五六七八九十\d])|[\d一二三四五六七八九][一二三四五六七八九][钱两分]/u.test(note)) return null;
  const weights = [...note.matchAll(weightPattern)].filter(match => !/^[两分厘]$/u.test(match[0]));
  const count = note.match(countPattern);
  if (weights.length === 1 && !count) {
    const qian = weightInQian(weights[0][0]);
    if (qian !== null) return { raw: weights[0][0], qian };
  }
  if (!weights.length && count) {
    const quantity = chineseNumber(count[1]);
    if (quantity && Number.isInteger(quantity)) return { raw: count[0], unitCount: `${quantity}${count[2]}` };
  }
  return null;
}

function formatDose(quantity) {
  if (quantity.qian === undefined) return quantity.unitCount;
  return `${Number((quantity.qian * gramsPerQian).toFixed(3))}g`;
}

function omitDoseFromNote(note, quantity) {
  return note.replace(quantity.raw, '')
    .replace(/([，、,：:])[，、,：:\s]+/gu, '$1')
    .replace(/^[，、,：:\s]+|[，、,：:\s]+$/gu, '');
}

function tokenizePrescription(line) {
  if (!line || line.length > 390 || /[。！？；：\n]/u.test(line) || noMedicine.test(line)) return null;
  const expanded = line.replace(/）(?=[\p{Script=Han}])/gu, '） ');
  const tokens = [];
  let token = '';
  let noteDepth = 0;
  for (const char of expanded) {
    if (char === '（') noteDepth++;
    if (char === '）') noteDepth--;
    if (noteDepth < 0) return null;
    if (!noteDepth && /[\s、，]/u.test(char)) {
      if (token) tokens.push(token);
      token = '';
    } else {
      token += char;
    }
  }
  if (noteDepth) return null;
  if (token) tokens.push(token);
  if (tokens.length < 3 || tokens.length > 30) return null;
  const matches = tokens.map(piece => piece.match(/^([\p{Script=Han}]{2,13})(?:（([^（）]{1,45})）)?$/u));
  if (matches.some(match => !match || noMedicine.test(match[1]) || /(?:本方|前方|后服|为君|加用|另加|三剂|为末|合煎|用法|剂量|不宜|丸方|用药)/u.test(match[1]))) return null;
  const medicinal = matches.filter(match => medicineChars.test(match[1])).length;
  const measured = matches.filter(match => readQuantity(match[2])).length;
  if (medicinal < Math.ceil(matches.length * (measured >= 2 ? 0.6 : 0.83))) return null;
  return matches.map(match => ({ rawName: match[1], rawNote: match[2] ?? '' }));
}

function firstPrescription(lines) {
  for (const [index, { text }] of lines.slice(1).entries()) {
    if (visits.test(text) || editorial.test(text)) break;
    const items = tokenizePrescription(text);
    if (items) return { index: index + 1, text, items };
  }
  return null;
}

function caseTags(heading, raw, excerpt, includeExcerpt = true) {
  const cutoff = raw.search(startOfTreatment);
  const observed = cutoff > 0 ? raw.slice(0, cutoff) : raw;
  const hits = [];
  for (const [tag, pattern] of symptomPatterns) {
    const found = [...observed.matchAll(new RegExp(pattern.source, 'gu'))].find(match => {
      const prefix = observed.slice(Math.max(0, match.index - 5), match.index);
      return !/(?:并无|亦无|未见|不见|并未|不觉|无|未|非|勿|不)$/u.test(prefix);
    });
    if (found && !hits.some(hit => hit.tag === tag)) hits.push({ tag, position: found.index });
  }
  if (!hits.length && /^(?:腹痛|头痛|咳嗽|吐血|鼻衄|咽痛|便血|泄泻|失音)$/u.test(heading) && raw.includes(heading)) {
    hits.push({ tag: heading, position: raw.indexOf(heading) });
  }
  if (includeExcerpt && hits.length < 3) {
    for (const phrase of excerpt.split(/[。；，、：]/u)) {
      if (phrase.length < 2 || phrase.length > 15 || !observationWords.test(phrase)
          || !raw.includes(phrase) || /医|诊为|治|体质|素禀|汤|法|宜|盖|津液|先|近则|至今|经云|以致|所以/u.test(phrase)
          || /(?:虽不|下焦湿热|时令暴热|热气吸入)|^(?:夫|与|（|则|且|故|此|乃|由|辛以|苦以|清以|湿热下趋|阳明胃脉)/u.test(phrase)
          || hits.some(hit => phrase.includes(hit.tag) || hit.tag.includes(phrase))) continue;
      hits.push({ tag: phrase, position: raw.indexOf(phrase) });
      if (hits.length >= 3) break;
    }
  }
  return hits.sort((first, second) => first.position - second.position).slice(0, 12).map(hit => hit.tag);
}

const pairApproaches = [
  ['清解热邪', /发热|恶寒|咽痛|口渴/u, [['金银花', '连翘'], ['淡竹叶', '连翘']]],
  ['养阴润肺', /咳|咽干|口干|咯血|声哑/u, [['沙参', '麦冬'], ['天冬', '麦冬']]],
  ['理气化痰', /痰|咳|呕|喘|胸闷/u, [['半夏', '陈皮'], ['半夏', '橘红']]],
  ['降逆和胃', /呕|反酸|嗳气|呃逆/u, [['半夏', '生姜'], ['赭石', '旋覆花']]],
  ['利水渗湿', /水肿|腹胀|小便短|小便不利/u, [['茯苓', '泽泻'], ['猪苓', '泽泻']]],
  ['健脾益气', /食欲减退|大便溏|倦怠|食少|泄泻/u, [['人参', '白术'], ['白术', '茯苓'], ['党参', '白术'], ['党参', '于术']]],
  ['疏理气机', /胁痛|胁胀|脘痞|胸闷|脉弦/u, [['柴胡', '白芍'], ['香附', '郁金']]],
  ['养血通络', /麻木|不遂|肢体无力|身痛/u, [['当归', '白芍'], ['当归', '鸡血藤']]],
  ['益气养阴', /多汗|自汗|气短|口渴|咳嗽/u, [['人参', '麦冬', '五味'], ['党参', '麦冬', '五味']]],
  ['清热化痰、宽胸散结', /胸闷|胸痛|脘痞|苔腻/u, [['黄连', '半夏', '瓜蒌'], ['川连', '半夏', '栝蒌']]],
  ['理气化痰、和胃', /呕吐|心悸|胸闷|脘痞/u, [['半夏', '竹茹', '枳实']]],
];

function reasoning(text, tags, medicines, location, formulaLabel = '首方') {
  const sentences = text.split(/[。！？；\n]/u).filter(Boolean);
  const clinical = sentences.filter(sentence => !/前医|误治|诸医|医投|曾服|或谓/u.test(sentence));
  const pattern = patterns.filter(value => clinical.some(sentence => sentence.includes(value))).slice(0, 3);
  let inferredClause = null;
  if (!pattern.length) {
    const clauses = clinical.flatMap(sentence => [...sentence.matchAll(proofCue)].map(match =>
      sentence.slice(match.index + match[0].length).split(/[，、：]/u)[0]));
    inferredClause = clauses.find(value => /^[\p{Script=Han}]{4,25}$/u.test(value)
      && /(?:虚|实|痰|湿|寒|热|风|气|血|阴|阳|燥|瘀|结|郁|损|络)/u.test(value)
      && !/或|误|未必|不必|不可|勿以/u.test(value));
    inferredClause ??= [...clinical].reverse().flatMap(sentence => sentence.split(/[，、：]/u)).find(value =>
      /^[\p{Script=Han}]{5,22}$/u.test(value) && argued.test(value)
      && /(?:气虚|血虚|阴虚|阳虚|湿热|痰饮|痰火|风木|风阳|肺气|肝阳|脾阳|胃阴|气机|气逆|胃阳|阳明|少阳|少阴|太阴|营卫|经络|奇经|肝风|肝木|脉络|经隧|伤津|热邪|寒邪|湿邪|上焦|中焦|下焦)/u.test(value)
      && !/或谓|误|未必|不必|不可|勿以|昔|闻/u.test(value));
  }
  if (!pattern.length && !inferredClause) {
    inferredClause = [...clinical].reverse().flatMap(sentence => sentence.split(/[，：]/u)).find(value =>
      /^[\p{Script=Han}]{5,23}$/u.test(value) &&
      /(?:议以|拟[从用]|当[从用]|治宜|治当|用意|为先|为主|宜[补清温养宣通和]|宜复|拟[清温养疏和通益])/u.test(value)
      && !/不可|勿|前医|不宜|不当/u.test(value));
  }
  const therapy = therapies.filter(value => clinical.some(sentence => {
    const at = sentence.indexOf(value);
    return at !== -1 && therapyCue.test(sentence.slice(Math.max(0, at - 10), at));
  })).slice(0, 2);
  const diagnosis = pattern.length ? `原案辨证涉及${pattern.join('、')}。`
    : inferredClause ? `辨证时提到“${inferredClause}”。` : '';
  const names = medicines.map(item => item.name);
  const approach = pairApproaches.find(([, symptom, pairs]) =>
    symptom.test(tags.join('/')) && pairs.some(pair => pair.every(medicine => names.some(name =>
      name === medicine || name.endsWith(medicine) || name === `${medicine}子`))));
  const orientation = therapy.length ? `治法取${therapy.join('、')}。`
    : approach ? `${formulaLabel}配伍有${approach[0]}之意。`
      : `${formulaLabel}用${names.slice(0, 4).join('、')}等药辨治。`;
  return `原案着眼于${tags.slice(0, 4).join('、')}。${diagnosis}${orientation}\n${location}`;
}

function makeMedicine(item, excludeWeights) {
  const name = canonicalNames.get(item.rawName) ?? item.rawName;
  const combinesFormulas = /加.+/u.test(item.rawName);
  const quantity = excludeWeights || historicalOnly.test(item.rawName) || combinesFormulas ? null : readQuantity(item.rawNote);
  const originalNote = quantity ? omitDoseFromNote(item.rawNote, quantity) : item.rawNote;
  const notes = [];
  if (name !== item.rawName) notes.push(`原载${item.rawName}`);
  if (originalNote) notes.push(`原注${originalNote}`);
  if (combinesFormulas) notes.push('原文合方加减');
  return {
    name,
    note: notes.join('；'),
    dose: quantity ? formatDose(quantity) : '',
    ...(quantity ? { original_dose: quantity.raw } : {}),
  };
}

function caseSourceList(book) {
  return book.chapters.flatMap(chapter => {
    let groups;
    if (book.key === 'shiliu') {
      if (!chapter.volume || /卷十[八九]|卷二十|论著|温疫说/u.test(chapter.volume + chapter.title)) return [];
      groups = groupCases(chapterLines(chapter), line => casePatient(line) !== null, line => editorial.test(line));
    } else if (book.key === 'shentang') {
      if (!/^卷[一二三四五六七八九十]$/u.test(chapter.title)) return [];
      groups = groupCases(chapterLines(chapter), line => /^（案\d+）/u.test(line), line => editorial.test(line));
    } else if (book.key === 'jingxiang') {
      if (!chapter.volume || !chapter.title.endsWith('门')) return [];
      const lines = chapterLines(chapter);
      const annotation = /^(?:诒按|按[：:]|柳按)/u;
      groups = lines.flatMap((line, index) => {
        if (index && !annotation.test(lines[index - 1].text)) return [];
        const prescription = lines[index + 1]?.text;
        if (!observationWords.test(line.text) || !tokenizePrescription(prescription)
            || !annotation.test(lines[index + 2]?.text ?? '')) return [];
        return [[line, lines[index + 1]]];
      });
    } else {
      groups = chapterGroups(book, chapter);
    }
    return [{ chapter, groups }];
  });
}

function numberedCaseDisease(head, tags) {
  const diagnoses = ['疟疾', '温疟', '风温', '湿温', '冬温', '暑温', '伏暑', '中风', '伤寒', '咳嗽', '痢疾', '痰饮', '痞满', '虚劳', '哮喘', '崩漏', '泄泻', '水肿', '腹痛', '头痛', '便血', '齿衄'];
  return diagnoses.find(name => head.includes(name)) ?? (head.includes('患疟') ? '疟' : tags[0]);
}

function enrich(book, chapter, lines) {
  const fail = reason => {
    const stats = rejection[book.key] ?? (rejection[book.key] = {});
    stats[reason] = (stats[reason] ?? 0) + 1;
    return null;
  };
  const first = firstPrescription(lines);
  if (!first || !lines.length) return fail('prescription');
  const old = buildRecord(book, chapter, lines);
  if (!old) return fail('format');
  const head = casePatient(lines[0].text) || lines[0].text;
  const tags = caseTags(old.diseases, head, old.symptoms);
  if (!tags.length) return fail('tags');
  const context = lines.slice(0, first.index).map(line => line.text).join('\n');
  const administration = lines[first.index + 1]?.text ?? '';
  const application = lines.slice(first.index + 1, first.index + 4).map(line => line.text);
  const nextVisit = application.findIndex(line => visits.test(line) || casePatient(line) !== null);
  const useOfFirstFormula = (nextVisit < 0 ? application : application.slice(0, nextVisit)).join('\n');
  const child = old.subject === '儿科' || /小儿|乳儿|痘[疹症]|惊疳|年[一二三四五六七八九]岁/u.test(chapter.title + context);
  const maternity = /妊娠|怀娠|胎前|有孕|孕妇|坐草|妊病|产后/u.test(context + chapter.title);
  const subject = child ? '儿科' : maternity ? '妇科' : old.subject;
  const excludeWeights = subject === '儿科'
    || /妊娠|怀娠|胎前|有孕|孕妇|坐草|妊病|[一二三四五六七八九十]月龄/u.test(context + chapter.title)
    || batchPreparation.test(useOfFirstFormula)
    || batchPreparation.test(context.split(/[。；]/u).slice(-3).join(''));
  const medicines = first.items.map(item => makeMedicine(item, excludeWeights));
  if (new Set(medicines.map(item => item.name)).size !== medicines.length) return fail('medicine name');
  const location = old.summary.split('\n')[0];
  const summary = reasoning(context, tags, medicines, location);
  const method = /^(?:以水|用水|水煎|水[一二三四五六七八九十半\d]+[碗杯盏升]|煎成|煎取|煮成|煮取|每服|温服)/u.test(administration)
    && administration.length <= 180 ? administration : null;
  const { source, ...fields } = old;
  return {
    ...fields,
    diseases: book.key === 'shentang' ? numberedCaseDisease(head, tags)
      : book.key === 'jingxiang' ? old.diseases.replace(/门$/u, '') : old.diseases,
    symptoms: tags.join('/'),
    subject,
    treatment: '方药',
    prescription: first.text.length <= 200 ? first.text : medicines.map(item => item.name).join('、'),
    modern_prescription: JSON.stringify(medicines),
    summary,
    method,
    source: { ...source, prescription_paragraph: lines[first.index].ordinal },
  };
}

function score(row) {
  const items = JSON.parse(row.modern_prescription);
  return items.filter(item => item.dose).length * 2 + row.symptoms.split('/').length
    + Number(Boolean(row.method)) + Math.min(items.length, 12) / 5;
}

function roundRobinChapters(book) {
  const chapters = caseSourceList(book).map(({ chapter, groups }) =>
    groups.map(lines => enrich(book, chapter, lines)).filter(Boolean).sort((a, b) => score(b) - score(a)));
  const result = [];
  for (let index = 0; chapters.some(chapter => chapter.length > index); index++) {
    for (const chapter of chapters) if (chapter[index]) result.push(chapter[index]);
  }
  return result;
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) throw new Error('Provide the directory with the named HTML source snapshots');
  const old = JSON.parse(await fs.readFile(oldUrl, 'utf8'));
  const collection = await Promise.all(books.map(book => readSource(book, directory)));
  const accept = deduplicator();
  const oldLocations = new Set();
  for (const record of old.records) {
    accept(record.content);
    oldLocations.add(`${record.source.book}:${record.source.paragraphs[0]}`);
  }
  const candidates = collection.map(roundRobinChapters);
  console.log('Eligible cases:', Object.fromEntries(collection.map((book, index) => [book.name, candidates[index].length])));
  console.log('Excluded candidates:', rejection);
  const records = [];
  const cursor = candidates.map(() => 0);
  function select(index, count) {
    let taken = 0;
    while (taken < count && cursor[index] < candidates[index].length) {
      const row = candidates[index][cursor[index]++];
      const key = `${row.source.book}:${row.source.paragraphs[0]}`;
      if (!oldLocations.has(key) && accept(row.content)) {
        records.push(row);
        taken++;
      }
    }
    return taken;
  }
  for (const [index, book] of collection.entries()) select(index, desired.get(book.key));
  while (records.length < 1000) {
    const before = records.length;
    for (const index of candidates.keys()) {
      if (records.length < 1000) select(index, 1);
    }
    if (before === records.length) throw new Error(`Only ${records.length} additional cases matched source and structure requirements`);
  }
  const metadata = collection.map(book => ({
    key: book.key, bookname: book.name, edition: book.edition, source_url: book.url,
    historical_attribution: book.attribution, scans: book.scans, snapshot_sha256: book.sha,
    selected: records.filter(row => row.source.book === book.key).length,
  }));
  const lookup = new Map(collection.flatMap(book => book.chapters.map(chapter => [
    `${book.key}:${chapter.source_ordinal}`, new Map(chapterLines(chapter).map(line => [line.ordinal, line.text])),
  ])));
  for (const row of records) {
    const ref = lookup.get(`${row.source.book}:${row.source.heading_ordinal}`);
    if (!ref || row.source.paragraphs.map(ordinal => ref.get(ordinal)).join('\n') !== row.content
        || !row.source.paragraphs.includes(row.source.prescription_paragraph)
        || !tokenizePrescription(ref.get(row.source.prescription_paragraph))) {
      throw new Error(`Invalid case text or prescription source: ${row.source.book}:${row.source.prescription_paragraph}`);
    }
  }
  await fs.writeFile(outputUrl, JSON.stringify({
    digital_text: old.digital_text,
    dosage: { type: '原案重量折算', grams_per_qian: gramsPerQian, source_url: doseSource },
    previous_dataset_sha256: sha256(await fs.readFile(oldUrl)),
    sources: metadata,
    records,
  }, null, 2) + '\n', 'utf8');
  console.log('Selected cases:', Object.fromEntries(metadata.map(book => [book.bookname, book.selected])));
  console.log('Cases with recorded or converted quantities:', records.filter(row => JSON.parse(row.modern_prescription).some(item => item.dose)).length);
}

export { books, caseSourceList, enrich, tokenizePrescription, makeMedicine, caseTags, reasoning };
export { doseSource, gramsPerQian, readQuantity, formatDose, omitDoseFromNote };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

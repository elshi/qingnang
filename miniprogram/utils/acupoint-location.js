const regions = require('./acupoint-location-regions');

const regionByPoint = Object.create(null);
for (const [region, points] of Object.entries(regions)) {
  for (const point of points.split(' ')) regionByPoint[point] = region;
}

// Boxes are percentages of the neutral body outline. They cover areas rather than points.
const boxes = {
  head: [39, 3, 22, 9], face: [41, 5, 18, 6], neck: [43, 10, 14, 5],
  shoulder: [22, 14, 16, 7], axilla: [25, 18, 13, 6], chest: [32, 15, 36, 11],
  sideChest: [27, 17, 12, 10], upperAbdomen: [33, 24, 34, 8], abdomen: [29, 30, 42, 10],
  sideAbdomen: [27, 25, 14, 11], groin: [31, 36, 15, 8], pelvis: [38, 39, 24, 10],
  back: [30, 15, 40, 14], waist: [29, 27, 42, 11], spine: [44, 14, 12, 24],
  buttock: [29, 35, 23, 13], upperArm: [16, 19, 15, 11], elbow: [13, 27, 13, 8],
  forearm: [9, 30, 16, 10], wrist: [8, 35, 12, 6], hand: [5, 37, 13, 9],
  thigh: [29, 44, 19, 20], knee: [28, 62, 17, 10], lowerLeg: [26, 68, 17, 19],
  ankle: [26, 85, 15, 7], foot: [22, 90, 19, 8],
  headNeck: [38, 3, 24, 12], frontTorso: [28, 15, 44, 24],
  backTorso: [28, 15, 44, 26], upperLimb: [6, 18, 28, 27], lowerLimb: [23, 44, 26, 54]
};

const areaGroups = [
  [/^(项部|颈后部|颈前部|颈部)$/u, 'neck'], [/^头部$/u, 'head'],
  [/^(面|耳|鼻|口腔|上唇)/u, 'face'], [/^肩/u, 'shoulder'], [/^腋/u, 'axilla'],
  [/^前胸/u, 'chest'], [/^侧胸/u, 'sideChest'], [/^上腹/u, 'upperAbdomen'],
  [/^下腹/u, 'abdomen'], [/^侧腹/u, 'sideAbdomen'], [/^腹股沟/u, 'groin'], [/^会阴/u, 'pelvis'],
  [/^背/u, 'back'], [/^腰/u, 'waist'], [/^(骶|脊柱)/u, 'spine'], [/^臀/u, 'buttock'],
  [/^前臂/u, 'forearm'], [/^臂/u, 'upperArm'], [/^肘/u, 'elbow'], [/^腕/u, 'wrist'], [/^手/u, 'hand'],
  [/^股/u, 'thigh'], [/^膝/u, 'knee'], [/^小腿/u, 'lowerLeg'], [/^踝/u, 'ankle'], [/^足/u, 'foot']
];

const broadRegions = {
  头颈部穴位: ['头颈部', 'headNeck', false], 胸腹部穴位: ['胸腹部', 'frontTorso', false],
  腰背部穴位: ['腰背部', 'backTorso', true], 上肢部穴位: ['上肢', 'upperLimb', false],
  下肢部穴位: ['下肢', 'lowerLimb', false]
};
const oldPrefixes = { SJ: 'TE', RN: 'CV', DU: 'GV' };
const codePattern = /^(?:(?:EX-[A-Z]{1,3}|[A-Z]{1,4})\d+\+?)$/u;

function createLocationDiagram(item) {
  const title = String(item.title || item.name || '').normalize('NFKC').trim();
  const suffix = title.match(/\(([^()]+)\)$/u);
  const code = String(item.code || suffix?.[1] || '').normalize('NFKC').replace(/\s+/gu, '').toUpperCase();
  const oldCode = code === 'EX-HN3' ? 'GV24+' : code.replace(/^(SJ|RN|DU)(?=\d)/u, prefix => oldPrefixes[prefix]);
  const name = suffix && codePattern.test(code) ? title.slice(0, suffix.index).trim() : title;
  if (oldCode === 'LI4') {
    return { label: '第2掌骨的拇指侧', view: '手背', pointImage: '/assets/meridians/acupoint-hegu.png' };
  }
  const standardArea = regionByPoint[oldCode] || regionByPoint[name];
  const group = standardArea && areaGroups.find(([pattern]) => pattern.test(standardArea));
  const posterior = /^(项部|背部|腰|骶|脊柱|臀|手背|足底)|后[侧区部]/u.test(standardArea || '')
    || (group?.[1] === 'head' && /^GV(?:1[6-9]|2[0-2])$/u.test(oldCode));
  const region = group ? [standardArea, group[1], posterior] : broadRegions[item.position];
  if (!region) return null;
  const [label, box, back] = region;
  // Sacral and spinal regions both use the posterior silhouette, at different heights.
  const [left, top, width, height] = label === '骶部' ? [40, 34, 20, 12] : boxes[box];
  return {
    label, back, view: back ? '背面' : '正面',
    style: `left:${left}%;top:${top}%;width:${width}%;height:${height}%`
  };
}

module.exports = { createLocationDiagram };

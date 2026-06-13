const cases = [
  { id: 'case-001', type: 'case', title: '张仲景 · 太阳中风', dynasty: '东汉', doctor: '张仲景', doctorId: 'doctor-zhang', source: '伤寒论', sourceId: 'source-shanghan', summary: '太阳中风，发热汗出，恶风，鼻鸣干呕。', tags: ['太阳病', '桂枝汤'], original: '太阳中风，阳浮而阴弱。', analysis: '以桂枝汤调和营卫。' },
  { id: 'case-002', type: 'case', title: '叶天士 · 湿热咳嗽', dynasty: '清', doctor: '叶天士', doctorId: 'doctor-ye', source: '临证指南医案', sourceId: 'source-neijing', summary: '身热不扬，胸闷咳嗽，舌苔黄腻。', tags: ['湿热', '咳嗽'], original: '湿热蕴肺，肺失清肃。', analysis: '轻清宣化，分消走泄。' }
];

const books = [
  {
    id: 'book-001', type: 'book', title: '黄帝内经', author: '佚名', dynasty: '周', dynastyGroup: '周',
    summary: '中医理论渊薮，养生治病之根本。', tags: ['内经', '养生理论'],
    readCount: '2.3w',
    chapters: [{ id: 'chapter-001', title: '上古天真论节选', original: '上古之人，其知道者，法于阴阳，和于术数。', translation: '古时懂得养生之道的人，会顺应阴阳变化。', annotation: '强调顺时、节制与身心调摄。' }]
  },
  {
    id: 'book-002', type: 'book', title: '景岳全书', author: '张景岳', dynasty: '明', dynastyGroup: '明',
    summary: '明代综合性医书，详论辨证、治法与方药。', tags: ['本草巨著', '药物学'],
    readCount: '1.8w',
    chapters: [{ id: 'chapter-001', title: '传忠录节选', original: '肺为娇脏，寒气所伤，最易咳嗽。', translation: '肺脏性质清虚娇嫩，受寒邪影响时容易咳嗽。', annotation: '古籍对脏腑特性的经典表达。' }]
  },
  {
    id: 'book-003', type: 'book', title: '伤寒论', author: '张仲景', dynasty: '汉', dynastyGroup: '秦汉',
    summary: '辨太阳病脉证并治，开辨证论治之先河。', tags: ['伤寒圣典', '辨证论治'],
    readCount: '3.6w',
    chapters: [{ id: 'chapter-001', title: '辨太阳病脉证并治', original: '太阳之为病，脉浮，头项强痛而恶寒。', translation: '太阳病常见脉浮、头项强痛和怕冷。', annotation: '太阳病提纲证。' }]
  },
  {
    id: 'book-004', type: 'book', title: '温病条辨', author: '吴鞠通', dynasty: '清', dynastyGroup: '清',
    summary: '温病学奠基之作，辨治温病之纲领。', tags: ['温病学', '温热病'],
    readCount: '1.2w',
    chapters: [{ id: 'chapter-001', title: '上焦篇', original: '温邪上受，首先犯肺。', translation: '温热之邪从口鼻而入，首先影响肺。', annotation: '温病上焦证治纲领。' }]
  },
  {
    id: 'book-005', type: 'book', title: '金匮要略', author: '张仲景', dynasty: '汉', dynastyGroup: '秦汉',
    summary: '杂病论治典范，方书之祖。', tags: ['伤寒续篇', '杂病论治'],
    readCount: '1.5w',
    chapters: [{ id: 'chapter-001', title: '脏腑经络先后病', original: '上工治未病，何也？', translation: '高明的医者重视在疾病发生前防治。', annotation: '治未病思想。' }]
  }
];

const prescriptions = [
  { id: 'prescription-001', type: 'prescription', title: '桂枝汤', source: '《伤寒论》', summary: '发汗解肌，温通经脉，主治外感风寒表虚证。', composition: '桂枝、芍药、甘草、生姜、大枣', tags: ['解表和营', '调和营卫'], efficacy: '解肌发表', image: '/assets/home/mortar.jpg', readCount: '2.3w', explanation: '学习调和营卫的配伍思想。' },
  { id: 'prescription-002', type: 'prescription', title: '四君子汤', source: '《太平惠民和剂局方》', summary: '益气健脾，主治脾胃气虚证。', composition: '人参、白术、茯苓、甘草', tags: ['益气健脾'], efficacy: '补气健脾', image: '/assets/home/herb.jpg', readCount: '1.9w', explanation: '理解补气健脾类方剂的基础结构。' },
  { id: 'prescription-003', type: 'prescription', title: '逍遥散', source: '《太平惠民和剂局方》', summary: '疏肝解郁，健脾养血，主治肝郁脾虚证。', composition: '柴胡、当归、白芍、白术、茯苓、甘草', tags: ['疏肝解郁', '健脾养血'], efficacy: '疏肝养血', image: '/assets/home/herb.jpg', readCount: '1.6w', explanation: '学习肝脾同调的组方思路。' },
  { id: 'prescription-004', type: 'prescription', title: '当归四逆汤', source: '《伤寒论》', summary: '温经散寒，养血通脉，主治血虚寒厥证。', composition: '当归、桂枝、芍药、细辛、通草、甘草、大枣', tags: ['温经散寒', '养血通脉'], efficacy: '温经通脉', image: '/assets/home/mortar.jpg', readCount: '1.2w', explanation: '学习温养血脉的配伍方法。' },
  { id: 'prescription-005', type: 'prescription', title: '补中益气汤', source: '《脾胃论》', summary: '补中益气，升阳举陷，主治脾胃气虚下陷。', composition: '黄芪、人参、白术、甘草、当归、陈皮、升麻、柴胡', tags: ['补中益气', '升阳举陷'], efficacy: '补气升阳', image: '/assets/home/herb.jpg', readCount: '1.1w', explanation: '学习甘温除热与升阳举陷。' }
];

const meridians = [
  {
    id: 'meridian-001', type: 'meridian', title: '督脉', alias: ['阳脉之海'], summary: '起于下极之俞，并于脊里，上行入脑。',
    route: '起于胞中，下出会阴，沿脊柱上行至头面。', acupoints: ['长强', '命门', '大椎', '百会'],
    indications: '学习督脉循行及常用腧穴。', application: '仅作学习参考。', tags: ['奇经八脉'],
    diagram: '/assets/home/meridian.jpg', orientation: 'back',
    markers: [{ name: '百会', top: 15, left: 51 }, { name: '大椎', top: 31, left: 51 }, { name: '命门', top: 56, left: 51 }, { name: '长强', top: 76, left: 51 }]
  },
  {
    id: 'meridian-002', type: 'meridian', title: '任脉', alias: ['阴脉之海'], summary: '起于胞中，下出会阴，向上行腹里。',
    route: '起于胞中，下出会阴，沿腹胸正中上行。', acupoints: ['会阴', '关元', '膻中', '承浆'],
    indications: '学习任脉循行及常用腧穴。', application: '仅作学习参考。', tags: ['奇经八脉'],
    diagram: '/assets/home/meridian.jpg', orientation: 'front',
    markers: [{ name: '承浆', top: 17, left: 51 }, { name: '膻中', top: 40, left: 51 }, { name: '关元', top: 66, left: 51 }, { name: '会阴', top: 78, left: 51 }]
  }
];

module.exports = { cases, books, prescriptions, meridians };

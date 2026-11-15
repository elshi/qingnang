// Standard point names: WHO International Acupuncture Nomenclature (1991).
// Extraordinary-vessel meeting points: Gansu University of Chinese Medicine
// affiliated hospital, https://www.zyxyfy.com/zywh/zyzs/qjbm/content_2968.
// Names represent points, not the number of bilateral physical locations.
const definitions = [
  ['lung', '手太阴肺经', 'LU', '#AE782F', '胸部 → 上肢内侧前缘 → 拇指', '中府 云门 天府 侠白 尺泽 孔最 列缺 经渠 太渊 鱼际 少商'],
  ['large-intestine', '手阳明大肠经', 'LI', '#C49C46', '食指 → 上肢外侧前缘 → 肩颈 → 鼻旁', '商阳 二间 三间 合谷 阳溪 偏历 温溜 下廉 上廉 手三里 曲池 肘髎 手五里 臂臑 肩髃 巨骨 天鼎 扶突 口禾髎 迎香'],
  ['stomach', '足阳明胃经', 'ST', '#C39147', '头面 → 胸腹 → 下肢前侧 → 第二趾', '承泣 四白 巨髎 地仓 大迎 颊车 下关 头维 人迎 水突 气舍 缺盆 气户 库房 屋翳 膺窗 乳中 乳根 不容 承满 梁门 关门 太乙 滑肉门 天枢 外陵 大巨 水道 归来 气冲 髀关 伏兔 阴市 梁丘 犊鼻 足三里 上巨虚 条口 下巨虚 丰隆 解溪 冲阳 陷谷 内庭 厉兑'],
  ['spleen', '足太阴脾经', 'SP', '#8F9E79', '足大趾 → 下肢内侧 → 腹部 → 胸侧', '隐白 大都 太白 公孙 商丘 三阴交 漏谷 地机 阴陵泉 血海 箕门 冲门 府舍 腹结 大横 腹哀 食窦 天溪 胸乡 周荣 大包'],
  ['heart', '手少阴心经', 'HT', '#B56D60', '腋下 → 上肢内侧后缘 → 小指', '极泉 青灵 少海 灵道 通里 阴郄 神门 少府 少冲'],
  ['small-intestine', '手太阳小肠经', 'SI', '#BC826A', '小指 → 上肢外侧后缘 → 肩胛 → 耳前', '少泽 前谷 后溪 腕骨 阳谷 养老 支正 小海 肩贞 臑俞 天宗 秉风 曲垣 肩外俞 肩中俞 天窗 天容 颧髎 听宫'],
  ['bladder', '足太阳膀胱经', 'BL', '#9D8093', '目内眦 → 头顶 → 背部 → 下肢后侧 → 足小趾', '睛明 攒竹 眉冲 曲差 五处 承光 通天 络却 玉枕 天柱 大杼 风门 肺俞 厥阴俞 心俞 督俞 膈俞 肝俞 胆俞 脾俞 胃俞 三焦俞 肾俞 气海俞 大肠俞 关元俞 小肠俞 膀胱俞 中膂俞 白环俞 上髎 次髎 中髎 下髎 会阳 承扶 殷门 浮郄 委阳 委中 附分 魄户 膏肓 神堂 譩譆 膈关 魂门 阳纲 意舍 胃仓 肓门 志室 胞肓 秩边 合阳 承筋 承山 飞扬 跗阳 昆仑 仆参 申脉 金门 京骨 束骨 足通谷 至阴'],
  ['kidney', '足少阴肾经', 'KI', '#5B9197', '足底 → 下肢内侧后缘 → 腹胸', '涌泉 然谷 太溪 大钟 水泉 照海 复溜 交信 筑宾 阴谷 横骨 大赫 气穴 四满 中注 肓俞 商曲 石关 阴都 腹通谷 幽门 步廊 神封 灵墟 神藏 彧中 俞府'],
  ['gallbladder', '足少阳胆经', 'GB', '#6E9B85', '目外眦 → 头侧 → 胁肋 → 下肢外侧 → 第四趾', '瞳子髎 听会 上关 颔厌 悬颅 悬厘 曲鬓 率谷 天冲 浮白 头窍阴 完骨 本神 阳白 头临泣 目窗 正营 承灵 脑空 风池 肩井 渊腋 辄筋 日月 京门 带脉 五枢 维道 居髎 环跳 风市 中渎 膝阳关 阳陵泉 阳交 外丘 光明 阳辅 悬钟 丘墟 足临泣 地五会 侠溪 足窍阴'],
  ['liver', '足厥阴肝经', 'LR', '#879E6C', '足大趾 → 下肢内侧 → 少腹 → 胁肋', '大敦 行间 太冲 中封 蠡沟 中都 膝关 曲泉 阴包 足五里 阴廉 急脉 章门 期门'],
  ['triple-energizer', '手少阳三焦经', 'TE', '#68A296', '无名指 → 上肢外侧中部 → 肩颈 → 眉梢', '关冲 液门 中渚 阳池 外关 支沟 会宗 三阳络 四渎 天井 清冷渊 消泺 臑会 肩髎 天髎 天牖 翳风 瘈脉 颅息 角孙 耳门 耳和髎 丝竹空'],
  ['pericardium', '手厥阴心包经', 'PC', '#A4839C', '胸部 → 上肢内侧中部 → 中指', '天池 天泉 曲泽 郄门 间使 内关 大陵 劳宫 中冲'],
  ['ren', '任脉', 'CV', '#B7803A', '会阴 → 腹胸前正中线 → 下颌', '会阴 曲骨 中极 关元 石门 气海 阴交 神阙 水分 下脘 建里 中脘 上脘 巨阙 鸠尾 中庭 膻中 玉堂 紫宫 华盖 璇玑 天突 廉泉 承浆'],
  ['du', '督脉', 'GV', '#98717B', '会阴后 → 脊柱后正中线 → 头顶 → 上唇', '长强 腰俞 腰阳关 命门 悬枢 脊中 中枢 筋缩 至阳 灵台 神道 身柱 陶道 大椎 哑门 风府 脑户 强间 后顶 百会 前顶 囟会 上星 神庭 素髎 水沟 兑端 龈交'],
  ['yin-wei', '阴维脉', '', '#7E9A82', '小腿内侧 → 大腿内侧 → 腹胸 → 颈部', '筑宾 府舍 大横 腹哀 期门 天突 廉泉'],
  ['chong', '冲脉', '', '#BB7864', '少腹 → 腹部两侧 → 胸部 → 咽喉', '会阴 阴交 气冲 横骨 大赫 气穴 四满 中注 肓俞 商曲 石关 阴都 腹通谷 幽门'],
  ['yang-wei', '阳维脉', '', '#9A879F', '足跟外侧 → 下肢外侧 → 肩部 → 头项', '金门 阳交 臑俞 天髎 肩井 头维 本神 阳白 头临泣 目窗 正营 承灵 脑空 风池 风府 哑门'],
  ['yin-qiao', '阴跷脉', '', '#699894', '足内踝 → 下肢内侧 → 胸颈 → 目内眦', '照海 交信 睛明'],
  ['yang-qiao', '阳跷脉', '', '#A18B65', '足外踝 → 下肢外侧 → 肩颈 → 目内眦', '申脉 仆参 跗阳 居髎 臑俞 肩髃 巨骨 天髎 地仓 巨髎 承泣 睛明 风池'],
  ['dai', '带脉', '', '#6A9290', '季胁下方 → 腰腹环绕一周', '带脉 五枢 维道']
];

const meridians = definitions.map((row, index) => {
  const [key, title, code, color, route, names] = row;
  const acupoints = names.split(' ');
  return {
    id: key === 'du' ? 'meridian-001' : key === 'ren' ? 'meridian-002' : `meridian-${key}`,
    key, title, code, color, route, acupoints, type: 'meridian',
    group: index < 12 ? 'regular' : 'extraordinary',
    tags: [index < 12 ? '十二正经' : '奇经八脉'],
    alias: [code].filter(Boolean), summary: route,
    pointLabel: code ? '所属穴位' : '交会穴',
    pointNote: code ? '按经穴顺序排列；左右同名穴位只列一次。' : '本脉无独立所属穴位，列出与其他经脉交会的穴位。',
    points: acupoints.map((name, i) => ({ name, code: code ? `${code}${i + 1}` : '' }))
  };
});

function findMeridian(id) { return meridians.find((item) => item.id === id || item.key === id); }
function getGroup(group) { return meridians.filter((item) => item.group === group); }
function pointRowsFromPoints(points) {
  const rows = [];
  for (let offset = 0; offset < points.length; offset += 5) {
    const cells = points.slice(offset, offset + 5).map((point) => ({
      ...point,
      key: point.id === undefined || point.id === null ? point.name : `point-${point.id}`,
      clickable: point.id !== undefined && point.id !== null
    }));
    while (cells.length < 5) cells.push({ name: '', code: '', key: `empty-${offset}-${cells.length}`, clickable: false });
    rows.push({ key: offset, cells });
  }
  return rows;
}
function pointRows(item) { return pointRowsFromPoints(item ? item.points : []); }

module.exports = { meridians, findMeridian, getGroup, pointRows, pointRowsFromPoints };

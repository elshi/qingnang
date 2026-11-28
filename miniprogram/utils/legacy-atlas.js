const atlas = require('./atlas-catalog');
const { atlasImageBase } = require('./cloud-config');

function image({ preview, full, ...plate }) {
  return { ...plate, preview_url: atlasImageBase + preview, full_url: atlasImageBase + full };
}

async function listAll(read, query) {
  const rows = [];
  for (let page = 1; ; page++) {
    const result = await read({ ...query, page });
    if (!Array.isArray(result.items) || (result.has_more && !result.items.length)) {
      throw new Error('经络资料分页数据不完整，请重试');
    }
    rows.push(...result.items);
    if (!result.has_more) return rows;
  }
}

async function loadOverview(getMeridians) {
  const records = await listAll(getMeridians, { page_size: 50 });
  const byTitle = new Map(records.map(item => [item.title, item]));
  const groups = Object.entries(atlas.groups).map(([key, chart]) => {
    const items = atlas.channels.filter(channel => channel.group === key).map(channel => {
      const record = byTitle.get(channel.title);
      if (!record || record.id == null) throw new Error('云端经络目录缺少' + channel.title);
      return { id: record.id, key: channel.key, title: record.title, code: channel.code, color: channel.color };
    });
    return { key, label: chart.title, image: image(chart), items };
  });
  return { groups };
}

function withMeridianPlates(item) {
  if (!item || item.plates) return item;
  const channel = atlas.channels.find(channel => channel.title === item.title);
  if (!channel) return item;
  return {
    ...item, atlas_key: channel.key, route: channel.route, sections: channel.sections,
    classification: item.classification || atlas.groups[channel.group].title,
    code: channel.code, plates: channel.plates.map(image), atlas_credit: atlas.credit,
    point_label: channel.kind === 'owned' ? '所属穴位' : '交会穴'
  };
}

async function loadChannelPoints(key, getAcupoints) {
  const channel = atlas.channels.find(channel => channel.key === key);
  // Meeting points are recorded under their owning meridians in the original API.
  const query = channel.kind === 'owned' ? { channel: channel.title } : {};
  const rows = await listAll(getAcupoints, { ...query, page_size: 100 });
  const byCode = new Map(rows.map(point => [point.code, point]));
  const items = channel.points.map(code => {
    const point = byCode.get(code);
    if (!point || point.id == null) throw new Error('云端穴位目录缺少 ' + code);
    return { id: point.id, name: point.name, code, relation: channel.kind };
  });
  return { items, total: items.length };
}

function withPointPlate(item) {
  if (!item || item.atlas_plate) return item;
  const owner = atlas.channels.find(channel => channel.kind === 'owned' && channel.points.includes(item.code));
  const plate = owner ? owner.plates.find(plate => plate.codes.includes(item.code)) : atlas.extras[item.name];
  return plate ? { ...item, atlas_plate: image(plate) } : item;
}

module.exports = { loadOverview, withMeridianPlates, loadChannelPoints, withPointPlate };

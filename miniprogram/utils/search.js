const sampleData = require('./sample-data');

const typeTextMap = { case: '医案', book: '医书', prescription: '处方', meridian: '经脉' };
const routeMap = { case: '/pages/cases/detail/detail', book: '/pages/books/reader/reader', prescription: '/pages/prescriptions/detail/detail', meridian: '/pages/meridians/detail/detail' };

function normalize(value) { return String(value || '').trim().toLowerCase(); }
function collectSearchText(item) {
  return normalize([item.title, item.summary, item.source, item.author, item.doctor, item.dynasty, item.composition, item.route, item.indications, item.efficacy, ...(item.tags || []), ...(item.alias || []), ...(item.acupoints || [])].filter(Boolean).join(' '));
}
function searchLocal(keyword) {
  const query = normalize(keyword);
  if (!query) return [];
  return [...sampleData.cases, ...sampleData.books, ...sampleData.prescriptions, ...sampleData.meridians]
    .filter((item) => collectSearchText(item).includes(query))
    .map((item) => ({ ...item, typeText: typeTextMap[item.type] || '内容', route: routeMap[item.type] }));
}
module.exports = { searchLocal, typeTextMap, routeMap };

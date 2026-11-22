const paths = {
  chapter: '/pages/books/reader/reader',
  case: '/pages/cases/detail/detail',
  prescription: '/pages/prescriptions/detail/detail',
  meridian: '/pages/meridians/detail/detail',
  acupoint: '/pages/acupoints/detail/detail'
};

function contentShare(type, item, chapter) {
  const share = {
    title: '青囊经典',
    path: '/pages/home/home',
    // Always use public artwork: the current screen may contain private notes.
    imageUrl: '/assets/home/catalog-icons/brand.png'
  };
  if (!paths[type] || !item || item.id === undefined || item.id === null) return share;
  if (type === 'chapter' && (!chapter || chapter.id === undefined || chapter.id === null)) return share;
  share.title = type === 'chapter'
    ? `${item.name || item.title} · ${chapter.title}`
    : item.title || item.name || share.title;
  share.path = `${paths[type]}?id=${encodeURIComponent(item.id)}`;
  if (type === 'chapter') share.path += `&chapterId=${encodeURIComponent(chapter.id)}`;
  return share;
}

module.exports = { contentShare };

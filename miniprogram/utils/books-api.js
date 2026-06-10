const { request } = require('./request');

function getBooks(params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  return request({ path: `/api/books${query ? `?${query}` : ''}` });
}

function getBookDetail(id) {
  return request({ path: `/api/books/${id}` });
}

function getBookChapter(bookId, chapterId) {
  return request({ path: `/api/books/${bookId}/chapters/${chapterId}` });
}

module.exports = { getBooks, getBookDetail, getBookChapter };

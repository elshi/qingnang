const shanghanLayouts = require('./shanghan-reading-layout');

function paragraphs(value) {
  return String(value || '').split(/\r\n|[\r\n\u2028\u2029]/).map(line => line.trim()).filter(Boolean);
}

function commentaryParagraphs(value) {
  return paragraphs(String(value || '')
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|section)\s*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/[\u200b\ufeff]/g, ''));
}

function readingGroup(text, commentary = '', topic = '') {
  return { text, commentary, topic, expanded: Boolean(commentary) };
}

// A layout contains anchors only. Slice the API text so edits to either field
// are shown immediately; discard the whole layout if an anchor has moved out of order.
function splitAtAnchors(text, anchors) {
  const offsets = anchors.map(anchor => text.indexOf(anchor));
  if (offsets[0] !== 0 || offsets.some((offset, i) =>
    offset !== text.lastIndexOf(anchors[i]) || (i > 0 && offset <= offsets[i - 1])
  )) return null;
  return offsets.map((start, i) => text.slice(start, offsets[i + 1]).trim());
}

function readingGroups(chapter, bookId) {
  const source = paragraphs(chapter.content);
  const notes = commentaryParagraphs(chapter.shiyi);
  if (!notes.length) return source.map(text => readingGroup(text));

  const layout = String(bookId) === '3' && shanghanLayouts[chapter.id];
  if (layout) {
    const passages = splitAtAnchors(source.join('\n'), layout.map(row => row[0]));
    const explanations = splitAtAnchors(notes.join('\n'), layout.map(row => row[1]));
    if (passages && explanations) {
      return passages.map((text, i) => readingGroup(text, explanations[i], layout[i][2]));
    }
  }
  if (source.length === notes.length) {
    return source.map((text, i) => readingGroup(text, notes[i]));
  }
  // One paragraph discusses the clause; the next explains the entire formula,
  // whose title, ingredients and preparation each occupy separate source lines.
  if (notes.length === 2 && source.length > 2 && /^[\u3400-\u9fff]{1,24}(?:方|汤|丸|散)[：:]?$/.test(source[1])) {
    return [readingGroup(source[0], notes[0]), readingGroup(source.slice(1).join('\n'), notes[1], '方文')];
  }
  return [readingGroup(source.join('\n'), notes.join('\n'), '全章')];
}

module.exports = { readingGroups };

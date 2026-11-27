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

module.exports = { pointRowsFromPoints };

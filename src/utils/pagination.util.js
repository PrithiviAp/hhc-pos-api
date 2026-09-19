/**
 * Normalises page/limit query params used across all list endpoints
 * (Products, Bills, Customers, Stock, Reports).
 */
function getPagination(query, defaults = { page: 1, limit: 20 }) {
  const page = Math.max(parseInt(query.page, 10) || defaults.page, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaults.limit, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

module.exports = { getPagination, buildMeta };

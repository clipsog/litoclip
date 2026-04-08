const VALID = new Set(['creator', 'brand', 'sponsor']);

/**
 * Parse JSON user_roles from DB row, or fall back to legacy user_type.
 * @param {{ user_roles?: string|null, user_type?: string }} row
 * @returns {string[]}
 */
function parseUserRoles(row) {
  if (!row) return ['creator'];
  if (row.user_roles != null && String(row.user_roles).trim() !== '') {
    try {
      const arr = JSON.parse(row.user_roles);
      if (Array.isArray(arr) && arr.length) {
        const out = [...new Set(arr.filter((r) => VALID.has(r)))];
        if (out.length) return out;
      }
    } catch (e) {
      /* ignore */
    }
  }
  const t = row.user_type || 'creator';
  return VALID.has(t) ? [t] : ['creator'];
}

function hasCreatorRole(user) {
  return true; // All authenticated users are natively creators
}

function hasSponsorRole(user) {
  const roles = user.roles || parseUserRoles(user);
  return roles.includes('sponsor');
}

module.exports = { parseUserRoles, hasCreatorRole, hasSponsorRole, VALID };

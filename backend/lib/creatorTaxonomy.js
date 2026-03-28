/** Allowed creator "content type" slugs (signup + campaign browse). */
const ALLOWED_CONTENT_TYPE_IDS = ['youtube_videos', 'music', 'podcasts', 'apps', 'tv_shows', 'movies'];

const CONTENT_TYPE_LABELS = {
  youtube_videos: 'YouTube videos',
  music: 'Music',
  podcasts: 'Podcasts',
  apps: 'Apps',
  tv_shows: 'TV shows',
  movies: 'Movies',
};

function parseJsonArray(s) {
  if (!s || typeof s !== 'string') return [];
  try {
    const j = JSON.parse(s);
    return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
  } catch (_) {
    return [];
  }
}

function normalizeContentTypes(input) {
  const arr = Array.isArray(input) ? input : [];
  const set = new Set(ALLOWED_CONTENT_TYPE_IDS);
  const out = [];
  for (const x of arr) {
    const id = String(x || '').trim();
    if (set.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeNicheTag(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

/** Niche tags: 2–40 chars after normalize, max 25 tags. */
function normalizeNicheTags(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of arr) {
    const t = normalizeNicheTag(x);
    if (t.length >= 2 && !out.includes(t)) out.push(t);
    if (out.length >= 25) break;
  }
  return out;
}

module.exports = {
  ALLOWED_CONTENT_TYPE_IDS,
  CONTENT_TYPE_LABELS,
  parseJsonArray,
  normalizeContentTypes,
  normalizeNicheTags,
};

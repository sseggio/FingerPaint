/** Content ids (artworks, albums, packs) are kebab-case; anything else is rejected before any lookup. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 64;

/** Normalizes a route param (string, string[] or missing) into a well-formed id, else null. */
export function parseContentIdParam(param: unknown): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return null;
  return ID_PATTERN.test(value) ? value : null;
}

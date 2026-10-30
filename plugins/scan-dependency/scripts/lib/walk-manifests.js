/**
 * Recursive manifest discovery, shared by every ecosystem.
 *
 * Extracted verbatim from check-pinned-versions.js's findManifests(), with the
 * hardcoded "package.json" match generalized to a caller-supplied name set
 * and/or basename pattern. Recursion order, the node_modules skip, and the
 * dot-directory skip are unchanged.
 */

const fs = require("fs");
const path = require("path");

function matchesName(name, opts) {
  if (opts.fileNames && opts.fileNames.includes(name)) return true;
  if (opts.filePattern && opts.filePattern.test(name)) return true;
  return false;
}

/**
 * @param {string} dir - directory to walk, or a single file path handled by the caller
 * @param {{fileNames?: string[], filePattern?: RegExp, skipDirNames?: string[]}} opts
 *   Provide either fileNames (exact-match set) or filePattern (regex test against
 *   the basename), or both — a file matching either is collected.
 * @param {string[]} [found]
 * @returns {string[]} absolute paths found, depth-first
 */
function findManifests(dir, opts = {}, found = []) {
  if (!fs.existsSync(dir)) return found;

  const skipDirs = new Set(["node_modules", ...(opts.skipDirNames || [])]);

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !skipDirs.has(entry.name) && !entry.name.startsWith(".")) {
      findManifests(full, opts, found);
    } else if (matchesName(entry.name, opts)) {
      found.push(full);
    }
  }
  return found;
}

module.exports = { findManifests };

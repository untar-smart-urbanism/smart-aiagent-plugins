/**
 * OSV batch lookup for resolved packages, over the public API.
 *
 * /v1/querybatch answers with vulnerability ids only, so each distinct id is then
 * fetched from /v1/vulns/{id} for its summary and severity fields. Used for
 * lockfiles osv-scanner may not read (bun.lock), and returns records in the same
 * shape scan-lockfile.js builds from osv-scanner output.
 */

const BATCH_URL = "https://api.osv.dev/v1/querybatch";
const VULN_URL = "https://api.osv.dev/v1/vulns/";
const BATCH_SIZE = 1000; // the API's documented per-request query limit
const DETAIL_CONCURRENCY = 8;

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OSV API error ${res.status} for ${url}`);
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSV API error ${res.status} for ${url}`);
  return res.json();
}

/**
 * @param {{name:string, version:string, source?:string}[]} packages
 * @param {(vuln:object)=>string} severityOf
 * @param {string} [ecosystem]
 * @returns {Promise<{id,name,version,severity,summary,source}[]>}
 */
async function queryPackages(packages, severityOf, ecosystem = "npm") {
  const hits = []; // { pkg, ids[] }
  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const chunk = packages.slice(i, i + BATCH_SIZE);
    const body = {
      queries: chunk.map((p) => ({ version: p.version, package: { name: p.name, ecosystem } })),
    };
    const out = await postJson(BATCH_URL, body);
    (out.results || []).forEach((r, idx) => {
      const ids = (r.vulns || []).map((v) => v.id).filter(Boolean);
      if (ids.length > 0) hits.push({ pkg: chunk[idx], ids });
    });
  }

  const uniqueIds = [...new Set(hits.flatMap((h) => h.ids))];
  const details = new Map();
  for (let i = 0; i < uniqueIds.length; i += DETAIL_CONCURRENCY) {
    const slice = uniqueIds.slice(i, i + DETAIL_CONCURRENCY);
    const got = await Promise.all(slice.map((id) => getJson(VULN_URL + encodeURIComponent(id)).catch(() => null)));
    slice.forEach((id, k) => details.set(id, got[k]));
  }

  const findings = [];
  for (const { pkg, ids } of hits) {
    for (const id of ids) {
      const vuln = details.get(id) || { id };
      findings.push({
        id,
        name: pkg.name,
        version: pkg.version,
        severity: severityOf(vuln),
        summary: (vuln.summary || "").split("\n")[0],
        source: pkg.source || "",
      });
    }
  }
  return findings;
}

module.exports = { queryPackages };

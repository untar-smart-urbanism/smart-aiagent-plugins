#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "..", "data", "owasp-checklist-source.md");
const outPath = path.join(__dirname, "..", "data", "owasp-checklist.json");

const raw = fs.readFileSync(sourcePath, "utf8");
const lines = raw.split("\n");

const sections = [];
let current = null;

for (const line of lines) {
  const h2 = line.match(/^## (.+)$/);
  if (h2) {
    if (current) sections.push(current);
    current = {
      id: h2[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      title: h2[1],
      items: [],
    };
    continue;
  }
  const item = line.match(/^- \[ \]\s+(.+)$/);
  if (item && current) {
    current.items.push(
      item[1]
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .trim()
    );
  }
}
if (current) sections.push(current);

const doc = {
  $schema: "../../schemas/owasp-checklist.schema.json",
  source:
    "https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist",
  repository:
    "https://github.com/OWASP/www-project-secure-coding-practices-quick-reference-guide",
  version: "stable-en",
  title: "OWASP Secure Coding Practices Checklist",
  sectionCount: sections.length,
  itemCount: sections.reduce((n, s) => n + s.items.length, 0),
  sections,
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${sections.length} sections, ${doc.itemCount} items → ${outPath}`);
console.warn(
  "Warning: this overwrites owasp-checklist.json with OWASP source only. Edit owasp-checklist.json directly to maintain the full checklist."
);

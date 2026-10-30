// Run: node --test plugins/scan-dependency/scripts/lockfiles.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { jsoncToJson, splitNameAtVersion, readLockfile } = require("./lib/lockfiles");

const FIXTURE = path.join(__dirname, "__fixtures__", "lockfile-sample-bun");

test("jsoncToJson drops trailing commas and comments, never inside strings", () => {
  const out = jsoncToJson('{"a": "x, // y", /* c */ "b": [1, 2,], // tail\n}');
  assert.deepStrictEqual(JSON.parse(out), { a: "x, // y", b: [1, 2] });
});

test("splitNameAtVersion keeps the scope '@'", () => {
  assert.deepStrictEqual(splitNameAtVersion("@types/bun@1.2.10"), { name: "@types/bun", version: "1.2.10" });
  assert.deepStrictEqual(splitNameAtVersion("ms@2.1.3"), { name: "ms", version: "2.1.3" });
  assert.strictEqual(splitNameAtVersion("@scope/nover"), null);
});

test("bun.lock: registry packages resolve to their real names, nested versions kept", () => {
  const { kind, packages, skipped } = readLockfile(path.join(FIXTURE, "bun.lock"));
  assert.strictEqual(kind, "bun.lock");
  const ids = packages.map((p) => `${p.name}@${p.version}`).sort();
  // "left-pad" is an alias; what was installed is pad-left. web/ms is a second ms version.
  assert.deepStrictEqual(ids, ["ms@2.0.0", "ms@2.1.3", "pad-left@2.1.0"]);
  const skippedSpecs = skipped.map((s) => s.spec).sort();
  assert.deepStrictEqual(skippedSpecs, ["github:jonschlinkert/is-number#98e8ff1", "workspace:packages/web"]);
});

// Created at run time, not committed: a binary lockfile in the repo would make every
// repo-wide scan of this marketplace report INCOMPLETE.
function binaryLockDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bunlockb-"));
  fs.writeFileSync(path.join(dir, "bun.lockb"), Buffer.from([0x23, 0x21, 0x00, 0xff, 0x01]));
  return dir;
}

test("bun.lockb is reported unreadable, not as an empty lockfile", () => {
  const r = readLockfile(path.join(binaryLockDir(), "bun.lockb"));
  assert.strictEqual(r.packages.length, 0);
  assert.match(r.unreadable, /save-text-lockfile/);
});

test("scan-lockfile exits non-zero (INCOMPLETE) when only a bun.lockb is present", () => {
  const res = spawnSync(process.execPath, [path.join(__dirname, "scan-lockfile.js"), binaryLockDir()], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" }, // keep osv-scanner out of the run
  });
  assert.strictEqual(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /INCOMPLETE/);
});

test("package-lock.json: the project root and workspace folders are not dependencies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npmlock-"));
  const lock = {
    lockfileVersion: 3,
    packages: {
      "": { name: "app", version: "1.0.0" },
      "packages/web": { name: "web", version: "0.1.0" },
      "node_modules/web": { resolved: "packages/web", link: true },
      "node_modules/ms": { version: "2.1.3" },
      "node_modules/a/node_modules/ms": { version: "2.0.0" },
    },
  };
  fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lock));
  const { packages } = readLockfile(path.join(dir, "package-lock.json"));
  assert.deepStrictEqual(packages.map((p) => `${p.name}@${p.version}`).sort(), ["ms@2.0.0", "ms@2.1.3"]);
});

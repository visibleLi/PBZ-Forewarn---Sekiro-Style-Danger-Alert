"use strict";
// Replays only facts still present on disk. It cannot reconstruct observations
// already evicted by the game, and it neither starts PBZ nor modifies its files.
const fs = require("fs"), path = require("path"), assert = require("assert");
const { createObservationStore } = require("../PBZForewarn/observation-store");
const args = process.argv.slice(2);
function arg(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
const capture = arg("--capture"), output = arg("--out");
if (!capture) throw new Error("Usage: node observation-store.replay.js --capture CAPTURE_DIR [--out REPORT.json]");
const read = name => JSON.parse(fs.readFileSync(path.join(capture, name), "utf8").replace(/^\ufeff/, ""));
const observations = read("pbzforewarn_observations.json"), diagnostics = read("pbzforewarn_diagnostics.json");
const baselineFile = path.resolve(__dirname, "../../../forewarn-0.6-bounded/js-package/PBZForewarn/observation-store.js");
const baseline = require(baselineFile).createObservationStore;
const terminal = new Set(["warning-cue", "warning-withdrawal", "warning-missed", "task-lifecycle"]);
const mapKind = kind => ({ CUE: "warning-cue", CANCEL: "warning-withdrawal", missed: "warning-missed",
    "task-ended-event": "task-lifecycle" })[kind] || kind;
const seen = new Set(), rows = [];
// Prefer the original observation envelope when the corresponding diagnostic
// output is the same known ID. No identity is inferred for unknown-ID events.
for (const event of observations.events) {
    if (["warning-cue", "warning-withdrawal"].includes(event.kind) && event.id) seen.add(event.kind + ":" + event.id);
    rows.push({ kind: event.kind, data: event, at: event.wallTime ?? event.importedWallTime ?? 0, source: "retained-observation" });
}
let duplicatesSkipped = 0;
for (const event of diagnostics.recent) {
    const kind = mapKind(event.kind);
    if (["warning-cue", "warning-withdrawal"].includes(kind) && event.id && seen.has(kind + ":" + event.id)) {
        duplicatesSkipped++; continue;
    }
    const data = { ...event };
    if (kind === "task-lifecycle") data.phase = "native-task-ended";
    if (kind === "warning-cue") {
        if (typeof event.firedGameTime === "number") data.gameTime = event.firedGameTime;
        // Compact diagnostics can contain short names only. They stay short;
        // the replay never invents full paths or a shared world/clock identity.
    }
    rows.push({ kind, data, at: event.at ?? 0, source: "retained-diagnostic" });
}
rows.sort((a, b) => a.at - b.at);
const old = baseline(), next = createObservationStore();
for (const row of rows) { old.record(row.kind, row.data); next.record(row.kind, row.data); }
const before = old.snapshot(), after = next.snapshot(), e = after.evidence;
for (const r of e.records) for (const ref of Object.values(r.refs || {})) assert.equal(typeof e.dictionary[ref], "string");
assert(e.retention.bytes <= e.retention.maxBytes);
assert.equal(e.retention.recordBytes + e.retention.dictionaryBytes,
    Buffer.byteLength(JSON.stringify(e.records)) + Buffer.byteLength(JSON.stringify(e.dictionary)));
const count = list => list.reduce((out, row) => (out[row.kind] = (out[row.kind] || 0) + 1, out), {});
const countKey = list => list.filter(row => terminal.has(row.kind)).length;
const report = { mode: "offline-existing-facts-replay", source: path.resolve(capture),
    candidateSourceSha256: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../PBZForewarn/observation-store.js'))).digest('hex'),
    cannotRestoreEvictedHistory: true,
    original: { acceptedObservations: observations.counters.accepted, retainedObservations: observations.events.length,
        evictedObservations: observations.counters.evicted, diagnosticsRetained: diagnostics.recent.length,
        diagnosticsEvicted: diagnostics.retention.recent.dropped },
    input: { rows: rows.length, duplicatesSkipped, kinds: count(rows), keyEvidence: countKey(rows) },
    baseline: { rawEvents: before.events.length, bytes: before.counters.bytes, keyEvidence: countKey(before.events), kinds: count(before.events) },
    candidate: { rawEvents: after.events.length, rawBytes: after.counters.bytes, evidenceRecords: e.records.length,
        keyEvidence: countKey(e.records), kinds: count(e.records), retention: e.retention, counters: e.counters },
    scope: "These are retained observations and diagnostics replayed in recorded wall/import order; diagnostic kind mapping is explicit. No missing first-observed, starting-offset, native-callback, or hit context is fabricated. This does not prove performance or move coverage." };
assert(report.candidate.keyEvidence > report.baseline.keyEvidence,
    "compact priority evidence should retain more critical facts in this real retained-data replay");
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

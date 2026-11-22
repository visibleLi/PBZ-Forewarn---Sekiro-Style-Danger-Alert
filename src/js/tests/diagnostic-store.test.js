"use strict";
const assert = require("node:assert/strict");
const { createDiagnosticStore } = require("../PBZForewarn/diagnostic-store");
let checks = 0;
function test(name, run) { run(); checks++; console.log("PASS " + name); }

test("live diagnostic gating retains history while suppressing and resuming optional detail", () => {
    const store=createDiagnosticStore(); store.record('CUE',{id:'keep'}); store.catalog({color:'red'},'keep');
    store.setEnabled(false); store.record('task-found',{task:'hidden'}); store.catalog({color:'blue'},'hidden');
    store.record('config-saved',{change:1});
    assert.equal(store.snapshot().activity.length,0); assert.equal(store.snapshot().catalog.count,1);
    store.setEnabled(true); store.record('task-found',{task:'new'}); store.catalog({color:'blue'},'new');
    assert.equal(store.snapshot().activity.length,1); assert.equal(store.snapshot().catalog.count,2);
    assert.equal(store.snapshot().recent[0].id,'keep');
});
test("thousands of noisy records cannot evict battle history", () => {
    const store = createDiagnosticStore(); store.record("CUE", { id: "cue-1", at: 100 });
    for (let i = 0; i < 4000; i++) {
        store.record("task-found", { at: i, task: "task-" + i });
        store.catalog({ actionClass: "class-" + i, effect: "effect", payload: "x".repeat(200) });
    }
    const snap = store.snapshot();
    assert.equal(snap.recent[0].id, "cue-1"); assert.equal(snap.activity.length, 256);
    assert.equal(snap.catalog.count, 128); assert(snap.retention.activity.dropped > 0); assert(snap.catalog.dropped > 0);
});

test("UTF8 byte and record capacities evict oldest records with explicit losses", () => {
    const store = createDiagnosticStore({ limits: { recentCount: 10, recentBytes: 250 } });
    for (let i = 0; i < 12; i++) store.record("CUE", { id: String(i), text: "危😀".repeat(4), at: i });
    const snap = store.snapshot(), meta = snap.retention.recent;
    assert(meta.count < 10); assert(meta.bytes <= 250);
    assert.equal(meta.total, 12); assert.equal(meta.total - meta.count, meta.dropped);
    assert.equal(meta.firstAt, snap.recent[0].at); assert.equal(meta.lastAt, 11);
    assert.equal(meta.bytes, snap.recent.reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x)), 0));
});

test("oversized records do not erase useful retained events", () => {
    const store = createDiagnosticStore({ limits: { recentBytes: 160, catalogBytes: 160 } });
    store.record("CUE", { id: "keep" }); store.record("CANCEL", { text: "x".repeat(1000) });
    store.catalog({ text: "y".repeat(1000) }, "oversized");
    const snap = store.snapshot(); assert.equal(snap.recent.length, 1);
    assert.equal(snap.retention.recent.oversized, 1); assert.equal(snap.catalog.oversized, 1);
});

test("catalog deduplicates static data regardless of key order and timestamps", () => {
    const store = createDiagnosticStore();
    store.catalog({ at: 1, action: "same", color: "red" }, "r1");
    const first = store.catalogSnapshot().version;
    assert.equal(store.catalog({ color: "red", action: "same", at: 2 }, "r1"), false);
    assert.equal(store.catalogSnapshot().version, first);
    assert.equal(store.catalog({ color: "blue", action: "same", at: 3 }, "r1"), true);
    assert.equal(store.catalogSnapshot().entries.length, 1);
    assert.equal(store.catalogSnapshot().entries[0].data.color, "blue");
});

test("saving an older catalog version cannot acknowledge later changes", () => {
    const store = createDiagnosticStore(); assert.equal(store.catalogDirty(), false);
    store.catalog({ action: "one" }, "1"); const version = store.catalogSnapshot().version;
    store.catalog({ action: "two" }, "2"); store.markCatalogSaved(version);
    assert.equal(store.catalogDirty(), true); store.markCatalogSaved(999999);
    assert.equal(store.catalogDirty(), true); store.markCatalogSaved(store.catalogSnapshot().version);
    assert.equal(store.catalogDirty(), false);
});

test("Diagnostics disabled keeps critical events and skips noisy payload access", () => {
    const store = createDiagnosticStore({ enabled: false });
    const payload = {}; Object.defineProperty(payload, "bad", { get() { throw Error("must not read"); } });
    store.record("inventory", payload); store.record("task-found", payload);
    for (const kind of ["CUE", "CANCEL", "state", "runtime-error", "sound-play"]) store.record(kind, { id: kind });
    const snap = store.snapshot(); assert.equal(snap.recent.length, 5); assert.equal(snap.activity.length, 0);
    assert.equal(snap.catalog.count, 0); assert.equal(snap.catalog.disabled, 1);
});

test("unsafe values become bounded JSON data without invoking getters or toJSON", () => {
    const store = createDiagnosticStore(); const cycle = { label: "cycle" }; cycle.self = cycle;
    const data = { cycle, number: Infinity, array: Array(200).fill("危"), bigint: 1n };
    Object.defineProperty(data, "nativeGetter", { enumerable: true, get() { throw Error("getter invoked"); } });
    class Native { toJSON() { throw Error("native invoked"); } }
    data.object = new Native(); store.record("CUE", data);
    const record = store.snapshot().recent[0]; assert.doesNotThrow(() => JSON.stringify(record));
    assert.equal(record.nativeGetter, "[accessor]"); assert.equal(record.object, "[non-plain-object]");
    assert.equal(record.cycle.self, "[cycle]"); assert.equal(record.number, null); assert.equal(record.array.length, 65);
    assert(Object.isFrozen(record)); assert(Object.isFrozen(record.cycle));
});

test("plain records from another script realm retain fields without retaining their prototypes", () => {
    const vm = require("node:vm"), store = createDiagnosticStore();
    const data = vm.runInNewContext('({ id: "cross-realm", nested: { value: 3 } })');
    store.record("CUE", data); const record = store.snapshot().recent[0];
    assert.equal(record.id, "cross-realm"); assert.equal(record.nested.value, 3);
    assert.equal(Object.getPrototypeOf(record.nested), null);
});

test("once keys suppress only bounded repeats and permit later evidence", () => {
    let time = 0; const store = createDiagnosticStore({ now: () => time });
    assert.equal(store.record("runtime-error", { error: "x" }, "same"), true);
    assert.equal(store.record("runtime-error", { error: "x" }, "same"), false);
    time = 10000; assert.equal(store.record("runtime-error", { error: "x" }, "same"), true);
    const snap = store.snapshot(); assert.equal(snap.recent.length, 2); assert.equal(snap.retention.recent.suppressed, 1);
});

test("configured capacities cannot exceed hard memory and count limits", () => {
    const store = createDiagnosticStore({ limits: { recentCount: 100000, recentBytes: 1e9 } });
    for (let i = 0; i < 2200; i++) store.record("CUE", { id: String(i) });
    const snap = store.snapshot(); assert.equal(snap.recent.length, 2048);
    assert(snap.retention.recent.bytes <= 512 * 1024); assert.equal(snap.retention.recent.dropped, 152);
});

test("hundreds of candidates cannot evict seven actually fired warning details", () => {
    const store = createDiagnosticStore();
    for (let i=0;i<7;i++) store.catalog({ color:'black', ability:'warning-'+i }, 'warning-'+i, 1);
    for (let i=0;i<7;i++) assert(store.promote('warning-'+i,2));
    for (let i=0;i<1200;i++) store.catalog({ effect:'unknown-'+i }, 'candidate-'+i, 0);
    const snap=store.catalogSnapshot(); assert.equal(snap.entries.length,128);
    for (let i=0;i<7;i++) assert(store.hasCatalog('warning-'+i));
    assert(snap.retention.dropped>0); assert(snap.entries.filter(x=>x.priority===2).length===7);
});

test("a full higher-priority catalog rejects new candidates without losing warning details", () => {
    const store = createDiagnosticStore({limits:{catalogCount:3}});
    for (let i=0;i<3;i++) store.catalog({ color:'red' },'warning-'+i,2);
    assert.equal(store.catalog({effect:'unknown'},'candidate',0),false);
    assert.equal(store.catalogSnapshot().retention.rejectedLowerPriority,1);
    assert.equal(store.hasCatalog('warning-0'),true);
});

console.log(checks + " diagnostic retention checks passed.");

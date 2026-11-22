'use strict';
// Tests the real presentation module with strict, deterministic UMG substitutes.
// This verifies state/lifecycle and API value shapes, not in-game font rendering.
const assert = require('assert');
const { createPresentation } = require('../PBZForewarn/presentation');
const SLOT = '__PBZForewarnCanvas';
let passed = 0, failed = 0;

function fixture(overrides) {
    const env = { now: 10000, canvases: [], texts: [], diagnostics: [], fontLoads: [], hudReads: 0,
        failPosition: 0, failTextBuild: 0, missingOverlay: false, missingFont: false };
    const settings = Object.assign({ GlyphOn: true, GlyphFontSize: 120, GlyphY: 0.32, FontPath: '/Game/TestFont.TestFont' }, overrides);
    const visibility = { Collapsed: 'Collapsed', HitTestInvisible: 'HitTestInvisible' };
    class Vector2D { constructor() { this.X = 0; this.Y = 0; } }
    class Anchors { constructor() { this.Minimum = new Vector2D(); this.Maximum = new Vector2D(); } }
    class LinearColor {}
    class FontOutlineSettings { constructor() { this.OutlineSize = 0; this.OutlineColor = new LinearColor(); } }
    class SlateFontInfo { constructor() { this.OutlineSettings = new FontOutlineSettings(); } }
    class SlateColor { constructor() { this.ColorUseRule = 0; this.SpecifiedColor = new LinearColor(); } }
    class Widget {
        constructor(type, outer) { this.valid = true; this.type = type; this.outer = outer; this.parent = null; this.removed = 0; }
        SetVisibility(value) { if (this.failVisibility) throw Error('visibility failure'); assert(Object.values(visibility).includes(value)); this.visibility = value; }
        RemoveFromParent() {
            this.removed++;
            if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this);
            this.parent = null;
        }
    }
    class CanvasSlot {
        constructor(node) { this.valid = true; this.node = node; }
        SetAnchors(value) { assert(value instanceof Anchors); assert(value.Minimum instanceof Vector2D); assert(value.Maximum instanceof Vector2D); this.anchors = value; }
        SetAlignment(value) { assert(value instanceof Vector2D); this.alignment = value; }
        SetAutoSize(value) { assert.equal(typeof value, 'boolean'); this.autoSize = value; }
        SetZOrder(value) { assert.equal(typeof value, 'number'); this.zOrder = value; }
        SetPosition(value) {
            if (!this.valid) throw Error('stale CanvasPanelSlot');
            if (env.failPosition > 0) { env.failPosition--; throw Error('transient layout failure'); }
            assert(value instanceof Vector2D); this.position = value;
        }
    }
    class Canvas extends Widget {
        constructor(outer) { super('CanvasPanel', outer); this.children = []; this.slots = []; }
        AddChildToCanvas(node) { this.children.push(node); node.parent = this; const slot = new CanvasSlot(node); this.slots.push(slot); return slot; }
    }
    class Text extends Widget {
        constructor(outer) { super('TextBlock', outer); }
        SetText(value) { assert(value && value.isFText); this.text = value.text; }
        SetFont(value) { assert(value instanceof SlateFontInfo); assert(value.OutlineSettings instanceof FontOutlineSettings); this.font = value; }
        SetColorAndOpacity(value) { assert(value instanceof SlateColor); assert(value.SpecifiedColor instanceof LinearColor); this.color = value; }
        SetJustification(value) { assert.equal(value, 'Center'); this.justification = value; }
    }
    function makeHUD() {
        const overlay = new Widget('Overlay'); overlay.children = [];
        overlay.AddChildToOverlay = function (node) {
            this.children.push(node); node.parent = this;
            return {
                SetHorizontalAlignment(value) { assert.equal(value, 'HAlign_Fill'); node.horizontal = value; },
                SetVerticalAlignment(value) { assert.equal(value, 'VAlign_Fill'); node.vertical = value; }
            };
        };
        return { valid: true, WidgetTree: { overlay }, overlay };
    }
    env.makeHUD = makeHUD; env.hud = makeHUD(); env.font = { valid: true, type: 'Font' };
    const UE = {
        Vector2D, Anchors, LinearColor, SlateFontInfo, SlateColor,
        ESlateVisibility: visibility, ETextJustify: { Center: 'Center' },
        ESlateColorStylingMode: { UseColor_Specified: 0 },
        EHorizontalAlignment: { HAlign_Fill: 'HAlign_Fill' }, EVerticalAlignment: { VAlign_Fill: 'VAlign_Fill' },
        TextBlock: { StaticClass: () => 'TextBlock' }, CanvasPanel: { StaticClass: () => 'CanvasPanel' },
        PBZHUDLayout: { GetHUDLayout: () => { env.hudReads++; return env.hud; } },
        Widget: { Find: (name, tree) => { assert.equal(name, 'Overlay_0'); return env.missingOverlay ? null : tree.overlay; } },
        Font: { Load: path => { env.fontLoads.push(path); return env.missingFont ? null : env.font; } },
        NewObject(type, outer) {
            assert(outer && outer.valid);
            if (type === 'CanvasPanel') { const node = new Canvas(outer); env.canvases.push(node); return node; }
            assert.equal(type, 'TextBlock');
            if (env.failTextBuild > 0) { env.failTextBuild--; throw Error('text construction failed'); }
            const node = new Text(outer); env.texts.push(node); return node;
        }
    };
    const cpp = { FText: { FromString: text => ({ isFText: true, text }) } };
    const adapter = { valid: value => !!value && value.valid === true };
    env.create = () => createPresentation(UE, cpp, adapter, settings, (kind, data) => {
        if (env.throwDiagnostic) throw Error('diagnostic sink unavailable');
        env.diagnostics.push({ kind, data });
    });
    env.settings = settings; env.UE = UE;
    env.clock = () => env.now;
    env.latest = () => env.canvases[env.canvases.length - 1];
    return env;
}
function run(name, body) {
    const nativeNow = Date.now;
    delete globalThis[SLOT];
    try {
        const env = fixture(); Date.now = env.clock;
        body(env); passed++; console.log('PASS ' + name);
    } catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
    finally { Date.now = nativeNow; delete globalThis[SLOT]; }
}
const redCue = [{ color: 'red', id: 'red1' }], blueCue = [{ color: 'blue', id: 'blue1' }];
const both = redCue.concat(blueCue);

run('empty, paused and disabled presentation remains lazy', env => {
    const p = env.create(); p.update({}, [], false); p.update({}, redCue, true);
    env.settings.GlyphOn = false; p.update({}, redCue, false);
    assert.equal(env.canvases.length, 0); assert.equal(env.hudReads, 0);
});
run('red warning uses FText, configured font, outline, SlateColor and centered anchors', env => {
    const p = env.create(); p.update({}, redCue, false);
    const canvas = env.latest(), [red, blue] = canvas.children, slot = canvas.slots[0];
    assert.equal(canvas.visibility, 'HitTestInvisible'); assert.equal(canvas.horizontal, 'HAlign_Fill'); assert.equal(canvas.vertical, 'VAlign_Fill');
    assert.equal(red.text, '危'); assert.equal(blue.text, '危'); assert.equal(red.font.FontObject, env.font);
    assert.equal(red.font.Size, 120); assert.equal(red.font.TypefaceFontName, 'Default'); assert.equal(red.font.OutlineSettings.OutlineSize, 4);
    assert.equal(red.color.ColorUseRule, 0); assert.equal(red.color.SpecifiedColor.R, 1); assert.equal(red.color.SpecifiedColor.A, 1);
    assert.equal(slot.anchors.Minimum.X, 0.5); assert.equal(slot.anchors.Minimum.Y, 0.32);
    assert.equal(slot.anchors.Maximum.X, 0.5); assert.equal(slot.anchors.Maximum.Y, 0.32);
    assert.equal(slot.alignment.X, 0.5); assert.equal(slot.alignment.Y, 0.5); assert.equal(slot.autoSize, true);
    assert.equal(slot.position.X, 0); assert.equal(red.visibility, 'HitTestInvisible'); assert.equal(blue.visibility, 'Collapsed');
    assert.deepEqual(env.fontLoads, [env.settings.FontPath]);
});
run('blue-only warning stays centered and hides the red glyph', env => {
    const p = env.create(); p.update({}, blueCue, false); const c = env.latest();
    assert.equal(c.children[0].visibility, 'Collapsed'); assert.equal(c.children[1].visibility, 'HitTestInvisible');
    assert.equal(c.children[1].color.SpecifiedColor.B, 1); assert.equal(c.slots[1].position.X, 0);
});
run('red and blue warnings display simultaneously on opposite sides', env => {
    const p = env.create(); p.update({}, both, false); const c = env.latest();
    assert(c.children.slice(0, 2).every(x => x.visibility === 'HitTestInvisible'));
    assert(c.slots[0].position.X < 0); assert(c.slots[1].position.X > 0);
    assert.equal(c.slots[0].position.X, -c.slots[1].position.X);
    assert.equal(c.slots[1].position.X, env.settings.GlyphFontSize * 0.65);
    p.update({}, redCue, false); assert.equal(c.slots[0].position.X, 0); assert.equal(c.children[1].visibility, 'Collapsed');
});
run('many same-color attacks share a glyph and do not rebuild the HUD each frame', env => {
    const p = env.create(); p.update({}, redCue.concat([{ color: 'red', id: 'red2' }]), false);
    p.update({}, redCue, false); p.update({}, redCue, false);
    assert.equal(env.canvases.length, 1); assert.equal(env.texts.length, 3);
    assert.equal(env.diagnostics.filter(x => x.kind === 'hud-show').length, 1);
});
run('pause and empty active lists hide the canvas without rebuilding it', env => {
    const p = env.create(); p.update({}, both, false); const c = env.latest();
    p.update({}, both, true); assert.equal(c.visibility, 'Collapsed');
    p.update({}, redCue, false); assert.equal(c.visibility, 'HitTestInvisible');
    p.update({}, [], false); assert.equal(c.visibility, 'Collapsed'); assert.equal(env.canvases.length, 1);
});
run('disabling glyphs after creation hides an existing canvas', env => {
    const p = env.create(); p.update({}, redCue, false); env.settings.GlyphOn = false;
    p.update({}, redCue, false); assert.equal(env.latest().visibility, 'Collapsed');
});
run('live size and position rebuild only the owned canvas with the current warning window', env => {
    const p=env.create(); p.update({}, redCue, false); const old=env.latest();
    env.settings.GlyphFontSize=180; env.settings.GlyphY=0.6;
    p.update({}, redCue, false); const next=env.latest();
    assert.notStrictEqual(next,old); assert.equal(old.parent,null);
    assert.equal(next.children[0].font.Size,180); assert.equal(next.slots[0].anchors.Minimum.Y,0.6);
    assert.equal(env.hud.overlay.children.length,1);
    env.settings.GlyphY=0.2; p.update({},[],false);
    assert.equal(next.parent,null); assert.equal(env.hud.overlay.children.length,0);
});
run('contained HUD failure is observable and clears after a successful output update', env => {
    const p = env.create(); const original = env.UE.PBZHUDLayout.GetHUDLayout;
    env.UE.PBZHUDLayout.GetHUDLayout = () => { throw Error('layout unavailable'); };
    assert.deepEqual(p.update({}, redCue, false), []); assert(p.status().failure.includes('layout unavailable'));
    env.UE.PBZHUDLayout.GetHUDLayout = original; env.settings.GlyphOn = false;
    p.update({}, redCue, false); assert.equal(p.status().failure, '');
});
run('reenabling shows only the current active window and keeps expired glyphs hidden', env => {
    const p = env.create(); p.update({}, redCue, false); const canvas = env.latest();
    env.settings.GlyphOn = false; p.update({}, redCue, false);
    env.settings.GlyphOn = true; p.update({}, redCue, false);
    assert.equal(canvas.visibility, 'HitTestInvisible');
    env.settings.GlyphOn = false; p.update({}, [], false);
    env.settings.GlyphOn = true; p.update({}, [], false);
    assert.equal(canvas.visibility, 'Collapsed'); assert.equal(env.canvases.length, 1);
});
run('dispose removes the overlay child and can be repeated safely', env => {
    const p = env.create(); p.update({}, redCue, false); const c = env.latest();
    p.dispose(); p.dispose(); assert.equal(c.parent, null); assert.equal(env.hud.overlay.children.length, 0);
    assert.equal(globalThis[SLOT], undefined);
});
run('reload cleans previous canvas and leaves exactly one mounted replacement', env => {
    const p = env.create(); p.update({}, redCue, false); const old = env.latest();
    const q = env.create(); assert.equal(old.parent, null); q.update({}, blueCue, false);
    assert.equal(env.hud.overlay.children.length, 1); assert.equal(globalThis[SLOT], env.latest());
});
run('an obsolete presentation cannot remove the replacement on repeated dispose', env => {
    const p = env.create(); p.update({}, redCue, false);
    const q = env.create(); q.update({}, blueCue, false); const replacement = env.latest();
    p.dispose(); p.dispose(); assert(globalThis[SLOT] === replacement, 'replacement still owns global canvas'); assert(replacement.parent === env.hud.overlay, 'replacement remains attached');
});
run('HUD replacement detaches the previous canvas and rebuilds in the new overlay', env => {
    const p = env.create(); p.update({}, redCue, false); const old = env.latest(), oldHUD = env.hud;
    env.hud = env.makeHUD(); p.update({}, blueCue, false);
    assert.equal(old.parent, null); assert.equal(oldHUD.overlay.children.length, 0);
    assert.equal(env.latest().parent, env.hud.overlay); assert.equal(env.canvases.length, 2);
});
run('temporarily unavailable HUD hides the previously visible glyph', env => {
    const p = env.create(); p.update({}, redCue, false); const old = env.latest();
    env.hud = null; p.update({}, blueCue, false);
    assert(old.visibility === 'Collapsed' || old.parent === null);
});
run('missing overlay reports failure, respects retry delay and recovers', env => {
    env.missingOverlay = true; const p = env.create(); p.update({}, redCue, false);
    assert.equal(env.diagnostics.filter(x => x.kind === 'hud-error').length, 1);
    env.missingOverlay = false; env.now += 1499; p.update({}, redCue, false); assert.equal(env.canvases.length, 0);
    env.now += 1; p.update({}, redCue, false); assert.equal(env.latest().visibility, 'HitTestInvisible');
});
run('unavailable font recovers after retry without using a wrong fallback font', env => {
    env.missingFont = true; const p = env.create(); p.update({}, redCue, false);
    assert.equal(env.canvases.length, 0); assert.equal(globalThis[SLOT], undefined);
    env.missingFont = false; env.now += 1500; p.update({}, redCue, false);
    assert.equal(env.latest().children[0].font.FontObject, env.font);
});
run('partial construction failure removes its canvas before retry', env => {
    env.failTextBuild = 1; const p = env.create(); p.update({}, redCue, false); const partial = env.latest();
    assert.equal(partial.parent, null); assert.equal(globalThis[SLOT], undefined); assert.equal(env.hud.overlay.children.length, 0);
    env.now += 1500; p.update({}, both, false); assert.equal(env.hud.overlay.children.length, 1); assert.equal(env.latest().children.length, 3);
});
run('transient position failure can recover on the next update', env => {
    env.failPosition = 1; const p = env.create();
    try { p.update({}, redCue, false); } catch (error) { assert.match(error.message, /layout/); }
    env.now += 1600; p.update({}, redCue, false);
    assert.equal(env.latest().visibility, 'HitTestInvisible'); assert.equal(env.latest().slots[0].position.X, 0);
    assert.equal(env.hud.overlay.children.length, 1);
});
run('a stale canvas slot causes a rebuild instead of permanently blocking glyph updates', env => {
    const p = env.create(); p.update({}, redCue, false); const old = env.latest(); old.slots[0].valid = false;
    try { p.update({}, redCue, false); } catch (error) { assert.match(error.message, /stale/); }
    env.now += 1600; p.update({}, both, false);
    assert.notEqual(env.latest(), old); assert.equal(env.hud.overlay.children.length, 1);
    assert(env.latest().children.slice(0, 2).every(x => x.visibility === 'HitTestInvisible'));
});
run('visibility failure during pause is contained, removes the canvas and recovers', env => {
    const p = env.create(); p.update({}, redCue, false); const old = env.latest(); old.failVisibility = true;
    assert.doesNotThrow(() => p.update({}, redCue, true));
    assert.equal(old.parent, null); assert.equal(globalThis[SLOT], undefined);
    p.update({}, redCue, false); assert.equal(env.canvases.length, 1);
    env.now += 1500; p.update({}, redCue, false);
    assert.equal(env.canvases.length, 2); assert.equal(env.latest().visibility, 'HitTestInvisible');
    assert.equal(env.diagnostics.filter(x => x.kind === 'hud-error').length, 1);
});
run('persistent layout failure is contained and retries are limited', env => {
    env.failPosition = Infinity; const p = env.create();
    for (let i = 0; i < 20; i++) { p.update({}, redCue, false); env.now += 50; }
    assert.equal(env.canvases.length, 1); assert.equal(env.diagnostics.filter(x => x.kind === 'hud-error').length, 1);
    assert.equal(env.hud.overlay.children.length, 0);
    env.now = 11500; p.update({}, redCue, false);
    assert.equal(env.canvases.length, 2); assert.equal(env.diagnostics.filter(x => x.kind === 'hud-error').length, 2);
});
run('diagnostic output failure cannot prevent displaying or disposing a cue', env => {
    env.throwDiagnostic = true; const p = env.create();
    assert.doesNotThrow(() => p.update({}, redCue, false)); assert.equal(env.latest().visibility, 'HitTestInvisible');
    p.dispose(); assert.equal(env.hud.overlay.children.length, 0);
});


run('black warning uses an achromatic dark glyph with a light outline', env => {
    const p = env.create(); p.update({}, [{color:'black',id:'k'}], false); const c = env.latest();
    assert.equal(c.children[2].visibility, 'HitTestInvisible'); assert.equal(c.children[0].visibility, 'Collapsed');
    assert.equal(c.children[1].visibility, 'Collapsed'); assert.equal(c.slots[2].position.X, 0);
    const fill = c.children[2].color.SpecifiedColor, outline = c.children[2].font.OutlineSettings.OutlineColor;
    assert(fill.R < 0.05); assert.equal(fill.R, fill.G); assert.equal(fill.G, fill.B);
    assert(outline.R > 0.5); assert.equal(outline.R, outline.G); assert.equal(outline.G, outline.B);
});
run('three simultaneous warning types have separate centered positions', env => {
    const p = env.create(); p.update({}, both.concat([{color:'black',id:'k'}]), false); const c = env.latest();
    assert(c.children.every(x => x.visibility === 'HitTestInvisible'));
    assert(c.slots[0].position.X < c.slots[1].position.X); assert(c.slots[1].position.X < c.slots[2].position.X);
    assert.equal(c.slots[1].position.X, 0); assert.equal(c.slots[0].position.X, -c.slots[2].position.X);
});

console.log('RESULT ' + passed + ' presentation scenarios passed; ' + failed + ' failed. Mock UE only; no game or rendering access.');
if (failed) process.exitCode = 1;

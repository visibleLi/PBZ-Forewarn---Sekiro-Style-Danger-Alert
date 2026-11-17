"use strict";
function createPresentation(UE, cpp, adapter, settings, diagnostic) {
    let hud = null, canvas = null, glyphs = {}, lastStatus = "", failedAt = -Infinity;
    const colors = ['red', 'blue', 'black'];
    const { valid } = adapter;
    const slotKey = "__PBZForewarnCanvas";
    function report(kind, data) { try { diagnostic(kind, data); } catch (_) {} }
    function removeCanvas(old) {
        if (!old) return;
        try { if (valid(old)) old.SetVisibility(UE.ESlateVisibility.Collapsed); } catch (_) {}
        try { if (valid(old)) old.RemoveFromParent(); } catch (_) {}
        if (globalThis[slotKey] === old) delete globalThis[slotKey];
    }
    // Reload cleanup occurs exactly once. Later disposal only touches this
    // instance's canvas, never a newer presentation's global replacement.
    removeCanvas(globalThis[slotKey]);
    function dispose() {
        const old = canvas;
        hud = canvas = null; glyphs = {};
        lastStatus = "";
        removeCanvas(old);
    }
    function failure(error) {
        const now = Date.now();
        if (now - failedAt >= 1500) report("hud-error", { error: String(error) });
        failedAt = now;
        dispose();
    }
    function vec(x, y) { const v = new UE.Vector2D(); v.X = x; v.Y = y; return v; }
    function textNode(parent, font, color) {
        const node = UE.NewObject(UE.TextBlock.StaticClass(), parent);
        node.SetText(cpp.FText.FromString("危"));
        const face = new UE.SlateFontInfo(); face.FontObject = font; face.TypefaceFontName = "Default"; face.Size = settings.GlyphFontSize;
        const outline = face.OutlineSettings; outline.OutlineSize = 4;
        const outlineColor = new UE.LinearColor();
        const outlineRgb = color === 'black' ? [0.7, 0.7, 0.7] : [0.015, 0.015, 0.02];
        outlineColor.R = outlineRgb[0]; outlineColor.G = outlineRgb[1]; outlineColor.B = outlineRgb[2]; outlineColor.A = 1;
        outline.OutlineColor = outlineColor; face.OutlineSettings = outline; node.SetFont(face);
        const c = new UE.SlateColor(); const lc = new UE.LinearColor();
        const rgb = color === 'red' ? [1, 0.08, 0.03] : color === 'blue' ? [0.08, 0.55, 1] : [0.025, 0.025, 0.025];
        lc.R = rgb[0]; lc.G = rgb[1]; lc.B = rgb[2]; lc.A = 1;
        c.SpecifiedColor = lc; c.ColorUseRule = UE.ESlateColorStylingMode.UseColor_Specified;
        node.SetColorAndOpacity(c); node.SetJustification(UE.ETextJustify.Center);
        node.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
        const slot = canvas.AddChildToCanvas(node); const anchor = new UE.Anchors();
        anchor.Minimum = vec(0.5, settings.GlyphY); anchor.Maximum = vec(0.5, settings.GlyphY);
        slot.SetAnchors(anchor); slot.SetAlignment(vec(0.5, 0.5)); slot.SetAutoSize(true); slot.SetZOrder(1000);
        return { node, slot };
    }
    function ensure(world) {
        try {
            if (Date.now() - failedAt < 1500) return false;
            const next = UE.PBZHUDLayout.GetHUDLayout(world);
            if (!valid(next)) { dispose(); return false; }
            if (next === hud && valid(canvas) && colors.every(c => glyphs[c] && valid(glyphs[c].node) && valid(glyphs[c].slot))) return true;
            dispose();
            const overlay = UE.Widget.Find("Overlay_0", next.WidgetTree);
            if (!valid(overlay)) throw Error("HUD Overlay_0 unavailable");
            const font = UE.Font.Load(settings.FontPath);
            if (!valid(font)) throw Error("glyph font unavailable");
            canvas = UE.NewObject(UE.CanvasPanel.StaticClass(), next); globalThis[slotKey] = canvas;
            canvas.SetVisibility(UE.ESlateVisibility.Collapsed);
            const outer = overlay.AddChildToOverlay(canvas);
            outer.SetHorizontalAlignment(UE.EHorizontalAlignment.HAlign_Fill); outer.SetVerticalAlignment(UE.EVerticalAlignment.VAlign_Fill);
            for (const color of colors) glyphs[color] = textNode(next, font, color);
            hud = next;
            report("hud-ready", {}); return true;
        } catch (e) { failure(e); return false; }
    }
    function update(world, active, paused) {
        try {
            if (!settings.GlyphOn || paused || !active.length) {
                if (valid(canvas)) canvas.SetVisibility(UE.ESlateVisibility.Collapsed); lastStatus = ""; return [];
            }
            if (!ensure(world)) return [];
            const visible = colors.filter(c => active.some(x => x.color === c));
            canvas.SetVisibility(UE.ESlateVisibility.HitTestInvisible);
            for (const color of colors) {
                const i = visible.indexOf(color), glyph = glyphs[color];
                glyph.node.SetVisibility(i >= 0 ? UE.ESlateVisibility.HitTestInvisible : UE.ESlateVisibility.Collapsed);
                glyph.slot.SetPosition(vec(i >= 0 ? (i - (visible.length - 1) / 2) * settings.GlyphFontSize * 1.3 : 0, 0));
            }
            const status = visible.map(c => c === 'black' ? 'K' : c[0].toUpperCase()).join('');
            if (status !== lastStatus) { report("hud-show", { colors: status }); lastStatus = status; }
            return visible.map(color => active.find(x => x.color === color)).filter(Boolean);
        } catch (e) {
            // UI failures are independent of combat/audio scheduling. Rebuild
            // after a bounded delay instead of retrying a stale slot each tick.
            failure(e);
            return [];
        }
    }
    return { update, dispose };
}
module.exports = { createPresentation };

"use strict";
const assert = require("node:assert/strict");
const { stage, createCastFollowup } = require("../PBZForewarn/cast-followup");
const { BLACK_ACTION_CLASS, BLACK_EFFECT_OBJECT } = require("../PBZForewarn/attack-recognition");
let passed = 0;
function test(n, fn) { fn(); passed++; console.log("PASS " + n); }
const actor = "/World/BP_Monster_FemaleVessel_YuZan_C_1";
function row(kind, side = "L", changes = {}) {
    const ability = actor + (kind === "cast" ? ".GA_YuZan_Skill_03_C_1" : ".GA_YuZan_Skill_03_A_" + side + "_Start_C_1");
    return { world: "world|epoch", actor, ability, timeline: ability + (kind === "success" ? ".Success" : ".Main"),
        key: "task-" + kind, serial: kind === "cast" ? 1 : kind === "main" ? 2 : 3, activation: "1", live: true, ...changes };
}
function event(r, changes = {}) {
    return { color: "black", eligible: true, meta: { actionClass: BLACK_ACTION_CLASS, effect: BLACK_EFFECT_OBJECT,
        action: r.timeline + ".GAAction_PowerAttackParticle_C_0", roleName: "" }, ...changes };
}
function bound(side = "L") {
    const g = createCastFollowup(), c = row("cast", side), m = row("main", side), s = row("success", side);
    g.recordCue(c, "cast-cue"); g.update([c, m]); g.update([{ ...m, live: false }, s]); return { g, c, m, s };
}
test("both exact side chains suppress only the confirmed followup presentation node", () => {
    for (const side of ["L", "R"]) {
        const { g, s } = bound(side), result = g.suppression(s, event(s));
        assert.equal(result.castCueId, "cast-cue"); assert.equal(result.mainRecordSerial, 2);
        assert.match(result.associationBasis, /not-engine-parent/);
    }
});
test("a matching name or nearby Success without a submitted cast and intermediate Main keeps original warning", () => {
    const g = createCastFollowup(), c = row("cast"), s = row("success");
    assert.equal(g.suppression(s, event(s)), null);
    g.recordCue(c, "cast");g.update([c, s]);assert.equal(g.suppression(s, event(s)), null);
});
test("a record gap between stages cannot borrow an old cast cue", () => {
    const g = createCastFollowup(), c = row("cast"), m = row("main"), s = row("success");
    g.recordCue(c,"cast");g.update([]);g.update([c,m]);g.update([m,s]);assert.equal(g.suppression(s,event(s)),null);
    const h=createCastFollowup();h.recordCue(c,"cast");h.update([c,m]);h.update([]);h.update([m,s]);
    assert.equal(h.suppression(s,event(s)),null);
});
test("ambiguous concurrent mains or successes keep the original warning", () => {
    for(const conflict of ["main","success"]){
        const g=createCastFollowup(),c=row("cast"),m=row("main"),s=row("success");g.recordCue(c,"cast");
        if(conflict==="main")g.update([c,m,{...m,key:"other",serial:5}]);
        else{g.update([c,m]);g.update([m,s,{...s,key:"other",serial:6}]);}
        assert.equal(g.suppression(s,event(s)),null);
    }
});
test("world actor ability activation and task generation remain isolated", () => {
    for(const change of [{world:"new-world"},{actor:actor+"2"},{activation:"2"},{key:"reused-task"},{serial:999}]){
        const {g,s}=bound();assert.equal(g.suppression({...s,...change},event(s)),null);
    }
    const g=createCastFollowup(),c=row("cast"),m=row("main"),s=row("success", "R");
    g.recordCue(c,"cast");g.update([c,m]);g.update([m,s]);assert.equal(g.suppression(s,event(s)),null);
});
test("a new cast activation supersedes the previous chain even without another cue", () => {
    const {g,c,s}=bound();g.update([s,{...c,activation:"2",serial:4,key:"new-cast"}]);
    assert.equal(g.suppression(s,event(s)),null);
});
test("withdrawal and context clear restore the original path", () => {
    for(const reset of [g=>g.clear(),g=>g.withdrawCue("cast-cue")]){
        const {g,s}=bound();reset(g);assert.equal(g.suppression(s,event(s)),null);
    }
});
test("other colors resources roles action instances and ineligible nodes are never suppressed", () => {
    for(const change of [{color:"red"},{eligible:false},{meta:{actionClass:"other"}},
        {meta:{effect:"other"}},{meta:{roleName:"Other"}},{meta:{action:"other"}}]){
        const {g,s}=bound(),e=event(s),input={...e,...change,meta:{...e.meta,...(change.meta||{})}};
        assert.equal(g.suppression(s,input),null);
    }
});
test("invalid identities and lookalike ability names cannot establish a chain", () => {
    const c=row("cast"),g=createCastFollowup(),s=row("success");
    g.recordCue({...c,activation:"unknown"},"cast");g.update([c,row("main")]);g.update([row("main"),s]);
    assert.equal(g.suppression(s,event(s)),null);
    assert.equal(stage({...s,ability:s.ability+"_lookalike",timeline:s.ability+"_lookalike.Success"}),null);
});
console.log("Followup policy: " + passed + " scenarios passed. Observed stage links are not engine parent IDs.");

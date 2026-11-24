const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("./load").load("core/ui.js");

const sample = {
  topicTitle: "6·25 전쟁", textbookName: "천재교과서", dateStr: "2026-11-25",
  state: {
    phase: "done", items: ["북한이 남침했다", "유엔군이 도와주었다", "전쟁은 1953년에 끝났다"],
    checks: ["ok", "ok", "think"], target: 2, mode: "counter",
    turns: [{ q: "1953년에 맺은 협정의 이름은 무엇이었나요?", a: "정전 협정이요." }],
    verdict: "revisit", summary: ["북한의 남침과 국제 연합군 참전", "1953년에 전쟁이 멈췄다", "정전과 종전은 어떻게 다를까요?"],
  },
};

test("elapsed format", () => { assert.equal(U.formatElapsed(247000), "4:07"); assert.equal(U.formatElapsed(0), "0:00"); assert.equal(U.formatElapsed(-5), "0:00"); });
test("verdict text exact", () => {
  assert.deepEqual(U.VERDICT_TEXT.strong, { label: "튼튼한 생각", message: "반례에도 무너지지 않았어요. 근거가 있는 생각이에요." });
  assert.deepEqual(U.VERDICT_TEXT.revisit, { label: "다시 볼 생각", message: "모르는 것을 알게 되었어요. 다음 시간에 확인해 봐요." });
  assert.deepEqual(U.VERDICT_TEXT.hold, { label: "판정 보류", message: "선생님과 더 이야기해 봐요." });
});
test("check text", () => assert.deepEqual(U.CHECK_TEXT, { ok: "✓", think: "더 생각해 볼 것", outside: "교과서 밖 이야기예요" }));
test("result text has summary, no name field", () => {
  const t = U.resultText(sample);
  assert.ok(t.includes(sample.state.summary[2]));
  assert.ok(t.includes("다시 볼 생각"));
  assert.ok(t.includes("정전 협정이요."));
  assert.ok(t.includes("천재교과서"));
  assert.ok(!/(이름|학생)\s*:/.test(t), "학생 이름 칸이 없어야 함");
  assert.ok(!/틀렸|점수/.test(t));
});

const D = require("./load").load("data/topic-3-2.js");
const doneState = (over) => ({ phase: "done", items: ["북한이 남침했다", "유엔군이 도와주었다", "전쟁은 1953년에 끝났다"],
  checks: ["ok", "ok", "think"], target: 2, mode: "counter", turns: [], misconception: "3-2.m01", verdict: "hold", summary: [], ...over });
test("teacher help: none for a strong verdict", () => assert.equal(U.teacherHelp(D, "chunjae", doneState({ verdict: "strong" })), null));
test("teacher help: textbook truth, page and hints for the chosen textbook", () => {
  const h = U.teacherHelp(D, "chunjae", doneState({}));
  assert.equal(h.item, "전쟁은 1953년에 끝났다");
  assert.equal(h.truth, D.misconceptions[0].truth);
  assert.equal(h.where, "천재교과서 3단원 11차시 6·25 전쟁으로 사람들이 겪은 어려움 살펴보기 151쪽");
  assert.deepEqual(h.hints, D.misconceptions[0].counterHints);
  assert.equal(U.teacherHelp(D, "visang", doneState({ verdict: "revisit" })).where, "비상교육 3단원 11~12차시 6·25 전쟁의 과정과 영향을 알아볼까요 142쪽");
});
test("teacher help: without a misconception, point to the textbook lessons", () => {
  const h = U.teacherHelp(D, "chunjae", doneState({ misconception: null, mode: "retry", checks: ["think", "think", "outside"], target: 0 }));
  assert.equal(h.truth, null);
  assert.equal(h.where, "천재교과서 3단원 8~9차시, 3단원 10차시, 3단원 11차시, 3단원 12차시");
  assert.deepEqual(h.hints, []);
});
test("teacher help: no misconception points to today's lesson", () => {
  const h = U.teacherHelp(D, "icecream", doneState({ misconception: null }), "3-12");
  assert.equal(h.where, "아이스크림미디어 3단원 12차시 6·25 전쟁 이후 달라진 사회와 사람들의 생활 모습을 알아볼까요");
  assert.equal(h.truth, null);
});

// 바로 설명할 내용: 검증된 개념 문장을 고른 교과서 쪽과 함께 보여 줍니다.
const C = (id) => D.concepts.find((c) => c.id === `3-2.${id}`);
test("teacher help notes: a misconception shows its linked concepts with the chosen textbook page", () => {
  const h = U.teacherHelp(D, "chunjae", doneState({}));
  assert.deepEqual(h.notes, [{ text: C("c12").text, page: "151·152" }, { text: C("c13").text, page: "151" }]);
  assert.deepEqual(U.teacherHelp(D, "visang", doneState({})).notes.map((n) => n.page), ["142", "142·145"]);
});
test("teacher help notes: a linked concept missing from the chosen textbook is left out", () => {
  const T = { ...D, misconceptions: D.misconceptions.map((m) => (m.id === "3-2.m01" ? { ...m, concepts: [...m.concepts, "3-2.c34"] } : m)) };
  assert.ok(!C("c34").sources.chunjae);
  assert.deepEqual(U.teacherHelp(T, "chunjae", doneState({})).notes.map((n) => n.text), [C("c12").text, C("c13").text]);
});
test("teacher help notes: without a misconception, today's lesson concepts for the chosen textbook", () => {
  const h = U.teacherHelp(D, "icecream", doneState({ misconception: null }), "3-12");
  const want = D.concepts.filter((c) => c.sources.icecream && c.sources.icecream.lesson === "3-12");
  assert.ok(want.length >= 3);
  assert.deepEqual(h.notes, want.map((c) => ({ text: c.text, page: c.sources.icecream.page })));
});
test("teacher help notes: unit wrap-up without a misconception shows none", () => {
  assert.deepEqual(U.teacherHelp(D, "chunjae", doneState({ misconception: null })).notes, []);
});

// 다시 볼 생각: 학생이 처음 적은 항목과 세 줄 정리의 "다시 생각한 것"을 나란히 보여 줍니다.
test("rethink: revisit pairs the target item with the rethought line", () => {
  assert.deepEqual(U.rethink(sample.state), { before: "전쟁은 1953년에 끝났다", after: "1953년에 전쟁이 멈췄다" });
});
test("rethink: none unless revisit with a target and a second summary line", () => {
  assert.equal(U.rethink({ ...sample.state, verdict: "strong" }), null);
  assert.equal(U.rethink({ ...sample.state, verdict: "hold" }), null);
  assert.equal(U.rethink({ ...sample.state, target: null }), null);
  assert.equal(U.rethink({ ...sample.state, summary: ["하나"] }), null);
  assert.equal(U.rethink({ ...sample.state, summary: ["하나", "  "] }), null);
});
test("result text carries the before → after line for revisit", () => {
  assert.ok(U.resultText(sample).includes("처음 생각: 전쟁은 1953년에 끝났다 → 고친 생각: 1953년에 전쟁이 멈췄다"));
  assert.ok(!U.resultText({ ...sample, state: { ...sample.state, verdict: "strong" } }).includes("처음 생각"));
});

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
  assert.deepEqual(U.VERDICT_TEXT.revisit, { label: "다시 볼 생각", message: "스스로 허점을 찾았어요. 다음 시간에 확인해 봐요." });
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
  assert.equal(h.where, "천재교과서 3단원 11차시 151쪽");
  assert.deepEqual(h.hints, D.misconceptions[0].counterHints);
  assert.equal(U.teacherHelp(D, "visang", doneState({ verdict: "revisit" })).where, "비상교육 3단원 11차시 142쪽");
});
test("teacher help: without a misconception, point to the textbook lessons", () => {
  const h = U.teacherHelp(D, "chunjae", doneState({ misconception: null, mode: "retry", checks: ["think", "think", "outside"], target: 0 }));
  assert.equal(h.truth, null);
  assert.ok(h.where.startsWith("천재교과서 3단원 11차시"));
  assert.deepEqual(h.hints, []);
});

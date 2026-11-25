const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const D = load("methods/detective.js");
const T = load("core/topic.js");
const FIXTURE = require("./fixtures/detective-problems.js");

const UNIT = T.mergeTopics([load("data/topic-3-1.js"), load("data/topic-3-2.js")], "3단원");
const chars = (n) => "가".repeat(n);
const ids = (ps) => ps.map((p) => p.id);
const miscOf = (ps) => ps.map((p) => p.misconception);

// ---------- 응답 형식과 검사 ----------
const expectJ = (o = {}) => ({ stage: "judge", asked: [], leakWords: ["도쿄", "윤봉길"], said: "이봉창이 아니에요", ...o });
const bad = (out, expect, clue) => {
  const v = D.validateDetectiveStep(out, expect);
  assert.equal(v.ok, false, `통과하면 안 됨: ${JSON.stringify(out)}`);
  if (clue) assert.match(v.reason, clue);
};
const good = (out, expect) => assert.deepEqual(D.validateDetectiveStep(out, expect), { ok: true });

test("schemaFor narrows result per stage", () => {
  const j = D.schemaFor("judge");
  assert.deepEqual(j.properties.result.enum, ["solved", "ask"]);
  assert.deepEqual([...j.required].sort(), ["question", "result"]);
  assert.equal(j.additionalProperties, false);
  const f = D.schemaFor("final");
  assert.deepEqual(f.properties.result.enum, ["solved", "found"]);
  assert.deepEqual([...f.required], ["result"]);
  assert.equal(f.additionalProperties, false);
  const q = D.schemaFor("question");
  assert.deepEqual(q.properties.result.enum, ["ask"]);
  assert.deepEqual([...q.required].sort(), ["question", "result"]);
});

test("validate: good judge, good final", () => {
  good({ result: "ask", question: "그 사람은 어디에서 무엇을 했을까요?" }, expectJ());
  good({ result: "solved", question: "" }, expectJ());
  good({ result: "found" }, expectJ({ stage: "final" }));
  good({ result: "ask", question: "왜 그렇게 생각했나요?" }, expectJ({ stage: "question" }));
});
test("validate: result outside the stage enum", () => {
  bad({ result: "found" }, expectJ(), /허용/);
  bad({ result: "ask", question: "왜요?" }, expectJ({ stage: "final" }), /허용/);
  bad({ result: "solved", question: "" }, expectJ({ stage: "question" }), /허용/);
  bad(null, expectJ(), /객체/);
});
test("validate: ask needs a polite one-sentence question", () => {
  bad({ result: "ask", question: "그 사람은 어디에서 던졌어?" }, expectJ(), /존댓말/);
  bad({ result: "ask", question: chars(39) + "요?" }, expectJ(), /40자/);
  bad({ result: "ask", question: "" }, expectJ(), /비어/);
});
test("validate: choice question is rejected", () =>
  bad({ result: "ask", question: "정부가 세웠을까요, 학생들이 시작했을까요?" }, expectJ(), /고르/));
test("validate: repeated question (spacing ignored)", () =>
  bad({ result: "ask", question: "왜 그렇게 생각 했나요?" }, expectJ({ asked: ["왜 그렇게 생각했나요?"] }), /앞에서 한 질문/));
test("solved needs no question", () => good({ result: "solved", question: "" }, expectJ()));

test("leak check blocks truth words the student has not said", () => {
  assert.equal(D.leakIn("도쿄에서는 무슨 일이 있었을까요?", ["도쿄", "윤봉길"], "이봉창이 아니에요"), "도쿄");
  bad({ result: "ask", question: "도쿄에서는 무슨 일이 있었을까요?" }, expectJ(), /도쿄/);
});
test("leak check allows words the student said", () => {
  assert.equal(D.leakIn("도쿄에서는 무슨 일이 있었을까요?", ["도쿄", "윤봉길"], "도 쿄에서 던졌어요"), null);
  assert.equal(D.leakIn("왜 그렇게 생각했나요?", ["도쿄"], ""), null);
  good({ result: "ask", question: "도쿄에서는 무슨 일이 있었을까요?" }, expectJ({ said: "도 쿄에서 던졌어요" }));
});

// ---------- 문제 고르기 ----------
const pick = (o) => D.pickProblems({ problems: FIXTURE, topic: UNIT, textbookId: "chunjae", lessonId: "3-12", served: new Set(), random: () => 0, ...o });

test("pick: first from today, second from an earlier lesson", () => {
  const ps = pick();
  assert.equal(ps.length, 2);
  assert.ok(["3-2.m06", "3-2.m08"].includes(ps[0].misconception), ps[0].id);
  assert.equal(ps[1].misconception, "3-2.m02");
});
test("pick: unit's first lesson with one misconception gives one problem", () => {
  const ps = pick({ lessonId: "3-2" });
  assert.deepEqual(miscOf(ps), ["3-1.m01"]);
});
test("pick: unit wrap-up gives two different misconceptions", () => {
  const ps = pick({ lessonId: null });
  assert.equal(ps.length, 2);
  assert.notEqual(ps[0].misconception, ps[1].misconception);
});
test("pick: unserved problems first, then unserved misconceptions", () => {
  const ps = pick({ served: new Set(["3-2.m06.a"]) });
  assert.notEqual(ps[0].id, "3-2.m06.a");
  assert.equal(ps[0].id, "3-2.m08.a"); // 3-2.m06.b 는 안 낸 문제지만 오개념 3-2.m06 이 이미 나왔음
});
test("pick: served set records what was picked", () => {
  const served = new Set();
  const ps = pick({ served });
  assert.deepEqual([...served].sort(), ids(ps).sort());
});
test("rotation wraps when every candidate was served", () => {
  const served = new Set(["3-2.m06.a", "3-2.m06.b", "3-2.m08.a", "3-2.m02.a", "3-1.m01.a"]);
  const ps = pick({ served });
  assert.equal(ps.length, 2);
  assert.notEqual(ps[0].misconception, ps[1].misconception);
  assert.ok(served.size >= 2 && served.size <= 5);
  assert.ok(ids(ps).every((id) => served.has(id)));
});
test("pick: many students in a row never repeat a misconception within one student", () => {
  const served = new Set();
  for (let i = 0; i < 9; i++) {
    const ps = pick({ served, random: () => (i * 0.37) % 1 });
    assert.equal(ps.length, 2);
    assert.notEqual(ps[0].misconception, ps[1].misconception);
  }
});
test("pick: textbook outside problem.textbooks is skipped", () => {
  for (let i = 0; i < 5; i++) {
    const ps = pick({ textbookId: "icecream", lessonId: "3-12", random: () => i / 5 });
    assert.ok(!ids(ps).includes("3-2.m08.a"));
  }
});

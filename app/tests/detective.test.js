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
test("pick: second problem avoids one whose answer words appear in the first problem's sentences", () => {
  const byId = (id) => JSON.parse(JSON.stringify(FIXTURE.find((p) => p.id === id)));
  const p06 = byId("3-2.m06.a"), p08 = byId("3-2.m08.a"), p02 = byId("3-2.m02.a");
  p08.leakWords = ["이산가족"];
  p06.sentences[0] = "이 전쟁으로 이산가족이 많이 생겼어요.";
  const ps = D.pickProblems({ problems: [p06, p08, p02], topic: UNIT, textbookId: "chunjae", lessonId: null, served: new Set(), random: () => 0 });
  assert.deepEqual(ids(ps), ["3-2.m06.a", "3-2.m02.a"]);
});
test("pick: textbook outside problem.textbooks is skipped", () => {
  for (let i = 0; i < 5; i++) {
    const ps = pick({ textbookId: "icecream", lessonId: "3-12", random: () => i / 5 });
    assert.ok(!ids(ps).includes("3-2.m08.a"));
  }
});

// ---------- 세션 흐름 ----------
// 가짜 AI: 요청을 calls에 쌓고, 큐에서 응답을 꺼냅니다(Error면 실패, 함수면 그 promise).
function fakeLLM(responses = []) {
  const calls = [];
  return {
    calls,
    call(req) {
      calls.push(req);
      const r = responses.shift();
      if (r instanceof Error) return Promise.reject(r);
      if (typeof r === "function") return r();
      if (r === undefined) return Promise.reject(new Error("가짜 응답이 더 없음"));
      return Promise.resolve(JSON.parse(JSON.stringify(r)));
    },
  };
}
// 천재 12차시, 문제 1 = 3-2.m06.a(숨은 문장 1번째), 문제 2 = 3-2.m02.a(숨은 문장 2번째)
const make = (llm, o = {}) => D.createSession({ topic: UNIT, textbookId: "chunjae", lessonId: "3-12", llm, problems: FIXTURE,
  problemIds: ["3-2.m06.a", "3-2.m02.a"], ...o });
const SOLVED = { result: "solved", question: "" };
const ASK = (question) => ({ result: "ask", question });
const userText = (call) => call.messages[0].content[1].text;
async function started(llm, o) { const s = make(llm, o); await s.start(); return s; }

test("start shows problem 1 without calling AI", async () => {
  const llm = fakeLLM();
  const s = make(llm);
  assert.equal(s.getState().phase, "input");
  const st = await s.start();
  assert.equal(st.phase, "asking"); assert.equal(st.step, "pick");
  assert.equal(st.records.length, 1); assert.equal(st.records[0].problemId, "3-2.m06.a");
  assert.equal(st.problems.length, 2); assert.equal(llm.calls.length, 0);
});

test("select changes before send, same prompt for any card", async () => {
  const s = await started(fakeLLM());
  const a = await s.select(0);
  const b = await s.select(1); // 숨은 문장
  assert.equal(a.selected, 0); assert.equal(b.selected, 1);
  for (const k of ["step", "line", "question", "phase"]) assert.deepEqual(a[k], b[k], k);
  assert.equal(b.line, null);
});

test("blank reason is ignored", async () => {
  const llm = fakeLLM();
  const s = await started(llm);
  const none = await s.submitReason("왜냐하면요"); // 아무 문장도 누르지 않음
  await s.select(1);
  const before = s.getState();
  const after = await s.submitReason("   ");
  assert.deepEqual(after, before);
  assert.equal(none.records[0].wrongTaps.length, 0); assert.equal(llm.calls.length, 0);
});

test("wrong card once: thanks line, card disabled; twice: together and between", async () => {
  const llm = fakeLLM();
  const s = await started(llm);
  await s.select(0);
  let st = await s.submitReason("집이 부서진 건 이상해요");
  assert.deepEqual(st.records[0].wrongTaps, [{ index: 0, reason: "집이 부서진 건 이상해요" }]);
  assert.equal(st.line, D.LINES.wrongFirst); assert.equal(st.selected, null); assert.equal(st.step, "pick");
  st = await s.select(0); // 살펴본 문장은 다시 누를 수 없음
  assert.equal(st.selected, null);
  await s.select(2);
  st = await s.submitReason("몰라요");
  assert.equal(st.records[0].mark, "together"); assert.equal(st.step, "between"); assert.equal(st.line, D.LINES.wrongLast);
  assert.equal(llm.calls.length, 0);
});

test("hidden card solved at once", async () => {
  const llm = fakeLLM([SOLVED]);
  const s = await started(llm);
  await s.select(1);
  const st = await s.submitReason("보통 사람들도 많이 다쳤어요");
  assert.equal(st.records[0].mark, "solved"); assert.equal(st.records[0].reason, "보통 사람들도 많이 다쳤어요");
  assert.equal(st.step, "between"); assert.equal(st.line, D.LINES.solved); assert.equal(llm.calls.length, 1);
  assert.deepEqual(llm.calls[0].schema.properties.result.enum, ["solved", "ask"]);
});

test("follow-ups: ask, ask, then final found", async () => {
  const llm = fakeLLM([ASK("피란 가던 사람들은 안전했을까요?"), ASK("마을에서 싸움이 나면 누가 다칠까요?"), { result: "found" }]);
  const s = await started(llm);
  await s.select(1);
  let st = await s.submitReason("아니에요");
  assert.equal(st.step, "follow"); assert.equal(st.question, "피란 가던 사람들은 안전했을까요?");
  st = await s.submitAnswer("몰라요");
  assert.equal(st.question, "마을에서 싸움이 나면 누가 다칠까요?");
  st = await s.submitAnswer("군인이요");
  assert.equal(llm.calls.length, 3);
  assert.deepEqual(llm.calls[2].schema.properties.result.enum, ["solved", "found"]);
  assert.equal(st.records[0].mark, "found"); assert.equal(st.line, D.LINES.found); assert.equal(st.step, "between");
  assert.deepEqual(st.records[0].turns.map((t) => t.a), ["몰라요", "군인이요"]);
});

test("follow-up answered well becomes solved", async () => {
  const s = await started(fakeLLM([ASK("피란 가던 사람들은 안전했을까요?"), SOLVED]));
  await s.select(1); await s.submitReason("아니에요");
  const st = await s.submitAnswer("피란 가던 사람들도 다쳤어요");
  assert.equal(st.records[0].mark, "solved"); assert.equal(st.line, D.LINES.solved);
});

test("leaked question is re-asked with the question-only schema", async () => {
  const llm = fakeLLM([ASK("보통 사람도 다쳤을까요?"), ASK("피란 가던 사람들은 어땠을까요?")]);
  const s = await started(llm);
  await s.select(1);
  const st = await s.submitReason("군인만 다친 게 아니에요");
  assert.equal(llm.calls.length, 2);
  assert.deepEqual(llm.calls[1].schema.properties.result.enum, ["ask"]);
  assert.match(userText(llm.calls[1]), /검사에 걸렸어요/);
  assert.equal(st.question, "피란 가던 사람들은 어땠을까요?"); assert.equal(st.fallbacks, 0);
});

test("two bad questions fall back to a default question and count it", async () => {
  const s = await started(fakeLLM([ASK("보통 사람도 다쳤을까요?"), ASK("민간인은 어땠을까요?")]));
  await s.select(1);
  const st = await s.submitReason("아니에요");
  assert.equal(st.fallbacks, 1); assert.equal(st.step, "follow"); assert.equal(st.question, D.DEFAULT_QUESTIONS[0]);
});

test("final keeps failing → found and fallback", async () => {
  const s = await started(fakeLLM([ASK("피란 가던 사람들은 안전했을까요?"), ASK("마을에서 싸움이 나면 누가 다칠까요?"),
    { result: "ask", question: "왜요?" }, { result: "bogus" }, null]));
  await s.select(1); await s.submitReason("아니에요"); await s.submitAnswer("몰라요");
  const st = await s.submitAnswer("몰라요");
  assert.equal(st.records[0].mark, "found"); assert.equal(st.fallbacks, 1);
});

test("finishNow: reason sent → found; only tapped → together; unstarted problems omitted", async () => {
  const s1 = await started(fakeLLM([ASK("피란 가던 사람들은 안전했을까요?")]));
  await s1.select(1); await s1.submitReason("아니에요");
  let st = await s1.finishNow();
  assert.equal(st.phase, "done"); assert.equal(st.records.length, 1); assert.equal(st.records[0].mark, "found");
  const s2 = await started(fakeLLM());
  await s2.select(1);
  st = await s2.finishNow();
  assert.equal(st.records[0].mark, "together"); assert.equal(st.records[0].reason, null);
});

test("next goes to problem 2, then done after the last", async () => {
  const s = await started(fakeLLM([SOLVED, SOLVED]));
  await s.select(1); await s.submitReason("보통 사람도 다쳤어요");
  let st = await s.next();
  assert.equal(st.index, 1); assert.equal(st.records.length, 2); assert.equal(st.step, "pick");
  assert.equal(st.line, null); assert.equal(st.selected, null); assert.equal(st.records[1].problemId, "3-2.m02.a");
  await s.select(2); await s.submitReason("북한군이 먼저 쳐들어왔어요");
  st = await s.next();
  assert.equal(st.phase, "done"); assert.deepEqual(st.records.map((r) => r.mark), ["solved", "solved"]);
});

test("one-problem session ends after the first", async () => {
  const s = D.createSession({ topic: UNIT, textbookId: "chunjae", lessonId: "3-2", llm: fakeLLM([SOLVED]), problems: FIXTURE, served: new Set(), random: () => 0 });
  let st = await s.start();
  assert.equal(st.problems.length, 1);
  await s.select(1); await s.submitReason("군인들이 의병에 들어가 더 활발해졌어요");
  st = await s.next();
  assert.equal(st.phase, "done");
});

test("cancel drops a late judge response", async () => {
  let release;
  const s = await started(fakeLLM([() => new Promise((r) => { release = () => r(SOLVED); })]));
  await s.select(1);
  const p = s.submitReason("보통 사람도 다쳤어요");
  assert.equal(s.getState().phase, "waiting");
  s.cancel();
  release();
  await p;
  const st = s.getState();
  assert.equal(st.phase, "input"); assert.deepEqual(st.records, []);
});

test("error then retry repeats the judge call", async () => {
  const llm = fakeLLM([new Error("연결 실패"), SOLVED]);
  const s = await started(llm);
  await s.select(1);
  let st = await s.submitReason("보통 사람도 다쳤어요");
  assert.equal(st.phase, "error"); assert.equal(st.error, D.ERROR_MESSAGE);
  st = await s.retry();
  assert.equal(st.records[0].mark, "solved"); assert.equal(llm.calls.length, 2);
  assert.equal(userText(llm.calls[0]), userText(llm.calls[1]));
});

test("message keeps two blocks, first cached; wrong taps are not sent", async () => {
  const llm = fakeLLM([SOLVED]);
  const s = await started(llm);
  await s.select(0); await s.submitReason("집이 부서진 건 이상해요");
  await s.select(1); await s.submitReason("군인만 다친 게 아니에요");
  const blocks = llm.calls[0].messages[0].content;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(blocks[0].text, T.buildContext(UNIT, "chunjae", "3-12"));
  const t = blocks[1].text;
  assert.match(t, /숨은 문장: 2번/);
  assert.ok(t.includes(FIXTURE[0].key)); assert.ok(t.includes("민간인")); assert.ok(t.includes("군인만 다친 게 아니에요"));
  assert.ok(!t.includes("집이 부서진 건 이상해요"));
  assert.equal(typeof llm.calls[0].system, "string");
});

test("system prompt carries the rules", async () => {
  for (const w of ["정답", "퀴즈", "몰라요", "안 됨", "solved", "ask"]) assert.ok(D.SYSTEM_PROMPT.includes(w), w);
  assert.ok(!D.SYSTEM_PROMPT.includes("틀렸"));
  const llm = fakeLLM([SOLVED]);
  const s = await started(llm, { sourceText: "오늘 차시 원문" });
  await s.select(1); await s.submitReason("보통 사람도 다쳤어요");
  const sys = llm.calls[0].system;
  assert.equal(sys.length, 2); assert.deepEqual(sys[1].cache_control, { type: "ephemeral" }); assert.match(sys[1].text, /오늘 차시 원문/);
});

async function mixedState() {
  const s = await started(fakeLLM([SOLVED]));
  await s.select(1); await s.submitReason("보통 사람도 다쳤어요");
  await s.next();
  await s.select(0); await s.submitReason("날짜가 이상해요");
  await s.select(1); await s.submitReason("몰라요");
  return s.getState();
}

test("resultText shows found sentence only for found/solved problems", async () => {
  const st = await mixedState();
  const text = D.resultText({ topicTitle: "3단원", textbookName: "천재교과서 12차시", dateStr: "2026-11-25", state: st });
  assert.match(text, /^\[오답 탐정 학습정리\] 3단원 · 천재교과서 12차시 · 2026-11-25/);
  assert.ok(text.includes(D.MARK_TEXT.solved)); assert.ok(text.includes(D.MARK_TEXT.together));
  assert.ok(text.includes(`${FIXTURE[0].sentences[1]}  ← 찾은 문장`));
  assert.equal((text.match(/찾은 문장/g) || []).length, 1);
  assert.ok(text.includes("나의 까닭: 보통 사람도 다쳤어요"));
});

test("detectiveHelp: none when all solved without wrong taps; sections carry hidden sentence and wrong taps", async () => {
  const s = await started(fakeLLM([SOLVED]));
  await s.select(1); await s.submitReason("보통 사람도 다쳤어요");
  assert.equal(D.detectiveHelp(UNIT, "chunjae", await s.finishNow(), "3-12"), null);
  const help = D.detectiveHelp(UNIT, "chunjae", await mixedState(), "3-12");
  assert.equal(help.sections.length, 1);
  const h = help.sections[0];
  assert.equal(h.itemLabel, "숨은 문장"); assert.equal(h.item, FIXTURE[3].sentences[2]);
  assert.ok(h.truth && h.where);
  assert.deepEqual(h.wrongTaps, [{ sentence: FIXTURE[3].sentences[0], reason: "날짜가 이상해요" }, { sentence: FIXTURE[3].sentences[1], reason: "몰라요" }]);
});

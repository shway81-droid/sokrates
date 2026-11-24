const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const G = load("core/guard.js");
const E = load("methods/elenchus.js");
const mini = require("./fixtures/topic-mini.js");

// 정해 둔 응답을 차례로 돌려주는 가짜 AI. Error 를 넣으면 throw 합니다.
function fakeLLM(responses) {
  const calls = [];
  return {
    calls,
    async call(req) {
      calls.push(req);
      const r = responses.shift();
      if (r === undefined) throw new Error("응답이 더 없음");
      if (r instanceof Error) throw r;
      return r;
    },
  };
}
const three = ["북한이 남침했다", "유엔군이 도와주었다", "전쟁은 1953년에 끝났다"];
const CHECK = { stage: "check", checks: ["ok", "ok", "think"], target: 2, mode: "counter", question: "1953년에 맺은 협정의 이름은 무엇이었나요?" };
const REASON = { stage: "check", checks: ["ok", "ok", "ok"], target: 0, mode: "reason", question: "왜 그렇게 되었을까요?" };
const Q = (q) => ({ stage: "question", question: q, verdict: "none", summary: [] });
const V = (v) => ({ stage: "verdict", question: "", verdict: v, summary: ["알게 된 것", "다시 생각한 것", "정전과 종전은 어떻게 다를까요?"] });
const make = (responses) => { const fake = fakeLLM(responses); return { fake, s: E.createSession({ topic: mini, textbookId: "a", llm: fake }) }; };

test("rejects blank items", async () => { const { s } = make([]); await assert.rejects(s.submitItems(["a", " ", "c"])); });
test("rejects fewer than three items", async () => { const { s } = make([]); await assert.rejects(s.submitItems(["a", "b"])); });
test("check result shown", async () => {
  const { s } = make([CHECK]);
  const st = await s.submitItems(three);
  assert.equal(st.phase, "asking"); assert.deepEqual(st.checks, CHECK.checks); assert.equal(st.target, 2);
  assert.equal(st.question, CHECK.question); assert.equal(st.maxQuestions, 3);
});
test("counter flow ends after 3 answers", async () => {
  const { fake, s } = make([CHECK, Q("정전은 끝낸 것일까요, 멈춘 것일까요?"), Q("휴전선은 왜 지금도 있을까요?"), V("revisit")]);
  await s.submitItems(three); await s.submitAnswer("1"); await s.submitAnswer("2");
  const st = await s.submitAnswer("3");
  assert.equal(st.phase, "done"); assert.equal(st.turns.length, 3); assert.equal(st.verdict, "revisit");
  assert.equal(fake.calls.at(-1).schema, E.SCHEMAS.verdict);
});
test("reason mode: a clear reason can be judged after one answer", async () => {
  const { fake, s } = make([REASON, V("strong")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("일본이 쳐들어와서 나라를 지키려고요");
  assert.equal(st.maxQuestions, 2); assert.equal(st.phase, "done"); assert.equal(st.verdict, "strong");
  assert.equal(fake.calls.at(-1).schema, E.SCHEMAS.next); // AI가 더 물을지 판정할지 고를 수 있었음
});
test("reason mode: a vague reason gets one follow-up, then a verdict", async () => {
  const { fake, s } = make([REASON, Q("무엇으로부터 나라를 구하려 했을까요?"), V("strong")]);
  await s.submitItems(three);
  let st = await s.submitAnswer("나라를 구하기 위해서");
  assert.equal(st.phase, "asking"); assert.equal(st.question, "무엇으로부터 나라를 구하려 했을까요?");
  st = await s.submitAnswer("일본이 쳐들어와서요");
  assert.equal(st.phase, "done"); assert.equal(st.turns.length, 2); assert.equal(st.verdict, "strong");
  assert.equal(fake.calls.at(-1).schema, E.SCHEMAS.verdict); // 두 번째 답 뒤에는 반드시 판정
});
test("prompt: reason without a textbook cause gets a follow-up, not the answer", () => {
  const rule = E.SYSTEM_PROMPT.split(/\r?\n/).find((l) => l.includes('mode "reason"') && l.includes("한 번 더"));
  assert.ok(rule && rule.includes("근거") && rule.includes("정답"), "이유 묻기 후속 질문 규칙이 없음");
});
test("early verdict accepted", async () => {
  const { s } = make([CHECK, V("revisit")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("아, 멈춘 거네요");
  assert.equal(st.verdict, "revisit"); assert.equal(st.turns.length, 1); assert.equal(st.phase, "done");
});
test("guard fail retries once then default question", async () => {
  const bad = { ...CHECK, question: "가".repeat(60) + "?" };
  const { fake, s } = make([bad, bad]);
  const st = await s.submitItems(three);
  assert.equal(st.question, G.DEFAULT_QUESTION); assert.equal(fake.calls.length, 2);
  assert.deepEqual(st.checks, ["think", "think", "think"]); assert.equal(st.mode, "counter");
});
test("guard fail then success uses second", async () => {
  const bad = { ...CHECK, question: "정답은 정전 협정이에요." };
  const { s } = make([bad, CHECK]);
  const st = await s.submitItems(three);
  assert.equal(st.question, CHECK.question);
});
test("guard fail on verdict falls back to hold", async () => {
  const badV = { stage: "verdict", question: "", verdict: "strong", summary: ["하나", "둘"] };
  const { s } = make([REASON, Q("무엇 때문이었을까요?"), badV, badV]);
  await s.submitItems(three);
  await s.submitAnswer("이유");
  const st = await s.submitAnswer("근거"); // 이유 묻기는 두 번째 답 뒤에 반드시 판정합니다
  assert.equal(st.verdict, "hold"); assert.deepEqual(st.summary, G.DEFAULT_SUMMARY);
});
test("finishNow goes to verdict", async () => {
  const { fake, s } = make([CHECK, V("hold")]);
  await s.submitItems(three);
  const st = await s.finishNow();
  assert.equal(st.phase, "done"); assert.equal(fake.calls.at(-1).schema, E.SCHEMAS.verdict);
});
test("llm error keeps input", async () => {
  const { s } = make([new Error("401")]);
  const st = await s.submitItems(three);
  assert.equal(st.phase, "error"); assert.deepEqual(st.items, three);
  assert.equal(st.error, "AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요.");
});
test("retry after error repeats the call", async () => {
  const { s } = make([new Error("network"), CHECK]);
  await s.submitItems(three);
  const st = await s.retry();
  assert.equal(st.phase, "asking"); assert.equal(st.question, CHECK.question);
});
test("ignores answer while pending", async () => {
  const { s } = make([CHECK, Q("정전은 끝낸 것일까요, 멈춘 것일까요?")]);
  await s.submitItems(three);
  const p1 = s.submitAnswer("a");
  const st2 = await s.submitAnswer("b");
  assert.equal(st2.phase, "waiting");
  await p1;
  assert.equal(s.getState().turns.length, 1);
});
test("cancelled session ignores late result", async () => {
  const { s } = make([CHECK]);
  const p = s.submitItems(three);
  s.cancel();
  await p;
  assert.equal(s.getState().phase, "input");
});
test("prompt carries scope and items", async () => {
  const { fake, s } = make([CHECK]);
  await s.submitItems(three);
  const req = fake.calls[0];
  assert.equal(req.system, E.SYSTEM_PROMPT);
  assert.equal(req.messages.length, 1); assert.equal(req.messages[0].role, "user");
  assert.ok(req.messages[0].content.includes("[반례에 쓸 수 있는 범위: 교과서A]"));
  assert.ok(req.messages[0].content.includes(three[2]));
});
test("later prompt carries turns", async () => {
  const { fake, s } = make([CHECK, Q("정전은 끝낸 것일까요, 멈춘 것일까요?")]);
  await s.submitItems(three); await s.submitAnswer("정전 협정이요");
  assert.ok(fake.calls[1].messages[0].content.includes("정전 협정이요"));
  assert.equal(fake.calls[1].schema, E.SCHEMAS.next);
});
test("state is a copy", async () => {
  const { s } = make([CHECK]);
  const st = await s.submitItems(three);
  st.items.push("x");
  assert.equal(s.getState().items.length, 3);
});
test("fallbacks are counted so a live check can see them", async () => {
  const bad = { stage: "check", checks: ["ok"], target: 0, mode: "counter", question: "x" };
  const { s } = make([bad, bad, V("revisit")]);
  let st = await s.submitItems(three);
  assert.equal(st.fallbacks, 1);
  st = await s.finishNow();
  assert.equal(st.fallbacks, 1);
  const { s: s2 } = make([CHECK]);
  assert.equal((await s2.submitItems(three)).fallbacks, 0);
});
test("reason question must be answerable from the chosen textbook", () => {
  assert.ok(E.SYSTEM_PROMPT.includes("이유가 [반례에 쓸 수 있는 범위]에 나와 있는 항목"));
});
test("a student who revises the target idea is revisit, not strong", () => {
  assert.ok(E.SYSTEM_PROMPT.includes("처음 말한 대상 항목을 고쳐 말하면"));
});
test("check keeps the misconception id only when it is in the chosen textbook", async () => {
  const withId = (id) => ({ ...CHECK, misconception: id });
  for (const [id, want] of [["m1", "m1"], ["m3", null], ["none", null], [undefined, null]]) {
    const { s } = make([id === undefined ? CHECK : withId(id)]);
    assert.equal((await s.submitItems(three)).misconception, want, String(id));
  }
});
test("check schema asks for the misconception id", () => {
  assert.ok(E.SCHEMAS.check.required.includes("misconception"));
  assert.ok(E.SYSTEM_PROMPT.includes("misconception"));
});

// ---- 차시 범위 (주제 확장) ----
const unit = require("./fixtures/unit-mini.js");
const T = load("core/topic.js");
const merged = () => T.mergeTopics(structuredClone(unit), "작은 단원");
const makeL = (responses, lessonId) => { const fake = fakeLLM(responses); return { fake, s: E.createSession({ topic: merged(), textbookId: "a", lessonId, llm: fake }) }; };

test("prompt is not tied to 6·25", () => {
  assert.ok(!E.SYSTEM_PROMPT.includes("6·25와 관계없는"));
  assert.ok(!E.SYSTEM_PROMPT.includes("6·25와 관계있는"));
  assert.ok(E.SYSTEM_PROMPT.includes("오늘 주제와 관계없는"));
  assert.ok(E.SYSTEM_PROMPT.includes('"3-2.m01"'));
  assert.ok(!E.SYSTEM_PROMPT.includes('"m01"'), "옛 id 형식 예시가 남아 있음");
});
test("lesson goes into the message", async () => {
  const { fake, s } = makeL([{ ...CHECK, misconception: "u-2.m1" }, V("revisit")], "3-3");
  await s.submitItems(three);
  assert.ok(fake.calls[0].messages[0].content.includes("[오늘 차시: 교과서A 3단원 3~4차시 셋째 차시]"));
  assert.equal(s.getState().misconception, "u-2.m1");
});
test("misconception from a later lesson or old id form is dropped", async () => {
  for (const id of ["u-2.m2", "m01"]) {
    const { s } = makeL([{ ...CHECK, misconception: id }], "3-3");
    await s.submitItems(three);
    assert.equal(s.getState().misconception, null, id);
  }
});

// ---- 세 줄 정리 (차시별 테스트 2026-11-24) ----
test("retry tells the AI why the first answer was rejected", async () => {
  const bad = { stage: "verdict", question: "", verdict: "revisit", summary: ["a", "처음에는 끝났다고 생각했다", "정전과 종전은 어떻게 다를까요?"] };
  const { fake, s } = make([CHECK, bad, V("revisit")]);
  await s.submitItems(three);
  const st = await s.finishNow();
  assert.equal(st.verdict, "revisit"); assert.equal(st.fallbacks, 0);
  const second = fake.calls.at(-1).messages[0].content;
  assert.ok(second.includes("검사에 걸렸") && second.includes("고친 생각"), "다시 물을 때 까닭이 없음");
  assert.ok(!fake.calls.at(-2).messages[0].content.includes("검사에 걸렸"));
});
test("prompt: summary rules for each line", () => {
  const p = E.SYSTEM_PROMPT;
  assert.ok(p.includes("학생에게 보여 주는 글"), "3인칭 금지 규칙 없음");
  assert.ok(p.includes("알게 된 것") && p.includes("오개념은 적지 않습니다"), "첫째 줄 규칙 없음");
  assert.ok(p.includes("고친 생각 자체를"), "다시 볼 생각 둘째 줄 규칙 없음");
  assert.ok(p.includes("생각을 바꾸지 않았으면"), "보류 둘째 줄 규칙 없음");
});
test("a too-long question is retried with the same request (no nudge toward a verdict)", async () => {
  const longQ = Q("가".repeat(60) + "?");
  const { fake, s } = make([CHECK, longQ, Q("정전은 끝낸 것일까요, 멈춘 것일까요?")]);
  await s.submitItems(three);
  await s.submitAnswer("정전 협정이요");
  assert.equal(fake.calls[1].messages[0].content, fake.calls[2].messages[0].content);
});
test("summary retry asks to keep the verdict", async () => {
  const bad = { stage: "verdict", question: "", verdict: "revisit", summary: ["a", "b", "c"] };
  const { fake, s } = make([CHECK, bad, V("revisit")]);
  await s.submitItems(three);
  await s.finishNow();
  assert.ok(fake.calls.at(-1).messages[0].content.includes("판정은 그대로"));
});
test("prompt: a student who only insists is hold, not revisit or strong", () => {
  const rule = E.SYSTEM_PROMPT.split(/\r?\n/).find((l) => l.startsWith('- "hold"'));
  assert.ok(rule && rule.includes("끝까지 고집") && rule.includes("스스로 고쳐 말했을 때만"));
});

// ---- 교과서 원문으로 판단하기 (2026-11-24 설계: textbook-source) ----
test("today's textbook text goes into a cached system block", async () => {
  const fake = fakeLLM([CHECK]);
  const s = E.createSession({ topic: mini, textbookId: "a", llm: fake, sourceText: "=== p.130 ===\n수많은 사람이 죽거나 다쳤다." });
  await s.submitItems(three);
  const sys = fake.calls[0].system;
  assert.ok(Array.isArray(sys), "원문이 있으면 system이 블록 배열");
  assert.equal(sys[0].text, E.SYSTEM_PROMPT);
  assert.ok(sys[1].text.startsWith("[오늘 차시 교과서 원문]") && sys[1].text.includes("수많은 사람이 죽거나 다쳤다"));
  assert.deepEqual(sys[1].cache_control, { type: "ephemeral" });
});
test("blank textbook text keeps the plain system prompt", async () => {
  const fake = fakeLLM([CHECK]);
  const s = E.createSession({ topic: mini, textbookId: "a", llm: fake, sourceText: "  " });
  await s.submitItems(three);
  assert.equal(fake.calls[0].system, E.SYSTEM_PROMPT);
});
test("prompt: judge by the textbook text, and 'outside' only for unrelated talk", () => {
  const p = E.SYSTEM_PROMPT;
  assert.ok(p.includes("[오늘 차시 교과서 원문]"));
  assert.ok(p.includes('"unsure"'));
  assert.ok(p.includes("표현이 달라도"));
});
test("check schema and state accept unsure", async () => {
  assert.ok(E.SCHEMAS.check.properties.checks.items.enum.includes("unsure"));
  const { s } = make([{ ...CHECK, checks: ["ok", "unsure", "think"] }]);
  assert.deepEqual((await s.submitItems(three)).checks, ["ok", "unsure", "think"]);
});
test("prompt: 'think' only for a real misconception or a clear contradiction", () => {
  const line = E.SYSTEM_PROMPT.split(/\r?\n/).find((l) => l.trim().startsWith('"think"'));
  assert.ok(line && line.includes("분명히 어긋남") && line.includes("덜 자세하거나"));
  assert.ok(E.SYSTEM_PROMPT.includes("원문은 학생 말이 교과서에 있는지 찾는 데"));
});

test("think needs the misconception's wrong claim inside the student's own sentence", () => {
  const line = E.SYSTEM_PROMPT.split(/\r?\n/).find((l) => l.trim().startsWith('"think"'));
  assert.ok(line.includes("실제로 들어 있어야"), line);
});

test("summary rules ask for short lines and a real question on the third line", () => {
  const p = E.SYSTEM_PROMPT;
  assert.ok(p.includes("30자 안팎"));
  const third = p.split(/\r?\n/).find((l) => l.startsWith('- 셋째 줄'));
  assert.ok(third.includes("근거나 사실 문장으로 쓰지 않습니다"), third);
});

// 세 줄을 배열 자리로만 받으면 AI가 학생이 말한 3가지를 그대로 옮겨 적어 셋째 줄이 질문이 아니게 되는 일이 잦았습니다.
test("summary schema names each line so the third one is clearly the question", () => {
  for (const sch of [E.SCHEMAS.next, E.SCHEMAS.verdict]) {
    const s = sch.properties.summary;
    assert.equal(s.type, "object");
    assert.deepEqual(s.required, ["learned", "rethought", "nextQuestion"]);
    assert.ok(s.properties.nextQuestion.description.includes("물음표"));
  }
});

test("named summary from the AI becomes the three lines in order", async () => {
  const named = { stage: "verdict", question: "", verdict: "strong",
    summary: { learned: "북한이 남침했다", rethought: "정전 협정을 근거로 댔다", nextQuestion: "정전과 종전은 어떻게 다를까요?" } };
  const { s } = make([CHECK, named]);
  await s.submitItems(three);
  const st = await s.submitAnswer("정전 협정이에요");
  assert.equal(st.verdict, "strong");
  assert.deepEqual(st.summary, ["북한이 남침했다", "정전 협정을 근거로 댔다", "정전과 종전은 어떻게 다를까요?"]);
  assert.equal(st.fallbacks, 0);
});

test("summary rules say what the second line is after a retry with no counterexample", () => {
  const p = E.SYSTEM_PROMPT;
  assert.ok(p.includes("다시 말해 보게 하기(retry)로 끝난 판정 보류"));
  assert.ok(p.includes('"반례"'));
});

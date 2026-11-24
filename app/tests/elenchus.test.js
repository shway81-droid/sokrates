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
test("reason mode asks once", async () => {
  const { s } = make([REASON, V("strong")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("이유");
  assert.equal(st.maxQuestions, 1); assert.equal(st.phase, "done"); assert.equal(st.verdict, "strong");
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
  const { s } = make([REASON, badV, badV]);
  await s.submitItems(three);
  const st = await s.submitAnswer("이유");
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

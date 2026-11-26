// 아티팩트판 엘렌코스: 판단은 AI에게 맡기고, 코드는 질문 상한·화면용 칸 모양·오류 처리만 지킵니다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const E = load("artifact/elenchus.js");
const mini = require("./fixtures/topic-mini.js");

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
const SUM = { learned: "북한이 남침했고 유엔군이 도와주었다", rethought: "1953년에는 전쟁이 멈췄다", nextQuestion: "정전과 종전은 어떻게 다를까요?" };
const CHECK = { stage: "check", checks: ["ok", "ok", "think"], target: 2, mode: "counter", misconception: "none", question: "전쟁이 끝났다면 왜 지금도 휴전선이 있을까요?" };
const REASON = { ...CHECK, checks: ["ok", "ok", "ok"], target: 0, mode: "reason", question: "왜 그렇게 되었을까요?" };
const Q = (q) => ({ stage: "question", question: q, verdict: "none", summary: { learned: "", rethought: "", nextQuestion: "" } });
const V = (v, summary = SUM) => ({ stage: "verdict", question: "", verdict: v, summary });
const lastText = (fake) => fake.calls.at(-1).messages.at(-1).content;
const make = (responses) => { const fake = fakeLLM(responses); return { fake, s: E.createSession({ topic: mini, textbookId: "a", llm: fake }) }; };

test("same id and name as the web app method, so the screens register it the same way", () => {
  assert.equal(E.id, "elenchus");
  assert.equal(E.name, "엘렌코스 학습정리");
});

test("prompt keeps the principles and drops the Haiku-only examples list", () => {
  assert.match(E.SYSTEM_PROMPT, /정답|힌트/);
  assert.match(E.SYSTEM_PROMPT, /퀴즈/);
  assert.match(E.SYSTEM_PROMPT, /자료/);
  assert.ok(E.SYSTEM_PROMPT.length < 3400, `프롬프트가 ${E.SYSTEM_PROMPT.length}자`);
});

test("materials go to the AI: concepts, misconceptions and the student's items", async () => {
  const { fake, s } = make([CHECK]);
  await s.submitItems(three);
  const text = lastText(fake);
  assert.match(text, /\[전체 개념\]/);
  assert.match(text, /흔한 오개념/);
  assert.match(text, /전쟁은 1953년에 끝났다/);
});

test("check result is shown as the AI decided, even a long or plain question", async () => {
  const long = { ...CHECK, question: "전쟁이 정말 1953년에 완전히 끝났다면 지금 우리나라에 휴전선이 남아 있는 까닭은 무엇이라고 생각하나요?" };
  const { fake, s } = make([long]);
  const st = await s.submitItems(three);
  assert.equal(fake.calls.length, 1);
  assert.equal(st.phase, "asking");
  assert.equal(st.question, long.question);
  assert.deepEqual(st.checks, CHECK.checks);
  assert.equal(st.maxQuestions, 3);
});

test("reason mode gets two questions", async () => {
  const { s } = make([REASON]);
  assert.equal((await s.submitItems(three)).maxQuestions, 2);
});

test("the AI may judge early", async () => {
  const { s } = make([CHECK, V("revisit")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("아 싸움만 멈춘 거네요");
  assert.equal(st.phase, "done");
  assert.equal(st.verdict, "revisit");
  assert.deepEqual(st.summary, [SUM.learned, SUM.rethought, SUM.nextQuestion]);
});

test("question cap: the last answer asks for a verdict only", async () => {
  const { fake, s } = make([CHECK, Q("아직 나뉘어 있다면 끝난 걸까요?"), Q("싸움을 멈춘 것과 끝낸 것은 같을까요?"), V("revisit")]);
  await s.submitItems(three);
  await s.submitAnswer("1"); await s.submitAnswer("2");
  const st = await s.submitAnswer("3");
  assert.equal(st.phase, "done");
  assert.deepEqual(fake.calls.at(-1).schema.properties.stage.enum, ["verdict"]);
  assert.match(lastText(fake), /질문1: 전쟁이 끝났다면/);
});

test("remaining question count is told to the AI", async () => {
  const { fake, s } = make([CHECK, Q("아직 나뉘어 있다면 끝난 걸까요?")]);
  await s.submitItems(three);
  await s.submitAnswer("나뉘어 있어서요");
  assert.match(lastText(fake), /남은 질문은 2번/);
});

test("finish now asks for a verdict", async () => {
  const { s } = make([CHECK, V("hold")]);
  await s.submitItems(three);
  assert.equal((await s.finishNow()).verdict, "hold");
});

test("a broken shape is asked again once with the reason, then the class goes on with defaults", async () => {
  const bad = { ...CHECK, checks: ["ok", "think"] };
  const { fake, s } = make([bad, CHECK]);
  const st = await s.submitItems(three);
  assert.equal(st.question, CHECK.question);
  assert.match(lastText(fake), /checks/);

  const two = make([bad, bad]);
  const st2 = await two.s.submitItems(three);
  assert.equal(st2.phase, "asking");
  assert.equal(st2.question, "왜 그렇게 생각했나요?");
});

test("an empty question is a broken shape", async () => {
  const { fake, s } = make([CHECK, Q(""), Q("싸움을 멈춘 것과 끝낸 것은 같을까요?")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("1");
  assert.equal(fake.calls.length, 3);
  assert.equal(st.question, "싸움을 멈춘 것과 끝낸 것은 같을까요?");
});

test("misconception id outside the chosen textbook scope is dropped", async () => {
  const { s } = make([{ ...CHECK, misconception: "x.m99" }]);
  assert.equal((await s.submitItems(three)).misconception, null);
});

test("AI error shows the error screen and retry repeats the step", async () => {
  const { s } = make([new Error("끊김"), CHECK]);
  const st = await s.submitItems(three);
  assert.equal(st.phase, "error");
  assert.equal((await s.retry()).phase, "asking");
});

test("cancel drops a late answer", async () => {
  let release;
  const slow = { calls: [], call: () => new Promise((r) => { release = () => r(CHECK); }) };
  const s = E.createSession({ topic: mini, textbookId: "a", llm: slow });
  const p = s.submitItems(three);
  s.cancel();
  release();
  await p;
  assert.equal(s.getState().phase, "input");
});

// ---- 28개 사례 점검(2026-11-26)에서 나온 약점: 한 번만 다시 받고, 그래도 남으면 AI 답을 그대로 씁니다 ----
const askedAgain = (fake, re) => { assert.equal(fake.calls.length, 2); assert.match(lastText(fake), re); };

test("a choice question is asked again once", async () => {
  const { fake, s } = make([{ ...CHECK, question: "중국군이 온 뒤 국군은 앞으로 갔을까요, 물러났을까요?" }, CHECK]);
  const st = await s.submitItems(three);
  askedAgain(fake, /고르게/);
  assert.equal(st.question, CHECK.question);
});

test("a quiz question about a place, month or date is asked again once", async () => {
  for (const q of ["이봉창이 노린 일본 왕의 마차는 어느 도시에 있었을까요?", "3·1 운동은 몇 월에 일어났다고 배웠나요?", "이봉창은 어디서 던졌을까요?"]) {
    const { fake } = make([{ ...CHECK, question: q }, CHECK]);
    const s = E.createSession({ topic: mini, textbookId: "a", llm: fake });
    await s.submitItems(three);
    askedAgain(fake, /퀴즈/);
  }
});

test("a question that points at the first answer is asked again once", async () => {
  const { fake, s } = make([CHECK, Q("여러 나라가 보냈다면, 처음에 한 말은 그대로 맞을까요?"), Q("여러 나라가 보냈다면 미국 군대 하나뿐이었을까요?")]);
  await s.submitItems(three);
  const st = await s.submitAnswer("여러 나라가 보냈어요");
  askedAgain({ calls: fake.calls.slice(1) }, /처음/);
  assert.equal(st.question, "여러 나라가 보냈다면 미국 군대 하나뿐이었을까요?");
});

test("counter on an item that is not think is asked again once", async () => {
  const { fake, s } = make([{ ...CHECK, checks: ["unsure", "unsure", "outside"], target: 0 }, { ...CHECK, checks: ["unsure", "unsure", "outside"], target: 2, mode: "retry", question: "오늘 배운 것을 하나 더 말해 볼까요?" }]);
  const st = await s.submitItems(three);
  askedAgain(fake, /counter/);
  assert.equal(st.mode, "retry");
});

test("a long summary line or one ending with a period is asked again once", async () => {
  const long = { ...SUM, learned: "인천 상륙 작전으로 서울을 되찾았지만, 중국군이 들어오자 1·4 후퇴로 서울을 또 빼앗겼다" };
  const dot = { ...SUM, rethought: "해산된 군인들이 의병에 들어가서 의병이 더 거세졌어요." };
  const noun = { ...SUM, learned: "광복의 까닭과 광복 뒤 한글 교과서로 배운 것" };
  for (const [bad, re] of [[long, /자/], [dot, /마침표/], [noun, /문장/]]) {
    const { fake, s } = make([CHECK, V("revisit", bad), V("revisit")]);
    await s.submitItems(three);
    const st = await s.submitAnswer("아 멈춘 거네요");
    askedAgain({ calls: fake.calls.slice(1) }, re);
    assert.deepEqual(st.summary, [SUM.learned, SUM.rethought, SUM.nextQuestion]);
  }
});

test("an off-topic item is not copied into the summary", async () => {
  const joke = ["전쟁은 게임처럼 재미있다", "로봇이 싸웠다", "몰라요"];
  const OFF = { ...CHECK, checks: ["outside", "outside", "outside"], target: 0, mode: "retry", question: "오늘 배운 것을 하나 말해 볼까요?" };
  const copied = { learned: "오늘 배운 내용을 아직 말하지 못했어요", rethought: "전쟁은 게임처럼 재미있다고 생각했어요", nextQuestion: "전쟁 때 사람들은 어떻게 지냈을까요?" };
  const fixed = { ...copied, rethought: "오늘 배운 것을 다시 떠올려 보기로 했어요" };
  const { fake, s } = make([OFF, V("hold", copied), V("hold", fixed)]);
  await s.submitItems(joke);
  const st = await s.finishNow();
  askedAgain({ calls: fake.calls.slice(1) }, /관계없는/);
  assert.equal(st.summary[1], fixed.rethought);
});

test("if the second answer still has a wording problem, it is used as is (no default)", async () => {
  const choice = { ...CHECK, question: "먼저 세워졌을까요, 나중일까요?" };
  const { fake, s } = make([choice, choice]);
  const st = await s.submitItems(three);
  assert.equal(fake.calls.length, 2);
  assert.equal(st.question, choice.question);
  assert.equal(st.fallbacks, 0);
});

test("prompt spells out the new principles", () => {
  assert.match(E.SYSTEM_PROMPT, /31운동/);
  assert.match(E.SYSTEM_PROMPT, /처음 한 말/);
  assert.match(E.SYSTEM_PROMPT, /마침표/);
  assert.match(E.SYSTEM_PROMPT, /관계없는 말.*옮기지/);
  assert.doesNotMatch(E.SYSTEM_PROMPT, /learned "북한의 남침과 국제 연합군의 참전"/);
});

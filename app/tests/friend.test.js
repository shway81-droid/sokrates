const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const F = load("methods/friend.js");

// ---------- 응답 형식과 검사 ----------
const ASK = (o = {}) => ({ stage: "ask", mark: "none", kind: "meaning", misconception: "none", reaction: "", question: "정전이 뭐예요?", ...o });
const FIN = (o = {}) => ({ stage: "finish", mark: "none", thanks: "덕분에 휴전선이 왜 있는지 알았어요!", nextQuestion: "정전과 종전은 어떻게 다를까요?", ...o });
const expectAsk = (o = {}) => ({ stage: "ask", kinds: ["meaning", "more", "retry"], prevKind: null, scopeMisc: new Set(["m1", "m2"]), usedMisc: new Set(), asked: [], ...o });
const expectFin = (o = {}) => ({ stage: "finish", prevKind: null, ...o });
const bad = (out, expect, clue) => {
  const v = F.validateFriendStep(out, expect);
  assert.equal(v.ok, false, `통과하면 안 됨: ${JSON.stringify(out)}`);
  if (clue) assert.match(v.reason, clue);
};
const good = (out, expect) => assert.deepEqual(F.validateFriendStep(out, expect), { ok: true });
const chars = (n) => "가".repeat(n);

test("marksFor pairs marks with question kinds", () => {
  assert.deepEqual(F.marksFor("mixup"), ["corrected", "together"]);
  assert.deepEqual(F.marksFor("meaning"), ["explained", "together"]);
  assert.deepEqual(F.marksFor("retry"), ["explained", "together"]);
});

test("schemaFor narrows kind and mark", () => {
  const s = F.schemaFor({ stage: "ask", kinds: ["mixup"], prevKind: "meaning" });
  assert.deepEqual(s.properties.kind.enum, ["mixup"]);
  assert.deepEqual(s.properties.mark.enum, ["explained", "together"]);
  assert.deepEqual(s.properties.stage.enum, ["ask"]);
  assert.equal(s.additionalProperties, false);
  assert.deepEqual([...s.required].sort(), ["kind", "mark", "misconception", "question", "reaction", "stage"]);
  assert.deepEqual(F.schemaFor({ stage: "ask", kinds: ["meaning"], prevKind: null }).properties.mark.enum, ["none"]);
  const f = F.schemaFor({ stage: "finish", prevKind: "mixup" });
  assert.deepEqual(f.properties.mark.enum, ["corrected", "together"]);
  assert.deepEqual([...f.required].sort(), ["mark", "nextQuestion", "stage", "thanks"]);
});

test("validate: a good ask and a good finish pass", () => {
  good(ASK(), expectAsk());
  good(ASK({ kind: "mixup", misconception: "m1", mark: "explained", question: "그럼 군인들만 다친 거예요?", reaction: "아, 그렇군요!" }),
    expectAsk({ kinds: ["mixup"], prevKind: "meaning" }));
  good(FIN(), expectFin());
  good(FIN({ mark: "corrected" }), expectFin({ prevKind: "mixup" }));
});

test("validate: kind must be one the code allowed", () => bad(ASK({ kind: "mixup", misconception: "m1" }), expectAsk(), /종류/));
test("validate: mark must pair with the previous question kind", () => {
  bad(ASK({ kind: "mixup", misconception: "m1", mark: "explained" }), expectAsk({ kinds: ["mixup"], prevKind: "mixup" }), /표시/);
  bad(ASK({ mark: "together" }), expectAsk(), /표시/); // 앞 질문이 없으면 none
  bad(FIN({ mark: "none" }), expectFin({ prevKind: "meaning" }), /표시/);
});
test("validate: mixup needs an in-scope misconception id", () => bad(ASK({ kind: "mixup", misconception: "m9" }), expectAsk({ kinds: ["mixup"] }), /오개념/));
test("validate: mixup cannot reuse a misconception", () =>
  bad(ASK({ kind: "mixup", misconception: "m1" }), expectAsk({ kinds: ["mixup"], usedMisc: new Set(["m1"]) }), /오개념/));
test("validate: impolite question", () => bad(ASK({ question: "정전이 뭐야?" }), expectAsk(), /존댓말/));
test("validate: 41-char question", () => bad(ASK({ question: chars(39) + "요?" }), expectAsk(), /40자/));
test("validate: 40-char question passes", () => good(ASK({ question: chars(38) + "요?" }), expectAsk()));
test("validate: repeated question (spacing ignored)", () => bad(ASK({ question: "정전이 뭐 예요?" }), expectAsk({ asked: ["정전이 뭐예요?"] }), /앞에서 한 질문/));
test("validate: 21-char reaction", () => bad(ASK({ reaction: chars(21) }), expectAsk(), /반응/));
test("validate: 20-char reaction passes", () => good(ASK({ reaction: chars(20) }), expectAsk()));
test("validate: reaction with a question mark", () => bad(ASK({ reaction: "그래요?" }), expectAsk(), /반응/));
test("validate: reaction that praises or confirms", () => {
  bad(ASK({ reaction: "맞아요!" }), expectAsk(), /반응/);
  bad(ASK({ reaction: "잘했어요" }), expectAsk(), /반응/);
});
test("validate: reaction with a forbidden word", () => bad(ASK({ reaction: "정답은 아니에요" }), expectAsk(), /반응/));
// 보완(11-25): 질문은 "~예요?" 존댓말인데 반응만 "아, 그렇구나!" 같은 반말 혼잣말이었습니다.
test("validate: casual-speech reaction", () => {
  for (const r of ["아, 그렇구나!", "신기하네!", "몰랐어.", "나도 그래", "음, 헷갈려", "그렇군", "재밌다!", "처음 알았는걸", "우리 동네랑 비슷해"])
    bad(ASK({ reaction: r }), expectAsk(), /반말/);
});
test("validate: polite reactions and interjections pass", () => {
  for (const r of ["아, 그렇군요!", "음, 헷갈려요.", "괜찮아요, 나도 잘 몰라요.", "몰랐어요!", "나도 궁금해요", "우와!", "아하!", "아, 몰랐습니다.", "오!", "네, 알겠어요.", ""])
    good(ASK({ reaction: r }), expectAsk());
});
test("validate: praise reason shows a polite example", () => {
  const v = F.validateFriendStep(ASK({ reaction: "맞아요!" }), expectAsk());
  assert.match(v.reason, /그렇군요/); assert.doesNotMatch(v.reason, /그렇구나/);
});
// "맞아"가 "총에 맞아서"(다치다)에도 걸려 바른 반응까지 막았습니다. 칭찬·맞장구일 때만 잡습니다.
test("PRAISE catches praise but not being hit", () => {
  for (const r of ["맞아요!", "맞아, 그거예요", "맞아!", "맞네요", "맞죠", "맞습니다", "잘했어요", "훌륭해요"]) assert.ok(F.PRAISE.test(r), r);
  for (const r of ["총에 맞아서 다쳤구나", "총에 맞아서 다쳤군요", "비를 맞아도 괜찮아요", "매를 맞았대요"]) assert.ok(!F.PRAISE.test(r), r);
  good(ASK({ reaction: "총에 맞아서 다쳤군요" }), expectAsk());
});
test("schema and prompt ask for a polite reaction", () => {
  assert.match(F.schemaFor({ stage: "ask", kinds: ["meaning"] }).properties.reaction.description, /존댓말/);
  assert.ok(F.SYSTEM_PROMPT.includes("아, 그렇군요!"));
  assert.ok(!/reaction "아, 그렇구나!"/.test(F.SYSTEM_PROMPT)); // 예시는 존댓말로
});
test("validate: empty thanks", () => bad(FIN({ thanks: " " }), expectFin(), /한마디/));
test("validate: 41-char thanks", () => bad(FIN({ thanks: chars(41) }), expectFin(), /한마디/));
test("validate: 40-char thanks passes", () => good(FIN({ thanks: chars(40) }), expectFin()));
test("validate: third-person thanks", () => bad(FIN({ thanks: "학생이 잘 설명했어요" }), expectFin(), /한마디/));
test("validate: next question must be a polite question", () => bad(FIN({ nextQuestion: "정전과 종전은 다르다." }), expectFin(), /다음 시간/));
test("validate: wrong stage", () => bad(FIN(), expectAsk(), /단계/));
// 실제 점검(하이쿠)에서 "정전 협정으로 전쟁은 끝났을까요, 잠시 멈춘 걸까요?"가 나왔습니다. 고르게 하면 답을 알려 주는 셈입니다.
test("validate: two-way choice next question", () =>
  bad(FIN({ nextQuestion: "전쟁은 끝났을까요, 잠시 멈춘 걸까요?" }), expectFin(), /고르게/));
test("validate: two-way choice question", () =>
  bad(ASK({ question: "군인만 다쳤어요, 보통 사람도 다쳤어요?" }), expectAsk(), /고르게/));
test("validate: a comma that is not a choice passes", () =>
  good(ASK({ question: "그럼 피란 간 사람들은, 어디서 살았어요?" }), expectAsk()));
// 전체 검토에서 찾음: 이어 주는 말 뒤 쉼표는 고르기가 아니고, "~일까, ~일까요?"와 쉼표 없는 고르기는 고르기입니다.
test("validate: connective '~요,' openings are single questions", () => {
  for (const q of ["있잖아요, 휴전선은 왜 생겼어요?", "그런데요, 왜 피란을 갔어요?", "군인이 왔는데요, 사람들은 어떻게 했어요?", "왜 정부가 필요, 그 까닭이 뭐예요?"])
    good(ASK({ question: q }), expectAsk());
});
test("validate: other two-way choice shapes", () => {
  for (const q of ["북한일까, 남한일까요?", "북한이 먼저일까요 남한이 먼저일까요?"])
    bad(ASK({ question: q }), expectAsk(), /고르게/);
});

// ---------- 세션(문답 흐름) ----------
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
      return JSON.parse(JSON.stringify(r));
    },
  };
}
const make = (responses, opts = {}) => {
  const fake = fakeLLM(responses);
  return { fake, s: F.createSession({ topic: mini, textbookId: "a", llm: fake, ...opts }) };
};
const EXPLAIN = "북한이 쳐들어와서 전쟁이 났고 많은 사람이 다쳤어요.";
const msgText = (req) => req.messages[0].content.map((b) => b.text).join("\n");
// 학생마다 바뀌는 둘째 블록만 봅니다(첫 블록인 단원 맥락에는 모든 오개념의 바른 생각이 들어 있음).
const noteText = (req) => req.messages[0].content.slice(-1)[0].text;
const Q1 = ASK({ kind: "meaning", question: "다쳤다는 게 누가 다친 거예요?" });
const Q2 = (mark = "explained") => ASK({ kind: "mixup", misconception: "m1", mark, reaction: "아, 그렇군요!", question: "그럼 군인들만 다친 거예요?" });
const Q3 = (mark = "corrected") => ASK({ kind: "meaning", mark, question: "왜 마을 사람들도 다쳤어요?" });

test("rejects blank explanation", async () => { const { s } = make([]); await assert.rejects(s.submitExplanation("  ")); });

test("full flow: three questions, marks, then the result", async () => {
  const { fake, s } = make([Q1, Q2(), Q3(), FIN({ mark: "together" })]);
  let st = await s.submitExplanation(EXPLAIN);
  assert.equal(st.phase, "asking"); assert.equal(st.question, Q1.question); assert.equal(st.kind, "meaning");
  st = await s.submitAnswer("군인도 다치고 보통 사람도 다쳤어요.");
  assert.equal(st.question, "그럼 군인들만 다친 거예요?"); assert.equal(st.reaction, "아, 그렇군요!"); assert.equal(st.misconception, "m1");
  st = await s.submitAnswer("아니에요, 마을에서도 싸워서 보통 사람도 다쳤어요.");
  st = await s.submitAnswer("몰라요.");
  assert.equal(st.phase, "done");
  assert.deepEqual(st.turns.map((t) => t.mark), ["explained", "corrected", "together"]);
  assert.deepEqual(st.turns.map((t) => t.kind), ["meaning", "mixup", "meaning"]);
  assert.equal(st.turns[1].misconception, "m1");
  assert.equal(st.thanks, FIN().thanks); assert.equal(st.nextQuestion, FIN().nextQuestion);
  assert.equal(fake.calls.length, 4); assert.equal(st.fallbacks, 0);
});

test("call schemas: the code narrows question kinds and marks", async () => {
  const { fake, s } = make([Q1, Q2(), Q3(), FIN({ mark: "explained" })]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("2"); await s.submitAnswer("3");
  const kinds = fake.calls.slice(0, 3).map((c) => c.schema.properties.kind.enum);
  assert.deepEqual(kinds, [["meaning", "more", "retry"], ["mixup"], ["meaning", "mixup"]]);
  assert.deepEqual(fake.calls.map((c) => c.schema.properties.mark.enum),
    [["none"], ["explained", "together"], ["corrected", "together"], ["explained", "together"]]);
  assert.deepEqual(fake.calls[3].schema.properties.stage.enum, ["finish"]);
});

// 보완 1: 학생이 친구의 틀린 생각에 맞장구치면(together), 그 바른 생각을 넣지 말라고 콕 집어 질문을 다시 받습니다.
// 실제 점검에서 "네"(의병이 약해졌다) 뒤에 "의병은 왜 군인이 들어오면 더 거세졌어요?"가 두 번 나왔습니다.
test("after agreeing with a mixup, the next question is asked again with the truth named", async () => {
  const leak = ASK({ kind: "meaning", mark: "together", question: "왜 바른 생각 하나가 되었어요?" });
  const again = ASK({ kind: "meaning", question: "그다음에는 어떻게 되었어요?", reaction: "음, 헷갈려요." });
  const { fake, s } = make([Q1, Q2(), leak, again]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1");
  const st = await s.submitAnswer("네, 그런 것 같아요.");
  assert.equal(fake.calls.length, 4);
  assert.equal(st.turns[1].mark, "together");
  assert.equal(st.question, again.question); assert.equal(st.reaction, "음, 헷갈려요."); assert.equal(st.fallbacks, 0);
  assert.deepEqual(fake.calls[3].schema.properties.mark.enum, ["none"]);
  const text = msgText(fake.calls[3]);
  const note = noteText(fake.calls[3]);
  assert.match(note, /\[주의\]/); assert.match(note, /바른 생각 하나/); assert.match(note, /m1/);
  assert.doesNotMatch(noteText(fake.calls[2]), /\[주의\]/);
});

test("after correcting a mixup, no extra call", async () => {
  const { fake, s } = make([Q1, Q2(), Q3("corrected")]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("아니에요, 보통 사람도 다쳤어요.");
  assert.equal(fake.calls.length, 3);
});

test("finish after agreeing with a mixup is asked again with the truth named", async () => {
  const Q3mix = ASK({ kind: "mixup", misconception: "m2", mark: "corrected", question: "그럼 둘 다 그런 거예요?" });
  const leakF = FIN({ mark: "together", thanks: "바른 생각 둘이라는 걸 알려 줄게요!" });
  const againF = FIN({ thanks: "우리 같이 더 알아봐요!" });
  const { fake, s } = make([Q1, Q2(), Q3mix, leakF, againF]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("아니에요, 보통 사람도 다쳤어요.");
  const st = await s.submitAnswer("네.");
  assert.equal(st.phase, "done"); assert.equal(fake.calls.length, 5);
  assert.equal(st.turns[2].mark, "together"); assert.equal(st.thanks, againF.thanks);
  assert.deepEqual(fake.calls[4].schema.properties.mark.enum, ["none"]);
  assert.match(noteText(fake.calls[4]), /\[주의\][^\n]*바른 생각 둘/);
});

// 실제 점검 4회차: 2번에서 맞장구친 학생에게 3번은 뜻 묻기였는데, 한마디가 그 바른 생각을 알려 줬습니다.
// 맞장구친 오개념은 그 뒤 모든 호출(끝맺음 포함)에 알려 줍니다.
test("an earlier agreed mixup is named in the finish call too", async () => {
  const meaningQ3 = ASK({ kind: "meaning", mark: "together", question: "그다음에는 어떻게 되었어요?" });
  const again = ASK({ kind: "meaning", question: "왜 그렇게 되었어요?" });
  const { fake, s } = make([Q1, Q2(), meaningQ3, again, FIN({ mark: "together" })]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("네.");
  const st = await s.submitAnswer("몰라요.");
  assert.equal(st.phase, "done"); assert.equal(fake.calls.length, 5);
  assert.match(noteText(fake.calls[4]), /\[주의\][^\n]*바른 생각 하나/);
});

// 보완 5: 기본 질문이 겹치지 않고, "몰라요"·아주 짧은 설명에는 "오늘 배운 것 하나만"을 씁니다.
test("default first question for '몰라요' is the retry one", async () => {
  const badQ = ASK({ question: "뭘 배웠어?" });
  const { s } = make([badQ, badQ]);
  const st = await s.submitExplanation("몰라요");
  assert.equal(st.kind, "retry"); assert.equal(st.question, F.DEFAULT_QUESTION.retry);
});

test("default questions never repeat", async () => {
  const badQ = (o) => ASK({ question: "뭘 배웠어?", ...o });
  const { s } = make([badQ(), badQ(), badQ({ mark: "explained", kind: "mixup", misconception: "m1" }), badQ({ mark: "explained", kind: "mixup", misconception: "m1" }),
    badQ({ mark: "explained" }), badQ({ mark: "explained" })]);
  let st = await s.submitExplanation(EXPLAIN);
  st = await s.submitAnswer("1"); st = await s.submitAnswer("2");
  const qs = [...st.turns.map((t) => t.q), st.question];
  assert.equal(new Set(qs).size, 3, qs.join(" / "));
  assert.equal(st.fallbacks, 3);
});

test("no misconception in scope: question 2 is meaning", async () => {
  const empty = { ...mini, misconceptions: [] };
  const { fake, s } = make([Q1, ASK({ mark: "explained", question: "그다음에는 어떻게 됐어요?" })], { topic: empty });
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1");
  assert.deepEqual(fake.calls[1].schema.properties.kind.enum, ["meaning"]);
});

test("used up misconceptions: question 3 drops mixup", async () => {
  const one = { ...mini, misconceptions: mini.misconceptions.filter((m) => m.id === "m1") };
  const { fake, s } = make([Q1, Q2(), Q3()], { topic: one });
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("2");
  assert.deepEqual(fake.calls[2].schema.properties.kind.enum, ["meaning"]);
});

test("finishNow with no answers: no marks, done", async () => {
  const { fake, s } = make([Q1, FIN()]);
  await s.submitExplanation(EXPLAIN);
  const st = await s.finishNow();
  assert.equal(st.phase, "done"); assert.equal(st.turns.length, 0);
  assert.deepEqual(fake.calls[1].schema.properties.mark.enum, ["none"]);
});

test("finishNow after one answer drops the unanswered question", async () => {
  const { s } = make([Q1, Q2(), FIN()]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1");
  const st = await s.finishNow();
  assert.equal(st.turns.length, 1); assert.equal(st.turns[0].mark, "explained");
  assert.equal(st.question, null);
});

test("retry on a bad question tells the reason", async () => {
  const { fake, s } = make([ASK({ question: "누가 다쳤어?" }), Q1]);
  const st = await s.submitExplanation(EXPLAIN);
  assert.equal(st.question, Q1.question); assert.equal(st.fallbacks, 0);
  assert.match(msgText(fake.calls[1]), /검사에 걸렸어요: 존댓말/);
});

// 질문이 검사에 걸려도 표시는 따로 맞을 수 있습니다. 맞게 답한 학생을 "함께 더 알아봐요"로 바꾸지 않습니다(전체 검토에서 찾음).
test("fallback after two bad questions: default question, a valid mark is kept", async () => {
  const badQ = (o) => ASK({ kind: "mixup", misconception: "m1", mark: "explained", question: "그럼 군인만 다쳤어?", ...o });
  const { s } = make([Q1, badQ(), badQ()]);
  await s.submitExplanation(EXPLAIN);
  const st = await s.submitAnswer("1");
  assert.equal(st.fallbacks, 1); assert.equal(st.kind, "meaning"); assert.equal(st.question, F.DEFAULT_QUESTION.meaning);
  assert.equal(st.misconception, null); assert.equal(st.reaction, ""); assert.equal(st.turns[0].mark, "explained");
});

test("fallback with a praising reaction keeps the valid mark", async () => {
  const praise = Q2("explained"); praise.reaction = "맞아요, 그렇군요!";
  const { s } = make([Q1, praise, praise]);
  await s.submitExplanation(EXPLAIN);
  const st = await s.submitAnswer("1");
  assert.equal(st.fallbacks, 1); assert.equal(st.turns[0].mark, "explained");
});

test("fallback with no valid mark at all: mark together", async () => {
  const badMark = (o) => ASK({ kind: "mixup", misconception: "m1", mark: "corrected", question: "그럼 군인들만 다친 거예요?", ...o });
  const { s } = make([Q1, badMark(), badMark()]);
  await s.submitExplanation(EXPLAIN);
  const st = await s.submitAnswer("1");
  assert.equal(st.fallbacks, 1); assert.equal(st.turns[0].mark, "together");
});

test("finish fallback after three bad finishes", async () => {
  const badF = FIN({ mark: "explained", thanks: "" });
  const { s } = make([Q1, Q2(), Q3(), badF, badF, badF]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("2");
  const st = await s.submitAnswer("3");
  assert.equal(st.phase, "done"); assert.equal(st.fallbacks, 1);
  assert.equal(st.thanks, F.DEFAULT_FINISH.thanks); assert.equal(st.nextQuestion, F.DEFAULT_FINISH.nextQuestion);
  assert.equal(st.turns[2].mark, "explained"); // 한마디만 걸렸고 표시는 맞았음
});

test("finish fallback with no valid mark: mark together", async () => {
  const badF = FIN({ mark: "corrected", thanks: "" });
  const { s } = make([Q1, Q2(), Q3(), badF, badF, badF]);
  await s.submitExplanation(EXPLAIN); await s.submitAnswer("1"); await s.submitAnswer("2");
  const st = await s.submitAnswer("3");
  assert.equal(st.turns[2].mark, "together");
});

test("out-of-scope misconception is asked again, not stored", async () => {
  const { s } = make([Q1, ASK({ kind: "mixup", misconception: "m3", mark: "explained", question: "그럼 군인들만 다친 거예요?" }), Q2()]);
  await s.submitExplanation(EXPLAIN);
  const st = await s.submitAnswer("1");
  assert.equal(st.misconception, "m1"); assert.equal(st.fallbacks, 0);
});

test("cancel drops a late response", async () => {
  let release;
  const llm = { call() { return new Promise((r) => { release = () => r(Q1); }); } };
  const s = F.createSession({ topic: mini, textbookId: "a", llm });
  const p = s.submitExplanation(EXPLAIN);
  s.cancel(); release();
  await p;
  assert.equal(s.getState().phase, "input"); assert.equal(s.getState().question, null);
});

test("error then retry", async () => {
  const { s } = make([new Error("network"), Q1]);
  let st = await s.submitExplanation(EXPLAIN);
  assert.equal(st.phase, "error"); assert.equal(st.error, F.ERROR_MESSAGE);
  st = await s.retry();
  assert.equal(st.phase, "asking"); assert.equal(st.question, Q1.question);
});

test("cache blocks: source text in system, unit context first in the message", async () => {
  const { fake, s } = make([Q1], { sourceText: "오늘 차시 원문" });
  await s.submitExplanation(EXPLAIN);
  const req = fake.calls[0];
  assert.equal(req.system.length, 2); assert.equal(req.system[0].text, F.SYSTEM_PROMPT);
  assert.deepEqual(req.system[1].cache_control, { type: "ephemeral" }); assert.match(req.system[1].text, /오늘 차시 원문/);
  const content = req.messages[0].content;
  assert.equal(content.length, 2);
  assert.deepEqual(content[0].cache_control, { type: "ephemeral" }); assert.match(content[0].text, /\[전체 개념\]/);
  assert.match(content[1].text, /\[학생의 설명\]/); assert.equal(content[1].cache_control, undefined);
});

test("no source text: system is the prompt string", async () => {
  const { fake, s } = make([Q1]);
  await s.submitExplanation(EXPLAIN);
  assert.equal(fake.calls[0].system, F.SYSTEM_PROMPT);
});

// ---------- 결과 글과 선생님 도움말 ----------
const turn = (o) => ({ q: "질문", kind: "meaning", misconception: null, reaction: "", a: "답", mark: "explained", ...o });
const doneState = (turns) => ({ phase: "done", explanation: EXPLAIN, turns, thanks: "덕분에 알았어요!", nextQuestion: "정전과 종전은 어떻게 다를까요?" });

test("resultText lists the explanation, marked answers and the two lines", () => {
  const st = doneState([turn({ q: "정전이 뭐예요?", a: "싸움을 멈춘 거예요." }), turn({ q: "그럼 군인만 다쳤어요?", kind: "mixup", misconception: "m1", a: "몰라요.", mark: "together" })]);
  const text = F.resultText({ topicTitle: "작은 주제", textbookName: "교과서A 1차시", dateStr: "2026-11-24", state: st });
  const lines = text.split("\n");
  assert.equal(lines[0], "[모르는 친구 학습정리] 작은 주제 · 교과서A 1차시 · 2026-11-24");
  assert.ok(lines.includes("나의 설명")); assert.ok(lines.includes(EXPLAIN));
  assert.ok(lines.includes("질문1: 정전이 뭐예요?")); assert.ok(lines.includes("답1: 싸움을 멈춘 거예요. (잘 설명했어요)"));
  assert.ok(lines.includes("답2: 몰라요. (함께 더 알아봐요)"));
  assert.ok(lines.includes("친구의 한마디: 덕분에 알았어요!")); assert.ok(lines.includes("다음 시간 확인할 것: 정전과 종전은 어떻게 다를까요?"));
});

test("friendHelp is null when nothing needs a second look", () => {
  assert.equal(F.friendHelp(mini, "a", doneState([turn(), turn({ kind: "mixup", misconception: "m1", mark: "corrected" })]), "3-1"), null);
});

test("friendHelp for a mixup question uses that misconception", () => {
  const h = F.friendHelp(mini, "a", doneState([turn({ q: "그럼 A에만 있어요?", kind: "mixup", misconception: "m1", mark: "together" })]), "3-1");
  assert.equal(h.sections.length, 1);
  assert.equal(h.sections[0].item, "그럼 A에만 있어요?"); assert.equal(h.sections[0].truth, "바른 생각 하나");
  assert.equal(h.sections[0].itemLabel, "살펴볼 질문"); // 이 방법에서는 친구의 질문이 들어갑니다(엘렌코스는 "살펴볼 생각")
  assert.deepEqual(h.sections[0].hints, ["힌트1"]);
});

test("friendHelp shows today's lesson only once", () => {
  const h = F.friendHelp(mini, "a", doneState([turn({ q: "첫 질문", mark: "together" }), turn({ q: "둘째 질문", mark: "together" })]), "3-1");
  assert.equal(h.sections.length, 2);
  assert.ok(h.sections[0].where); assert.ok(h.sections[0].notes.length > 0);
  assert.equal(h.sections[1].item, "둘째 질문"); assert.equal(h.sections[1].where, null); assert.deepEqual(h.sections[1].notes, []);
  assert.ok(h.sections.every((s) => s.itemLabel === "살펴볼 질문"));
});

test("prompt keeps the rules", () => {
  for (const w of ["정답", "퀴즈", "오늘 차시 교과서 원문", "전체 개념", "같은 뜻으로 인정할 말", "반응", "맞아요", "친구를 바로잡았어요", "요?"])
    assert.ok(F.SYSTEM_PROMPT.includes(w), w);
});

// 실제 점검(하이쿠)에서 맞장구친 학생에게 "우리 같이 더 알아봐요! 광주 학생 항일 운동은 여러 곳으로 퍼졌대요."가 나왔습니다.
test("prompt: thanks adds no correct fact, next question is no quiz or choice", () => {
  // 같은 점검 2회차: 학생이 "네"(의병이 약해졌다)라고 맞장구친 뒤 "의병은 왜 군인이 들어오면 더 거세졌어요?"가 나왔습니다.
  for (const w of ["바른 내용을 덧붙이지 않습니다", "퍼졌대요", "고르게 하는", "외운 이름", "맞장구친 오개념", "더 거세졌어요"])
    assert.ok(F.SYSTEM_PROMPT.includes(w), w);
});

// 보완 3·4: 장난에 맞장구치는 반응("재미있는 얘기네요!"), 학생이 말하지 않은 화제의 오개념(쌀·탑골 공원)이 점검에서 나왔습니다.
test("prompt: calm reaction to jokes, mixup only from what the student said", () => {
  for (const w of ["재미있는 얘기네요", "장난", "학생이 말하지 않은 화제", "쌀"])
    assert.ok(F.SYSTEM_PROMPT.includes(w), w);
});

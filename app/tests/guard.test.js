const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./load").load("core/guard.js");

test("counts by code point", () => assert.equal(G.charLen(" 정전😀 "), 3));
test("accepts short question", () => assert.ok(G.checkQuestion("정전은 전쟁을 끝낸 것일까요, 멈춘 것일까요?").ok));
test("accepts exactly 40 chars", () => assert.ok(G.checkQuestion("가".repeat(39) + "?").ok));
test("rejects 41 chars", () => assert.equal(G.checkQuestion("가".repeat(40) + "?").ok, false));
test("rejects two sentences", () => assert.equal(G.checkQuestion("맞아요. 왜 그럴까요?").ok, false));
test("rejects no question mark", () => assert.equal(G.checkQuestion("왜 그렇게 생각했나요").ok, false));
test("rejects forbidden word", () => assert.equal(G.checkQuestion("정답은 무엇일까요?").ok, false));
test("rejects non-string", () => assert.equal(G.checkQuestion(undefined).ok, false));
test("default question passes own check", () => assert.ok(G.checkQuestion(G.DEFAULT_QUESTION).ok));
test("check step valid", () => assert.ok(G.validateStep({stage:"check",checks:["ok","ok","think"],target:2,mode:"counter",question:"협정의 이름은 무엇이었나요?"},["check"]).ok));
test("check step bad checks value", () => assert.equal(G.validateStep({stage:"check",checks:["ok","bad","ok"],target:0,mode:"reason",question:"왜 그럴까요?"},["check"]).ok,false));
test("check step bad target", () => assert.equal(G.validateStep({stage:"check",checks:["ok","ok","ok"],target:3,mode:"reason",question:"왜 그럴까요?"},["check"]).ok,false));
test("check step outside allowed", () => assert.ok(G.validateStep({stage:"check",checks:["outside","outside","outside"],target:0,mode:"retry",question:"오늘 배운 것 중 하나를 말해 볼까요?"},["check"]).ok));
test("question step valid", () => assert.ok(G.validateStep({stage:"question",question:"왜 그럴까요?"},["question","verdict"]).ok));
test("stage not allowed", () => assert.equal(G.validateStep({stage:"verdict",verdict:"hold",summary:["a","b","c"]},["question"]).ok,false));
test("verdict needs 3 lines", () => assert.equal(G.validateStep({stage:"verdict",verdict:"strong",summary:["a","b"]},["verdict"]).ok,false));
test("verdict line over 40", () => assert.equal(G.validateStep({stage:"verdict",verdict:"strong",summary:["a","b","가".repeat(41)]},["verdict"]).ok,false));
test("verdict bad label", () => assert.equal(G.validateStep({stage:"verdict",verdict:"wrong",summary:["a","b","c"]},["verdict"]).ok,false));
test("verdict valid", () => assert.ok(G.validateStep({stage:"verdict",verdict:"revisit",summary:["알게 된 것","다시 생각한 것","정전과 종전은 어떻게 다를까요?"]},["verdict"]).ok));
test("default summary is valid verdict", () => assert.ok(G.validateStep({stage:"verdict",verdict:"hold",summary:G.DEFAULT_SUMMARY},["verdict"]).ok));
test("null object rejected", () => assert.equal(G.validateStep(null,["check"]).ok,false));

// 코드가 대상·방식의 짝을 검사합니다(맞는 항목에 반례를 던지지 않음, 교과서 밖 항목은 반례 대상이 아님).
const ck = (checks, target, mode) => G.validateStep({ stage: "check", checks, target, mode, question: "왜 그럴까요?" }, ["check"]).ok;
test("counter must target a think item", () => { assert.equal(ck(["ok", "ok", "think"], 0, "counter"), false); assert.equal(ck(["ok", "outside", "think"], 1, "counter"), false); assert.ok(ck(["ok", "ok", "think"], 2, "counter")); });
test("reason only when nothing to rethink", () => { assert.equal(ck(["ok", "think", "ok"], 0, "reason"), false); assert.ok(ck(["ok", "ok", "ok"], 0, "reason")); });
test("retry never targets an ok item", () => { assert.equal(ck(["ok", "think", "think"], 0, "retry"), false); assert.ok(ck(["outside", "outside", "outside"], 0, "retry")); assert.ok(ck(["ok", "think", "think"], 1, "retry")); });

// 세 줄 정리 모양 검사(차시별 테스트 2026-11-24에서 나온 문제)
const sv = (verdict, summary) => G.validateStep({ stage: "verdict", verdict, summary }, ["verdict"]);
const Q3 = "정전과 종전은 어떻게 다를까요?";
test("summary: third line must be a question", () => {
  assert.equal(sv("strong", ["의병이 일어났다", "나라를 지키려 했다", "1948년 정부 수립을 더 확인해 보기"]).ok, false);
});
test("summary: no field label inside a line", () => {
  assert.equal(sv("hold", ["a", "b", "다음 시간 확인할 것: 6·25 전쟁 때 무슨 일이 있었을까요?"]).ok, false);
  assert.equal(sv("hold", ["알게 된 것: 의병이 일어났다", "b", Q3]).ok, false);
});
test("summary: no third-person '학생이' at the start of a line", () => {
  assert.equal(sv("hold", ["학생이 오늘 주제와 관계없는 말을 했어요", "b", Q3]).ok, false);
  assert.equal(sv("hold", ["a", "학생은 게임 이야기만 했어요", Q3]).ok, false);
  assert.ok(sv("strong", ["학생들이 광주에서 시위를 벌였다", "b", Q3]).ok); // 내용으로 쓰인 '학생들'은 괜찮음
});
test("summary: revisit second line states the corrected idea, not the process", () => {
  for (const bad of ["처음에는 대통령을 뽑는 선거라고 생각했다", "처음에는 이봉창이라 생각했지만 다시 떠올려 고쳤다",
    "의병 운동이 약해졌다는 생각을 고쳐 보았다", "1948년 8월 15일을 광복 날로 생각했던 것을 고쳤다"])
    assert.equal(sv("revisit", ["a", bad, Q3]).ok, false, bad);
  assert.ok(sv("revisit", ["a", "5·10 총선거로는 국회의원을 뽑았다", Q3]).ok);
  assert.ok(sv("hold", ["a", "쌀이 늘어 살림이 넉넉했다고 생각했어요", Q3]).ok); // 보류에서는 학생 생각을 그대로 적을 수 있음
});
test("guard gives the reason so a retry can fix it", () => {
  assert.match(sv("strong", ["a", "b", "c"]).reason, /물음표/);
});

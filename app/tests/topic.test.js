const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("./load").load("core/topic.js");
const mini = require("./fixtures/topic-mini.js");

const clone = () => structuredClone(mini);
const withSource = (key) => { const t = clone(); t.concepts[0].sources[key] = { lesson: "3-1", page: "1" }; return t; };
const withDupId = () => { const t = clone(); t.concepts[1].id = "c1"; return t; };
const withOnlyOneMiscFor = (tb) => { const t = clone(); t.misconceptions = t.misconceptions.filter((m) => m.id !== "m3"); return t; };
const onlyAMiscWrong = mini.misconceptions[0].wrong;

test("valid mini topic", () => assert.deepEqual(T.validateTopic(mini), []));
test("unknown textbook key", () => assert.match(T.validateTopic(withSource("zzz")).join(), /zzz/));
test("duplicate id", () => assert.match(T.validateTopic(withDupId()).join(), /중복/));
test("textbook needs ≥2 misconceptions", () => assert.match(T.validateTopic(withOnlyOneMiscFor("b")).join(), /b/));
test("source needs lesson and page", () => { const t = clone(); delete t.concepts[0].sources.a.page; assert.match(T.validateTopic(t).join(), /c1/); });
test("misconception concept ref must exist", () => { const t = clone(); t.misconceptions[0].concepts = ["c9"]; assert.match(T.validateTopic(t).join(), /c9/); });
test("scope filters by textbook", () => assert.deepEqual(T.scopeFor(mini, "a").misconceptions.map((m) => m.id), ["m1", "m2"]));
test("scope filters concepts", () => assert.deepEqual(T.scopeFor(mini, "b").concepts.map((c) => c.id), ["c2", "c3"]));
test("unreviewed count", () => assert.equal(T.unreviewedCount(mini), 2));
test("context marks scope", () => {
  const c = T.buildContext(mini, "b");
  assert.ok(c.includes("[전체 개념]"));
  assert.ok(c.includes("[반례에 쓸 수 있는 범위: 교과서B]"));
  assert.ok(c.includes("[같은 뜻으로 인정할 말]"));
  assert.ok(c.includes("개념 하나"), "전체 개념에는 A 전용 개념도 들어감");
  assert.ok(!c.includes(onlyAMiscWrong), "B 범위에 A 전용 오개념이 없어야 함");
});
test("context unknown textbook throws", () => assert.throws(() => T.buildContext(mini, "zzz")));

// ---- 차시 범위 (주제 확장) ----
const unit = require("./fixtures/unit-mini.js");
const U = () => T.mergeTopics(structuredClone(unit), "작은 단원");

test("lesson objects required", () => { const t = clone(); t.textbooks[0].lessons = ["3단원 1차시"]; assert.match(T.validateTopic(t).join(), /lessons/); });
test("source lesson must be listed", () => { const t = clone(); t.concepts[0].sources.a.lesson = "3-9"; const e = T.validateTopic(t).join(); assert.match(e, /c1/); assert.match(e, /3-9/); });
test("merge keeps lesson order and all items", () => {
  const m = U();
  assert.equal(m.title, "작은 단원");
  assert.deepEqual(m.textbooks[0].lessons.map((l) => l.id), ["3-1", "3-2", "3-3", "3-5"]);
  assert.equal(m.misconceptions.length, 4);
  assert.deepEqual(T.validateTopic(m), []);
});
test("scope by lesson keeps taught lessons only", () => {
  assert.deepEqual(T.scopeFor(U(), "a", "3-3").misconceptions.map((m) => m.id), ["u-1.m1", "u-1.m2", "u-2.m1"]);
  assert.throws(() => T.scopeFor(U(), "a", "9-9"));
});
test("context: today first, earlier lessons next, later lessons out, all concepts for judging", () => {
  const c = T.buildContext(U(), "a", "3-3");
  assert.ok(c.includes("[오늘 차시: 교과서A 3단원 3~4차시 셋째 차시]"));
  assert.ok(c.includes("흔한 오개념(오늘 차시):"));
  assert.ok(c.includes("흔한 오개념(앞 차시):"));
  assert.ok(c.indexOf("셋째 차시 오개념") < c.indexOf("첫 차시 오개념"));
  assert.ok(!c.includes("다섯째 차시 오개념"));
  assert.ok(c.includes("u-2.c2"), "전체 개념에는 아직 안 배운 개념도 들어감");
});
test("context: no misconception today → all taught at one rank", () => {
  const m = U(); m.misconceptions = m.misconceptions.filter((x) => x.id !== "u-2.m1");
  const c = T.buildContext(m, "a", "3-3");
  assert.ok(!c.includes("(오늘 차시):") && c.includes("흔한 오개념:"));
  assert.ok(c.includes("첫 차시 오개념"));
});
test("context: nothing taught → 없음", () => {
  const m = U(); m.misconceptions = [];
  assert.ok(T.buildContext(m, "a", "3-1").includes("흔한 오개념: 없음"));
});
test("context without lesson keeps old shape", () => assert.ok(!T.buildContext(U(), "a").includes("[오늘 차시")));

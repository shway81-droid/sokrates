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

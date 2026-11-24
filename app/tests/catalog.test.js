const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const C = load("core/catalog.js");
const unitMini = require("./fixtures/unit-mini.js");

const topics = Object.fromEntries(structuredClone(unitMini).map((t) => [t.id, t]));
const units = [{ id: 3, title: "작은 단원", topics: ["u-1", "u-2", "u-9"],
  wrap: { a: { no: "6", title: "단원 마무리" }, b: { no: "2", title: "단원 마무리" } } }];
const t2Title = topics["u-2"].title;

test("only loaded topics", () => assert.deepEqual(C.availableUnits(units, topics)[0].topics, ["u-1", "u-2"]));
test("units without loaded topics are hidden", () => assert.equal(C.availableUnits([{ id: 1, title: "x", topics: ["z"], wrap: {} }], topics).length, 0));
test("choices in order with wrap last", () => {
  const ch = C.lessonChoices(C.availableUnits(units, topics)[0], topics, "a");
  assert.deepEqual(ch.map((c) => c.key), ["3-1", "3-2", "3-3", "3-5", "wrap"]);
  assert.equal(ch[2].label, "3~4차시 셋째 차시");
  assert.equal(ch[2].topicId, "u-2");
  assert.deepEqual(ch[4], { key: "wrap", label: "단원 마무리 (6차시)", lessonId: null, topicId: null });
});
test("resolve lesson", () => {
  const r = C.resolve(units, topics, { textbookId: "a", unitId: 3, key: "3-3" });
  assert.equal(r.contextTitle, t2Title);
  assert.equal(r.lessonLabel, "3~4차시");
  assert.equal(r.choice.lessonId, "3-3");
  assert.equal(r.topic.misconceptions.length, 4);
  assert.equal(r.topic.title, "작은 단원");
});
test("resolve wrap", () => {
  const r = C.resolve(units, topics, { textbookId: "a", unitId: 3, key: "wrap" });
  assert.equal(r.contextTitle, "작은 단원");
  assert.equal(r.lessonLabel, "단원 마무리");
  assert.equal(r.choice.lessonId, null);
});
test("stale saved values fall back to first", () => {
  const r = C.resolve(units, topics, { textbookId: "zzz", unitId: 9, key: "7-7" });
  assert.equal(r.textbookId, "a");
  assert.equal(r.unit.id, 3);
  assert.equal(r.choice.key, "3-1");
});
test("same lesson id in another textbook is re-resolved", () => {
  const r = C.resolve(units, topics, { textbookId: "b", unitId: 3, key: "3-3" });
  assert.equal(r.choice.key, "3-1");
  assert.equal(r.contextTitle, topics["u-1"].title);
  assert.deepEqual(C.lessonChoices(r.unit, topics, "b").map((c) => c.key), ["3-1", "wrap"]);
});
test("textbooks of a unit", () => assert.deepEqual(C.textbooksOf(C.availableUnits(units, topics)[0], topics).map((t) => t.id), ["a", "b"]));
test("lesson title is the learning problem shown at the top of the input screen", () => {
  assert.equal(C.resolve(units, topics, { textbookId: "a", unitId: 3, key: "3-3" }).lessonTitle, "셋째 차시");
  const w = [{ ...units[0], wrap: { a: { no: "6", title: "생각 그물을 완성해요" } } }];
  assert.equal(C.resolve(w, topics, { textbookId: "a", unitId: 3, key: "wrap" }).lessonTitle, "생각 그물을 완성해요");
});

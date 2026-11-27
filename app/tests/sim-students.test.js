// 가상 학생 100명(모델 비교용) 설정표가 학습 자료와 맞는지 봅니다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { students, LEVELS } = load("tests/sim-students.js");
const C = load("core/catalog.js");
const T = load("core/topic.js");
const UNITS = load("data/units.js");
const TOPICS = { "3-1": load("data/topic-3-1.js"), "3-2": load("data/topic-3-2.js") };

test("100 students with unique ids", () => {
  assert.equal(students.length, 100);
  assert.equal(new Set(students.map((s) => s.id)).size, 100);
});

test("levels: 상 20, 중 35, 하 35, 엉뚱 10", () => {
  const count = (lv) => students.filter((s) => s.level === lv).length;
  assert.deepEqual(LEVELS, ["상", "중", "하", "엉뚱"]);
  assert.deepEqual(LEVELS.map(count), [20, 35, 35, 10]);
});

test("every student has three short items, a mind and a stubbornness", () => {
  for (const s of students) {
    assert.equal(s.items.length, 3, s.id);
    for (const it of s.items) assert.ok(it.trim() && it.length <= 60, `${s.id}: ${it}`);
    assert.ok(s.mind && s.mind.length >= 8, s.id);
    assert.ok([0, 1, 2].includes(s.stubborn), s.id);
  }
});

test("lessons exist for the textbook and are spread over all three textbooks", () => {
  const unit = UNITS[0];
  for (const s of students) {
    const keys = C.lessonChoices(unit, TOPICS, s.textbookId).map((c) => c.key);
    assert.ok(keys.includes(s.key), `${s.id}: ${s.textbookId} ${s.key}`);
  }
  for (const tb of ["chunjae", "icecream", "visang"]) assert.ok(students.filter((s) => s.textbookId === tb).length >= 30, tb);
});

test("the misconception a student holds is one the AI can see for that lesson", () => {
  for (const s of students.filter((x) => x.miss)) {
    const sc = C.resolve(UNITS, TOPICS, { textbookId: s.textbookId, unitId: 3, key: s.key });
    const ids = T.scopeFor(sc.topic, sc.textbookId, sc.choice.lessonId).misconceptions.map((m) => m.id);
    assert.ok(ids.includes(s.miss), `${s.id}: ${s.miss}`);
  }
  assert.ok(students.filter((x) => x.miss).length >= 40);
});

test("split: 70 to tune, 30 to check, every level in both", () => {
  const tune = students.filter((s) => s.split === "tune"), check = students.filter((s) => s.split === "check");
  assert.equal(tune.length, 70);
  assert.equal(check.length, 30);
  for (const lv of LEVELS) {
    assert.ok(tune.some((s) => s.level === lv), lv);
    assert.ok(check.some((s) => s.level === lv), lv);
  }
});

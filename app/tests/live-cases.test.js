const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const { cases } = load("tests/live-cases.js");
const topic = load("data/topic-3-2.js");

test("live cases: PRD 예시 + 3세트 × 교과서 3종 = 10건", () => {
  assert.equal(cases.length, 10);
  assert.equal(cases[0].name, "PRD 예시");
  for (const id of ["chunjae", "icecream", "visang"]) assert.equal(cases.filter((c) => c.textbookId === id).length, id === "chunjae" ? 4 : 3);
});

test("live cases: 입력 3개, 답 1개 이상, 기대 판정이 올바름", () => {
  for (const c of cases) {
    assert.ok(topic.textbooks.some((t) => t.id === c.textbookId), `${c.name}: 없는 교과서`);
    assert.equal(c.items.length, 3, c.name);
    assert.ok(c.items.every((s) => typeof s === "string" && s.trim()), c.name);
    assert.ok(c.answers.length >= 1, c.name);
    assert.ok(["strong", "revisit", "hold"].includes(c.expect), c.name);
  }
  assert.deepEqual(cases.map((c) => c.expect).filter((v) => v === "revisit").length, 4);
});

test("live cases: 학생 이름 없음", () => {
  for (const c of cases) assert.ok(!/이름|name\s*:/.test(JSON.stringify(c.items)), c.name);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const { cases } = load("tests/live-cases.js");
const C = load("core/catalog.js");
const units = load("data/units.js");

// 브라우저의 SOKRATES_TOPICS 처럼 { 묶음 id: 묶음 } 맵을 만듭니다.
const DATA = path.join(__dirname, "..", "data");
const topics = {};
for (const f of fs.readdirSync(DATA).filter((f) => /^topic-\d+-\d+\.js$/.test(f))) {
  const t = require(path.join(DATA, f));
  topics[t.id] = t;
}
const TBS = ["chunjae", "icecream", "visang"];

test("live cases: 6·25 10건 + 3단원 새 사례 12건 + 원문 근거 2건 = 24건", () => {
  assert.equal(cases.length, 24);
  assert.equal(cases.filter((c) => c.group === "원문 근거").length, 2);
  assert.equal(cases[0].name, "PRD 예시");
  assert.equal(cases.filter((c) => c.group === "6·25").length, 10);
  const fresh = cases.filter((c) => c.group === "3단원 새 사례");
  assert.equal(fresh.length, 12);
  for (const id of TBS) assert.equal(fresh.filter((c) => c.textbookId === id).length, 4, id);
});

test("live cases: 차시 key가 그대로 풀립니다(없는 차시로 조용히 바뀌지 않음)", () => {
  for (const c of cases) {
    assert.equal(c.unitId, 3, c.name);
    const sc = C.resolve(units, topics, { textbookId: c.textbookId, unitId: c.unitId, key: c.key });
    assert.equal(sc.textbookId, c.textbookId, c.name);
    assert.equal(sc.choice.key, c.key, c.name);
  }
});

test("live cases: 6·25 사례는 그 교과서의 마지막 6·25 차시", () => {
  const last = { chunjae: "3-12", icecream: "3-12", visang: "3-11" };
  for (const c of cases.filter((c) => c.group === "6·25")) assert.equal(c.key, last[c.textbookId], c.name);
});

test("live cases: 새 사례는 3-1 하나 틀림·모두 맞음, 3-8 섞음, 단원 마무리", () => {
  for (const id of TBS) {
    const fresh = cases.filter((c) => c.group === "3단원 새 사례" && c.textbookId === id);
    const in31 = (c) => topics["3-1"].textbooks.find((t) => t.id === id).lessons.some((l) => l.id === c.key);
    assert.ok(fresh.some((c) => in31(c) && c.expect === "revisit" && c.expectMode === "counter"), `${id} 3-1 하나 틀림`);
    assert.ok(fresh.some((c) => in31(c) && c.expect === "strong" && c.expectMode === "reason"), `${id} 3-1 모두 맞음`);
    const mix = fresh.filter((c) => c.key === "3-8");
    assert.equal(mix.length, 1, `${id} 섞음`);
    assert.ok(Array.isArray(mix[0].expectOk) && mix[0].expectOk.length >= 1, `${id} 섞음 expectOk`);
    assert.ok(mix[0].expectOk.every((i) => Number.isInteger(i) && i >= 0 && i < 3), `${id} expectOk 범위`);
    assert.ok(fresh.some((c) => c.key === "wrap" && c.expect === "revisit"), `${id} 단원 마무리`);
  }
});

test("live cases: 입력 3개, 답 1개 이상, 기대 판정이 올바름", () => {
  for (const c of cases) {
    assert.ok(TBS.includes(c.textbookId), `${c.name}: 없는 교과서`);
    assert.equal(c.items.length, 3, c.name);
    assert.ok(c.items.every((s) => typeof s === "string" && s.trim()), c.name);
    assert.ok(c.answers.length >= 1, c.name);
    assert.ok(["strong", "revisit", "hold"].includes(c.expect), c.name);
  }
});

test("live cases: 학생 이름 없음", () => {
  for (const c of cases) assert.ok(!/이름|name\s*:/.test(JSON.stringify(c.items)), c.name);
});

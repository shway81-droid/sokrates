const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const { cases, CORRECT } = load("tests/live-friend-cases.js");
const C = load("core/catalog.js");
const units = load("data/units.js");

const DATA = path.join(__dirname, "..", "data");
const topics = {};
for (const f of fs.readdirSync(DATA).filter((f) => /^topic-\d+-\d+\.js$/.test(f))) {
  const t = require(path.join(DATA, f));
  topics[t.id] = t;
}
const allMisc = new Set(Object.values(topics).flatMap((t) => t.misconceptions.map((m) => m.id)));
const FIELDS = new Set(["name", "group", "textbookId", "unitId", "key", "explanation", "answers", "mixup", "byMisc", "expect"]);

test("friend live cases: 18건, 교과서마다 5건 이상", () => {
  assert.equal(cases.length, 18);
  for (const id of ["chunjae", "icecream", "visang"]) assert.ok(cases.filter((c) => c.textbookId === id).length >= 5, id);
});

test("friend live cases: 정해진 칸만 있음(학생 이름 칸 없음)", () => {
  for (const c of cases) for (const k of Object.keys(c)) assert.ok(FIELDS.has(k), `${c.name}: ${k}`);
});

test("friend live cases: 차시 key가 그대로 풀립니다", () => {
  for (const c of cases) {
    const sc = C.resolve(units, topics, { textbookId: c.textbookId, unitId: c.unitId, key: c.key });
    assert.equal(sc.textbookId, c.textbookId, c.name);
    assert.equal(sc.choice.key, c.key, c.name);
  }
});

test("friend live cases: 답은 비어 있지 않고, byMisc 의 id 는 데이터에 있음", () => {
  for (const c of cases) {
    assert.ok(c.explanation.trim() && c.mixup.trim(), c.name);
    assert.ok(c.answers.length > 0 && c.answers.every((a) => a.trim()), c.name);
    for (const id of Object.keys(c.byMisc || {})) assert.ok(allMisc.has(id), `${c.name}: ${id}`);
    assert.ok(c.expect && Object.keys(c.expect).length > 0, c.name);
  }
  for (const id of allMisc) assert.ok(CORRECT[id], `바로잡는 답이 없음: ${id}`);
});

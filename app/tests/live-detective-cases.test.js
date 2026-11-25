const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const { cases } = load("tests/live-detective-cases.js");
const C = load("core/catalog.js");
const D = load("methods/detective.js");
const units = load("data/units.js");

const DATA = path.join(__dirname, "..", "data");
const topics = {};
for (const f of fs.readdirSync(DATA).filter((f) => /^topic-\d+-\d+\.js$/.test(f))) {
  const t = require(path.join(DATA, f));
  topics[t.id] = t;
}
const problems = fs.readdirSync(DATA).filter((f) => /^detective-\d+-\d+\.js$/.test(f)).flatMap((f) => require(path.join(DATA, f)).problems);
const FIELDS = new Set(["name", "group", "textbookId", "unitId", "key", "problem", "taps", "wrongReasons", "reason", "answers", "expect"]);

test("detective live cases: 14~18건, 교과서마다 5건 이상", () => {
  assert.ok(cases.length >= 14 && cases.length <= 18, String(cases.length));
  for (const id of ["chunjae", "icecream", "visang"]) assert.ok(cases.filter((c) => c.textbookId === id).length >= 5, id);
});

test("detective live cases: 정해진 칸만 있음(학생 이름 칸 없음)", () => {
  for (const c of cases) for (const k of Object.keys(c)) assert.ok(FIELDS.has(k), `${c.name}: ${k}`);
});

test("detective live cases: 문제가 데이터에 있고 그 교과서·차시에서 낼 수 있음", () => {
  for (const c of cases) {
    const p = problems.find((x) => x.id === c.problem);
    assert.ok(p, `${c.name}: 문제 없음 ${c.problem}`);
    assert.ok(p.textbooks.includes(c.textbookId), `${c.name}: ${c.textbookId}에서 낼 수 없는 문제`);
    const sc = C.resolve(units, topics, { textbookId: c.textbookId, unitId: c.unitId, key: c.key });
    assert.equal(sc.choice.key, c.key, c.name);
    const picked = D.pickProblems({ problems: [p], topic: sc.topic, textbookId: c.textbookId, lessonId: sc.choice.lessonId, served: new Set(), random: () => 0 });
    assert.deepEqual(picked.map((x) => x.id), [p.id], `${c.name}: 범위 밖 문제`);
  }
});

test("detective live cases: 누르기와 답, 기대 표시", () => {
  for (const c of cases) {
    assert.ok(c.taps.length >= 1 && c.taps.every((t) => t === "wrong" || t === "hidden"), c.name);
    assert.ok(c.taps.filter((t) => t === "wrong").length <= D.MAX_WRONG, c.name);
    assert.equal((c.wrongReasons || []).length, c.taps.filter((t) => t === "wrong").length, c.name);
    if (c.taps.includes("hidden")) assert.ok(c.reason && c.reason.trim(), c.name);
    assert.ok((c.answers || []).every((a) => a.trim()), c.name);
    assert.ok(c.expect.mark.length > 0 && c.expect.mark.every((m) => D.MARK_TEXT[m]), c.name);
  }
});

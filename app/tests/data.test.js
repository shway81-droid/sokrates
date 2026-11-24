const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const T = load("core/topic.js");

// 묶음 데이터 파일(topic-{단원}-{소단원}.js)을 모두 검사합니다.
const DATA = path.join(__dirname, "..", "data");
const files = fs.readdirSync(DATA).filter((f) => /^topic-\d+-\d+\.js$/.test(f));
const topics = files.map((f) => require(path.join(DATA, f)));
const units = require(path.join(DATA, "units.js"));
const byId = (id) => topics.find((t) => t.id === id);

test("topic files exist", () => assert.ok(files.includes("topic-3-2.js") && !fs.existsSync(path.join(DATA, "topic-625.js"))));
for (const t of topics) {
  test(`${t.id}: valid`, () => assert.deepEqual(T.validateTopic(t), []));
  test(`${t.id}: ids carry topic prefix`, () => assert.ok([...t.concepts, ...t.misconceptions].every((x) => x.id.startsWith(`${t.id}.`))));
  test(`${t.id}: all reviewed`, () => assert.equal(T.unreviewedCount(t), 0));
  test(`${t.id}: every lesson has a concept`, () => {
    for (const tb of t.textbooks) for (const l of tb.lessons)
      assert.ok(t.concepts.some((c) => c.sources[tb.id] && c.sources[tb.id].lesson === l.id), `${tb.id} ${l.id}`);
  });
  test(`${t.id}: three textbooks`, () => assert.deepEqual(t.textbooks.map((x) => x.id), ["chunjae", "icecream", "visang"]));
}
test("units list topics in order", () => assert.deepEqual(units.find((u) => u.id === 3).topics, ["3-1", "3-2"]));

// 2026-11-24 교과서 원문 대조 검증을 마친 6·25 내용이 옮기면서 바뀌지 않았는지 확인합니다.
test("6·25 kept as verified", () => {
  const D = byId("3-2");
  const m = (id) => D.misconceptions.find((x) => x.id === `3-2.${id}`);
  const c = (id) => D.concepts.find((x) => x.id === `3-2.${id}`);
  assert.ok(/1953/.test(m("m01").wrong) && /정전/.test(m("m01").truth));
  assert.equal(c("c12").sources.chunjae.page, "151·152");
  assert.equal(m("m03").sources.visang.page, "141");
  assert.ok(!m("m06").counterHints.some((h) => h.includes("전쟁고아의 부모")));
  assert.ok(m("m05").sources.icecream && m("m05").sources.visang);
  assert.ok(D.synonyms.some((g) => g.includes("국제 연합군") && g.includes("유엔군")));
});
test("synonyms do not equate a country with its army or reuse WWII 연합군", () => {
  const D = byId("3-2");
  const army = D.synonyms.find((g) => g.includes("북한군"));
  assert.ok(!army.includes("북한"));
  assert.ok(!D.synonyms.some((g) => g.includes("연합군")));
});

// 교과서 원문(work/, git 제외)에 있는 25자 이상 연속 문자열을 그대로 옮기지 않았는지 검사합니다.
const WORK = path.join(__dirname, "..", "..", "work", "625");
test("no long verbatim", { skip: !fs.existsSync(WORK) && "work/625 없음" }, () => {
  const norm = (s) => s.replace(/\s+/g, "");
  const src = fs.readdirSync(WORK).filter((f) => f.endsWith(".txt"))
    .map((f) => norm(fs.readFileSync(path.join(WORK, f), "utf8"))).join("|");
  const N = 25;
  const texts = topics.flatMap((t) => [...t.concepts.map((c) => c.text), ...t.misconceptions.flatMap((m) => [m.wrong, m.truth])]);
  for (const t of texts) {
    const s = norm(t);
    for (let i = 0; i + N <= s.length; i++) assert.ok(!src.includes(s.slice(i, i + N)), `원문과 25자 이상 같음: ${t}`);
  }
});

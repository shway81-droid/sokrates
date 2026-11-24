const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load");
const T = load("core/topic.js");
const D = load("data/topic-625.js");

test("625 topic valid", () => assert.deepEqual(T.validateTopic(D), []));
test("three textbooks", () => assert.deepEqual(D.textbooks.map((t) => t.id), ["chunjae", "icecream", "visang"]));
test("concept count 15~25", () => assert.ok(D.concepts.length >= 15 && D.concepts.length <= 25, String(D.concepts.length)));
test("misconception count 6~10", () => assert.ok(D.misconceptions.length >= 6 && D.misconceptions.length <= 10, String(D.misconceptions.length)));
test("PRD example present", () => assert.ok(D.misconceptions.some((m) => /1953/.test(m.wrong) && /정전/.test(m.truth))));
test("synonym 국제 연합군", () => assert.ok(D.synonyms.some((g) => g.includes("국제 연합군") && g.includes("유엔군"))));
// 2026-11-24 교과서 원문 대조 검증 반영: m01만 선생님 판단을 기다립니다.
test("only m01 awaits the teacher after verification", () => {
  assert.equal(T.unreviewedCount(D), 1);
  assert.equal(D.misconceptions.find((m) => !m.reviewed).id, "m01");
});
test("synonyms do not equate a country with its army or reuse WWII 연합군", () => {
  const army = D.synonyms.find((g) => g.includes("북한군"));
  assert.ok(!army.includes("북한"));
  assert.ok(!D.synonyms.some((g) => g.includes("연합군")));
});
test("verified fixes: m06 hint, m05 sources, page numbers", () => {
  const m = (id) => D.misconceptions.find((x) => x.id === id);
  const c = (id) => D.concepts.find((x) => x.id === id);
  assert.ok(!m("m06").counterHints.some((h) => h.includes("전쟁고아의 부모")));
  assert.ok(m("m05").sources.icecream && m("m05").sources.visang);
  assert.equal(c("c12").sources.chunjae.page, "151·152");
  assert.equal(m("m03").sources.visang.page, "141");
});

// 교과서 원문(work/625, git 제외)에 있는 25자 이상 연속 문자열을 그대로 옮기지 않았는지 검사합니다.
const WORK = path.join(__dirname, "..", "..", "work", "625");
test("no long verbatim", { skip: !fs.existsSync(WORK) && "work/625 없음" }, () => {
  const norm = (s) => s.replace(/\s+/g, "");
  const src = fs.readdirSync(WORK).filter((f) => f.endsWith(".txt"))
    .map((f) => norm(fs.readFileSync(path.join(WORK, f), "utf8"))).join("|");
  const N = 25;
  const texts = [...D.concepts.map((c) => c.text), ...D.misconceptions.flatMap((m) => [m.wrong, m.truth])];
  for (const t of texts) {
    const s = norm(t);
    for (let i = 0; i + N <= s.length; i++) assert.ok(!src.includes(s.slice(i, i + N)), `원문과 25자 이상 같음: ${t}`);
  }
});

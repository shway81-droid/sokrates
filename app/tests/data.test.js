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
test("all misconceptions start unreviewed", () => assert.equal(T.unreviewedCount(D), D.misconceptions.length));

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

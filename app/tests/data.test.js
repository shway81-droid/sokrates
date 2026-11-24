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
// 반례 실마리는 AI가 쓸 반례 질문의 예이자 선생님 도움말의 "이어서 물어볼 것"입니다.
// 이름·숫자를 맞히는 퀴즈가 아니라, 학생 말을 따라가 생각해 보게 하는 짧은 질문으로 씁니다(엘렌코스, 2026-11-24).
const QUIZ = /이름은 무엇|이름이 무엇|무엇이라고 부를|부르는 말|몇 개|몇 나라|나라의 수|걸린 날|몇 년/;
for (const t of topics) {
  test(`${t.id}: counter hints are short questions, not quizzes`, () => {
    for (const m of t.misconceptions) {
      assert.ok(m.counterHints.length >= 2, `${m.id} 실마리가 2개보다 적음`);
      for (const h of m.counterHints) {
        assert.ok(h.endsWith("?"), `${m.id} 질문이 아님: ${h}`);
        assert.ok(Array.from(h).length <= 40, `${m.id} 40자를 넘음: ${h}`);
        assert.ok(!QUIZ.test(h), `${m.id} 퀴즈형: ${h}`);
      }
    }
  });
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

// 교과서 원문(work/{단원}/{교과서}/*.txt, git 제외)에 있는 25자 이상 연속 문자열을 그대로 옮기지 않았는지 검사합니다.
const WORK = path.join(__dirname, "..", "..", "work");
const unitDirs = fs.existsSync(WORK) ? fs.readdirSync(WORK).filter((d) => /^\d+$/.test(d)).map((d) => path.join(WORK, d)) : [];
test("no long verbatim", { skip: !unitDirs.length && "work/{단원} 없음" }, () => {
  const norm = (s) => s.replace(/\s+/g, "").replace(/䞲/g, "·"); // 비상 PDF는 가운뎃점을 U+47B2로 뽑습니다
  const txts = unitDirs.flatMap((u) => fs.readdirSync(u, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "png")
    .flatMap((d) => fs.readdirSync(path.join(u, d.name)).filter((f) => f.endsWith(".txt")).map((f) => path.join(u, d.name, f))));
  assert.ok(txts.length > 0, "원문 파일이 없음");
  const src = txts.map((f) => norm(fs.readFileSync(f, "utf8"))).join("|");
  const N = 25;
  const texts = topics.flatMap((t) => [...t.concepts.map((c) => c.text), ...t.misconceptions.flatMap((m) => [m.wrong, m.truth])]);
  for (const t of texts) {
    const s = norm(t);
    for (let i = 0; i + N <= s.length; i++) assert.ok(!src.includes(s.slice(i, i + N)), `원문과 25자 이상 같음: ${t}`);
  }
});

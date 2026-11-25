// 오답 탐정 문제 데이터(data/detective-*.js)를 검사합니다. 설계 9.4장.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DATA = path.join(__dirname, "..", "data");
const topics = ["topic-3-1.js", "topic-3-2.js"].map((f) => require(path.join(DATA, f)));
const miscById = new Map(topics.flatMap((t) => t.misconceptions.map((m) => [m.id, m])));
const files = fs.readdirSync(DATA).filter((f) => /^detective-\d+-\d+\.js$/.test(f));
const sets = files.map((f) => require(path.join(DATA, f)));
const problems = sets.flatMap((d) => d.problems);
const len = (s) => Array.from(String(s)).length;
const squash = (s) => String(s).replace(/\s+/g, "");
// data.test.js 와 같은 퀴즈 꼴(이름·숫자를 맞히게 하는 질문)
const QUIZ = /이름은 무엇|이름이 무엇|무엇이라고 부를|부르는 말|몇 개|몇 나라|나라의 수|걸린 날|몇 년/;

test("detective data files exist for 3-1 and 3-2", () => {
  assert.deepEqual(sets.map((d) => d.topic).sort(), ["3-1", "3-2"]);
});

test("each misconception has exactly 2 problems", () => {
  assert.equal(problems.length, 56);
  assert.equal(new Set(problems.map((p) => p.id)).size, problems.length, "id 겹침");
  for (const m of miscById.keys()) {
    const mine = problems.filter((p) => p.misconception === m);
    assert.deepEqual(mine.map((p) => p.id).sort(), [`${m}.a`, `${m}.b`], m);
  }
  for (const d of sets) for (const p of d.problems) assert.ok(p.misconception.startsWith(`${d.topic}.`), `${p.id} 묶음이 다름`);
});

test("textbooks are a non-empty subset of the misconception sources", () => {
  for (const p of problems) {
    const m = miscById.get(p.misconception);
    assert.ok(Array.isArray(p.textbooks) && p.textbooks.length > 0, `${p.id} 교과서 없음`);
    for (const tb of p.textbooks) assert.ok(m.sources[tb], `${p.id}: ${tb}에는 이 오개념이 없음`);
  }
});

test("four sentences within 40 chars, hidden in 0..3", () => {
  for (const p of problems) {
    assert.equal(p.sentences.length, 4, p.id);
    for (const s of p.sentences) {
      assert.ok(len(s) <= 40, `${p.id} 40자를 넘음: ${s}`);
      assert.ok(/요\.$/.test(s.trim()), `${p.id} "~요."로 끝나지 않음: ${s}`);
    }
    assert.ok(Number.isInteger(p.hidden) && p.hidden >= 0 && p.hidden <= 3, `${p.id} hidden`);
  }
});

test("hidden positions are spread", () => {
  for (let i = 0; i < 4; i++) {
    const n = problems.filter((p) => p.hidden === i).length;
    assert.ok(n >= 8, `숨은 위치 ${i}가 ${n}개뿐`);
  }
});

test("key within 40 chars; hints are short non-quiz questions", () => {
  for (const p of problems) {
    assert.ok(typeof p.key === "string" && p.key.trim() && len(p.key) <= 40, `${p.id} 핵심 생각`);
    assert.ok(Array.isArray(p.hints) && p.hints.length >= 2, `${p.id} 실마리가 2개보다 적음`);
    for (const h of p.hints) {
      assert.ok(h.endsWith("요?"), `${p.id} 존댓말 질문이 아님: ${h}`);
      assert.ok(len(h) <= 40, `${p.id} 40자를 넘음: ${h}`);
      assert.ok(!QUIZ.test(h), `${p.id} 퀴즈형: ${h}`);
    }
  }
});

test("leakWords present and absent from every sentence", () => {
  for (const p of problems) {
    assert.ok(Array.isArray(p.leakWords) && p.leakWords.length >= 1, `${p.id} 정답 낱말 없음`);
    for (const w of p.leakWords) for (const s of [...p.sentences, ...p.hints])
      assert.ok(!squash(s).includes(squash(w)), `${p.id} 문장·실마리에 정답 낱말 "${w}"이 있음: ${s}`);
  }
});

test("hints pass the session's fact-recall check (AI may copy them)", () => {
  const D = require(path.join(__dirname, "..", "methods", "detective.js"));
  for (const p of problems) for (const h of p.hints) assert.equal(D.isFactQuestion(h), false, `${p.id}: ${h}`);
  for (const p of problems) for (const h of p.hints) assert.equal(D.isLeading(h), false, `${p.id} (넌지시 알려 주는 꼴): ${h}`);
});

test("all reviewed", () => {
  assert.deepEqual(problems.filter((p) => p.reviewed !== true).map((p) => p.id), []);
});

// 교과서 원문(work/{단원}/{교과서}/*.txt, git 제외)에서 25자 이상 그대로 옮기지 않았는지 봅니다(data.test.js 와 같은 방법).
const WORK = path.join(__dirname, "..", "..", "work");
const unitDirs = fs.existsSync(WORK) ? fs.readdirSync(WORK).filter((d) => /^\d+$/.test(d)).map((d) => path.join(WORK, d)) : [];
test("no long verbatim", { skip: !unitDirs.length && "work/{단원} 없음" }, () => {
  const norm = (s) => s.replace(/\s+/g, "").replace(/䞲/g, "·");
  const txts = unitDirs.flatMap((u) => fs.readdirSync(u, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "png")
    .flatMap((d) => fs.readdirSync(path.join(u, d.name)).filter((f) => f.endsWith(".txt")).map((f) => path.join(u, d.name, f))));
  const src = txts.map((f) => norm(fs.readFileSync(f, "utf8"))).join("|");
  const N = 25;
  for (const p of problems) for (const t of [...p.sentences, p.key, ...p.hints]) {
    const s = norm(t);
    for (let i = 0; i + N <= s.length; i++) assert.ok(!src.includes(s.slice(i, i + N)), `원문과 25자 이상 같음: ${t}`);
  }
});

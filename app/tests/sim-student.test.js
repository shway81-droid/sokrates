// 학생 역할 AI: 설정표대로 한 번 답하게 하는 글을 만들고, 받은 답을 학생 말 한 줄로 다듬습니다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const S = load("tests/sim-student.js");
const { students } = load("tests/sim-students.js");

const low = students.find((s) => s.level === "하" && s.miss);
const turns = [{ q: "전쟁이 끝났다면 왜 휴전선이 있을까요?", a: "몰라요" }];

test("prompt carries the items, the mind, the level style, the history and the new question", () => {
  const p = S.studentPrompt(low, turns, "지금 북한에 마음대로 갈 수 있나요?");
  for (const it of low.items) assert.ok(p.includes(it), it);
  assert.ok(p.includes(low.mind));
  assert.match(p, /몰라요/);
  assert.match(p, /전쟁이 끝났다면 왜 휴전선이 있을까요\?/);
  assert.match(p, /지금 북한에 마음대로 갈 수 있나요\?/);
  assert.match(p, new RegExp(S.LEVEL_STYLE["하"].slice(0, 10)));
});

test("stubbornness changes the instructions", () => {
  const p0 = S.studentPrompt({ ...low, stubborn: 0 }, [], "왜요?");
  const p2 = S.studentPrompt({ ...low, stubborn: 2 }, [], "왜요?");
  assert.notEqual(p0, p2);
  assert.match(p2, /버팁니다/);
});

test("prompt tells the student not to know more than the mind says", () => {
  assert.match(S.studentPrompt(low, [], "왜요?"), /속마음.*더 많이 알지/);
});

test("clean answer keeps one short student line", () => {
  assert.equal(S.cleanAnswer('학생: "몰라요"'), "몰라요");
  assert.equal(S.cleanAnswer("  음... 군인이요\n\n(작게 말한다)  "), "음... 군인이요");
  assert.equal(S.cleanAnswer(""), "몰라요");
  assert.ok(S.cleanAnswer("가".repeat(300)).length <= 120);
});

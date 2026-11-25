const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load");
const U = load("core/ui.js");
const D = load("data/topic-3-2.js");

// helpFor: 항목 글 + 오개념 id + 오늘 차시로 선생님 도움말을 계산합니다(엘렌코스·모르는 친구가 함께 씀).
test("helpFor with a misconception id equals teacherHelp for the same item", () => {
  const viaState = U.teacherHelp(D, "chunjae", { verdict: "hold", items: ["x"], target: 0, misconception: "3-2.m01" });
  assert.deepEqual(U.helpFor(D, "chunjae", { item: "x", misconception: "3-2.m01", lessonId: null }), viaState);
  assert.ok(viaState.truth);
});

test("helpFor without misconception points to today's lesson", () => {
  const h = U.helpFor(D, "icecream", { item: "y", misconception: null, lessonId: "3-12" });
  assert.equal(h.item, "y");
  assert.equal(h.truth, null);
  assert.deepEqual(h.hints, []);
  assert.ok(h.where.includes("3단원"));
  assert.ok(h.notes.length > 0);
});

test("helpFor with unknown textbook is null", () => {
  assert.equal(U.helpFor(D, "nope", { item: "z", misconception: null, lessonId: null }), null);
});

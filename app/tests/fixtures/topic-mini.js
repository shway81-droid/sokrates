// 테스트용 작은 주제 데이터 (교과서 2종)
module.exports = {
  id: "mini",
  title: "작은 주제",
  grade: "5-2",
  subject: "사회",
  textbooks: [
    { id: "a", name: "교과서A", lessons: [{ id: "3-1", no: "1", title: "차시 하나", pages: "10~11" }] },
    { id: "b", name: "교과서B", lessons: [{ id: "3-2", no: "2", title: "차시 둘", pages: "20~21" }] },
  ],
  concepts: [
    { id: "c1", text: "개념 하나", sources: { a: { lesson: "3-1", page: "10" } } },
    { id: "c2", text: "개념 둘", sources: { a: { lesson: "3-1", page: "11" }, b: { lesson: "3-2", page: "20" } } },
    { id: "c3", text: "개념 셋", sources: { b: { lesson: "3-2", page: "21" } } },
  ],
  misconceptions: [
    { id: "m1", wrong: "A에만 있는 오개념", truth: "바른 생각 하나", counterHints: ["힌트1"], concepts: ["c1"],
      sources: { a: { lesson: "3-1", page: "10" } }, reviewed: true },
    { id: "m2", wrong: "둘 다 있는 오개념", truth: "바른 생각 둘", counterHints: ["힌트2"], concepts: ["c2"],
      sources: { a: { lesson: "3-1", page: "11" }, b: { lesson: "3-2", page: "20" } }, reviewed: false },
    { id: "m3", wrong: "B에만 있는 오개념", truth: "바른 생각 셋", counterHints: ["힌트3"], concepts: ["c3"],
      sources: { b: { lesson: "3-2", page: "21" } }, reviewed: false },
  ],
  synonyms: [["국제 연합군", "유엔군"]],
};

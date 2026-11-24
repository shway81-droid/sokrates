// 테스트용 작은 단원: 묶음 둘(u-1, u-2), 교과서 a는 두 묶음 모두, 교과서 b는 u-1에만 있습니다.
const src = (lesson, page) => ({ lesson, page });
const misc = (id, wrong, sources) => ({ id, wrong, truth: `${wrong}의 바른 생각`, counterHints: ["힌트"], concepts: [], sources, reviewed: true });

module.exports = [
  {
    id: "u-1", title: "첫 묶음", grade: "5-2", subject: "사회",
    textbooks: [
      { id: "a", name: "교과서A", lessons: [{ id: "3-1", no: "1", title: "첫 차시", pages: "1" }, { id: "3-2", no: "2", title: "둘째 차시", pages: "2" }] },
      { id: "b", name: "교과서B", lessons: [{ id: "3-1", no: "1", title: "B 첫 차시", pages: "1" }] },
    ],
    concepts: [
      { id: "u-1.c1", text: "첫 차시 개념", sources: { a: src("3-1", "1"), b: src("3-1", "1") } },
      { id: "u-1.c2", text: "둘째 차시 개념", sources: { a: src("3-2", "2") } },
    ],
    misconceptions: [
      misc("u-1.m1", "첫 차시 오개념", { a: src("3-1", "1"), b: src("3-1", "1") }),
      misc("u-1.m2", "둘째 차시 오개념", { a: src("3-2", "2"), b: src("3-1", "1") }),
    ],
    synonyms: [],
  },
  {
    id: "u-2", title: "둘째 묶음", grade: "5-2", subject: "사회",
    textbooks: [
      { id: "a", name: "교과서A", lessons: [{ id: "3-3", no: "3~4", title: "셋째 차시", pages: "3" }, { id: "3-5", no: "5", title: "다섯째 차시", pages: "5" }] },
    ],
    concepts: [
      { id: "u-2.c1", text: "셋째 차시 개념", sources: { a: src("3-3", "3") } },
      { id: "u-2.c2", text: "다섯째 차시 개념", sources: { a: src("3-5", "5") } },
    ],
    misconceptions: [
      misc("u-2.m1", "셋째 차시 오개념", { a: src("3-3", "3") }),
      misc("u-2.m2", "다섯째 차시 오개념", { a: src("3-5", "5") }),
    ],
    synonyms: [],
  },
];

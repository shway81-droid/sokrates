// 단원 정보: 시작 화면의 단원 목록과 단원 마무리 차시. 묶음(topics)은 진도표 순서입니다.
(function (root) {
  const units = [
    {
      id: 3,
      title: "식민 통치와 저항, 전쟁이 바꾼 사회와 생활",
      topics: ["3-1", "3-2"],
      wrap: {
        chunjae: { no: "14", title: "단원 마무리" },
        icecream: { no: "14", title: "생각 그물을 완성해요" },
        visang: { no: "13", title: "단원 마무리" },
      },
    },
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = units;
  else root.SOKRATES_UNITS = units;
})(this);

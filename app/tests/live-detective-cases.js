// 오답 탐정 실제 AI 점검에 쓰는 가상 학생들입니다. 학생 이름은 없습니다.
// problem: 낼 문제 id. taps: 누르는 차례("wrong"=맞는 문장을 이상하다고 누름, "hidden"=숨은 문장을 누름)
// wrongReasons: 맞는 문장을 눌렀을 때 쓰는 까닭(차례대로). reason: 숨은 문장을 눌렀을 때 쓰는 까닭.
// answers: 이어 묻는 질문에 차례로 넣는 답. 답이 떨어지면 [바로 정리하기]를 누른 것처럼 마무리합니다.
// expect.mark: 기대 표시(solved=까닭까지 밝힘, found=이상한 곳을 찾음, together=함께 더 알아봐요). 여러 개면 그중 하나면 됩니다.
(function (root) {
  const at = (textbookId, key, group) => ({ textbookId, unitId: 3, key, group });

  const cases = [
    // 바로 까닭을 말하는 학생
    { name: "천재 3-5 · 이봉창 장소를 바로 밝힘", ...at("chunjae", "3-5", "바로 까닭"), problem: "3-1.m08.a",
      taps: ["hidden"], wrongReasons: [], reason: "이봉창은 훙커우 공원이 아니라 도쿄에서 일본 왕에게 폭탄을 던졌어요", answers: [],
      expect: { mark: ["solved"] } },
    { name: "아이스크림 3-10 · 국제 연합군이 누구 편인지 바로 밝힘", ...at("icecream", "3-10", "바로 까닭"), problem: "3-2.m03.a",
      taps: ["hidden"], wrongReasons: [], reason: "국제 연합군은 북한 편이 아니라 남한을 도와주러 왔어요", answers: [],
      expect: { mark: ["solved"] } },
    { name: "비상 3-11 · 정전을 바로 밝힘", ...at("visang", "3-11", "바로 까닭"), problem: "3-2.m01.a",
      taps: ["hidden"], wrongReasons: [], reason: "1953년에는 정전 협정으로 잠시 멈춘 거예요", answers: [],
      expect: { mark: ["solved"] } },

    // "아니에요"처럼 부정만 하고, 질문을 받은 뒤 까닭을 말하는 학생
    { name: "천재 3-5 · 부정만 → 쌀을 가져간 것", ...at("chunjae", "3-5", "부정만 → 까닭"), problem: "3-1.m07.a",
      taps: ["hidden"], wrongReasons: [], reason: "아니에요", answers: ["일본이 쌀을 많이 가져가서 우리는 더 어려워졌어요"],
      expect: { mark: ["solved"] } },
    { name: "비상 3-10 · 이상하다고만 → 국회의원", ...at("visang", "3-10", "부정만 → 까닭"), problem: "3-2.m15.a",
      taps: ["hidden"], wrongReasons: [], reason: "이상해요", answers: ["국회의원을 뽑은 거예요"],
      expect: { mark: ["solved"] } },

    // 숨은 문장은 찾았지만 까닭은 끝까지 모르는 학생
    { name: "아이스크림 3-4 · 몰라요만 세 번", ...at("icecream", "3-4", "몰라요"), problem: "3-1.m06.a",
      taps: ["hidden"], wrongReasons: [], reason: "몰라요", answers: ["몰라요", "몰라요"],
      expect: { mark: ["found"] } },

    // 맞는 문장을 먼저 누르는 학생
    { name: "천재 3-12 · 맞는 문장 한 번 뒤 찾음", ...at("chunjae", "3-12", "맞는 문장 누름"), problem: "3-2.m06.a",
      taps: ["wrong", "hidden"], wrongReasons: ["집이 부서졌다는 게 이상해요"], reason: "군인 말고 보통 사람도 많이 죽었어요", answers: [],
      expect: { mark: ["solved"] } },
    { name: "비상 3-5 · 맞는 문장만 두 번", ...at("visang", "3-5", "맞는 문장 누름"), problem: "3-1.m06.b",
      taps: ["wrong", "wrong"], wrongReasons: ["몰라요", "이것도 이상해요"], reason: "", answers: [],
      expect: { mark: ["together"] } },

    // 숨은 문장 안에서 다른 부분을 이상하다고 보는 학생
    { name: "천재 3-11 · 날짜가 이상하다고 함", ...at("chunjae", "3-11", "다른 곳을 봄"), problem: "3-2.m02.a",
      taps: ["hidden"], wrongReasons: [], reason: "날짜가 이상해요", answers: ["모르겠어요", "북한군이 먼저 쳐들어왔어요"],
      expect: { mark: ["solved"] } },

    // 되묻는 학생
    { name: "아이스크림 3-12 · 왜 이상하냐고 되물음", ...at("icecream", "3-12", "되물음"), problem: "3-2.m08.a",
      taps: ["hidden"], wrongReasons: [], reason: "왜 이게 이상해요?", answers: ["다시 못 만난 가족이 많아요"],
      expect: { mark: ["solved"] } },

    // 장난하는 학생
    { name: "천재 3-3 · 장난 뒤 몰라요", ...at("chunjae", "3-3", "장난"), problem: "3-1.m03.a",
      taps: ["hidden"], wrongReasons: [], reason: "ㅋㅋㅋ 배고파요", answers: ["몰라요", "몰라요"],
      expect: { mark: ["found"] } },

    // 맞춤법이 서툴거나 말이 짧은 학생
    { name: "아이스크림 3-6 · 맞춤법 틀린 바른 까닭", ...at("icecream", "3-6", "낮은 수준"), problem: "3-1.m10.a",
      taps: ["hidden"], wrongReasons: [], reason: "학교에서 일본말 쓰라고 해서 우리말 못썻어요", answers: [],
      expect: { mark: ["solved"] } },
    { name: "비상 3-8 · 독립운동 덕분이라고 짧게", ...at("visang", "3-8", "낮은 수준"), problem: "3-2.m12.a",
      taps: ["hidden"], wrongReasons: [], reason: "독립운동을 계속해서 광복된거에요", answers: [],
      expect: { mark: ["solved"] } },

    // 단원 마무리 차시
    { name: "천재 단원 마무리 · 남한만 선거", ...at("chunjae", "wrap", "단원 마무리"), problem: "3-2.m14.a",
      taps: ["hidden"], wrongReasons: [], reason: "남한만 선거했어요", answers: [],
      expect: { mark: ["solved"] } },

    // 틀린 생각을 고집하는 학생
    { name: "비상 3-6 · 신채호가 맞다고 고집", ...at("visang", "3-6", "고집"), problem: "3-1.m11.a",
      taps: ["hidden"], wrongReasons: [], reason: "신채호가 아닌 것 같아요", answers: ["신채호가 만든 게 맞는 것 같아요", "그냥 그런 것 같아요"],
      expect: { mark: ["found"] } },

    // 덜 자세해도 핵심은 맞는 학생
    { name: "아이스크림 3-8 · 1948년은 정부 세운 날", ...at("icecream", "3-8", "덜 자세함"), problem: "3-2.m11.a",
      taps: ["hidden"], wrongReasons: [], reason: "1948년은 광복이 아니에요. 정부를 세운 날이에요", answers: [],
      expect: { mark: ["solved"] } },
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = { cases };
  else root.SokLiveDetectiveCases = { cases };
})(this);

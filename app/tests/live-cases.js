// 실제 AI 호출 점검에 쓰는 가상 학생들입니다. 학생 이름은 없습니다.
// answers는 AI 질문에 차례로 넣는 답입니다. 답이 떨어지면 [바로 정리하기]를 누른 것처럼 판정을 받습니다.
// expect: 기대 판정(strong/revisit/hold), expectChecks: 기대 확인 결과(없으면 비교하지 않음)
(function (root) {
  const TB = { chunjae: "천재교과서", icecream: "아이스크림미디어", visang: "비상교육" };

  // 모두 맞음: 근거를 말할 수 있는 학생 → 이유 묻기 1번 → 튼튼한 생각
  const allRight = {
    items: ["북한군이 38도선을 넘어 쳐들어와서 전쟁이 시작되었다", "인천 상륙 작전으로 서울을 되찾았다", "1953년에 정전 협정을 맺어서 전쟁이 멈췄다"],
    answers: ["정전은 싸움을 잠시 멈춘 거라서 아직 끝난 게 아니에요. 그래서 지금도 휴전선이 있어요."],
    expect: "strong", expectMode: "reason",
  };
  // 오개념 1개: 반례 질문을 받고 스스로 허점을 찾는 학생 → 다시 볼 생각
  const oneWrong = {
    chunjae: {
      items: ["북한이 남한을 쳐들어와서 전쟁이 시작되었다", "부산이 임시 수도였다", "전쟁에서 다치거나 죽은 사람은 군인뿐이었다"],
      answers: ["피란 가던 사람들도 다쳤을 것 같아요.", "아, 군인만이 아니라 보통 사람들도 많이 죽거나 다쳤네요."],
    },
    icecream: {
      items: ["북한이 남한을 쳐들어와서 전쟁이 시작되었다", "국제 연합군은 미국 군대 하나뿐이었다", "가족과 헤어진 이산가족이 생겼다"],
      answers: ["여러 나라가 군대를 보냈다고 했던 것 같아요.", "아, 미국만이 아니라 16개 나라가 함께 왔네요."],
    },
    visang: {
      items: ["북한이 남한을 쳐들어와서 전쟁이 시작되었다", "인천 상륙 작전으로 서울을 되찾은 뒤에는 다시 빼앗기지 않았다", "정전 협정으로 휴전선이 생겼다"],
      answers: ["중국군이 들어와서 다시 밀렸던 것 같아요.", "아, 1·4 후퇴 때 서울을 또 빼앗겼네요."],
    },
  };
  // 엉뚱한 답: 교과서 밖 이야기와 모르겠다는 답만 하는 학생 → 판정 보류
  const offTrack = {
    items: ["전쟁은 게임처럼 재미있다", "로봇이 싸웠다", "몰라요"],
    answers: ["몰라요.", "그냥요.", "모르겠어요."],
    expect: "hold", expectMode: "retry",
  };

  const cases = [
    {
      name: "PRD 예시", textbookId: "chunjae",
      items: ["북한이 남침했다", "유엔군이 도와주었다", "전쟁은 1953년에 끝났다"],
      answers: ["정전 협정이요.", "아, 멈춘 거예요. 그럼 끝난 건 아니네요."],
      expect: "revisit", expectChecks: ["ok", "ok", "think"],
    },
  ];
  for (const id of Object.keys(TB)) {
    cases.push({ name: `모두 맞음 · ${TB[id]}`, textbookId: id, ...allRight });
    cases.push({ name: `오개념 1개 · ${TB[id]}`, textbookId: id, ...oneWrong[id], expect: "revisit", expectMode: "counter" });
    cases.push({ name: `엉뚱한 답 · ${TB[id]}`, textbookId: id, ...offTrack });
  }

  const LiveCases = { cases };
  if (typeof module !== "undefined" && module.exports) module.exports = LiveCases;
  else root.SokLiveCases = LiveCases;
})(this);

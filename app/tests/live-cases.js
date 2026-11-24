// 실제 AI 호출 점검에 쓰는 가상 학생들입니다. 학생 이름은 없습니다.
// answers는 AI 질문에 차례로 넣는 답입니다. 답이 떨어지면 [바로 정리하기]를 누른 것처럼 판정을 받습니다.
// expect: 기대 판정(strong/revisit/hold), expectChecks: 기대 확인 결과(없으면 비교하지 않음)
// unitId·key: 시작 화면의 단원·차시 선택, group: 결과 요약 묶음, expectOk: ok여야 하는 항목 번호(0부터)
(function (root) {
  const TB = { chunjae: "천재교과서", icecream: "아이스크림미디어", visang: "비상교육" };
  // 6·25 사례는 그 교과서의 마지막 6·25 차시로 돌립니다. 그래야 6·25 오개념이 모두 "이미 배운" 범위에 듭니다.
  const KEY625 = { chunjae: "3-12", icecream: "3-12", visang: "3-11" };
  const at = (textbookId, key, group) => ({ textbookId, unitId: 3, key, group });

  // 모두 맞음: 근거를 말할 수 있는 학생 → 이유 묻기 1번 → 튼튼한 생각
  const allRight = {
    items: ["북한군이 38도선을 넘어 쳐들어와서 전쟁이 시작되었다", "인천 상륙 작전으로 서울을 되찾았다", "1953년에 정전 협정을 맺어서 전쟁이 멈췄다"],
    answers: ["북한은 힘으로 통일하려고 쳐들어왔어요. 정전은 싸움을 잠시 멈춘 거라서 지금도 휴전선이 있어요."],
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
      name: "PRD 예시", ...at("chunjae", KEY625.chunjae, "6·25"),
      items: ["북한이 남침했다", "유엔군이 도와주었다", "전쟁은 1953년에 끝났다"],
      answers: ["정전 협정이요.", "아, 멈춘 거예요. 그럼 끝난 건 아니네요."],
      expect: "revisit", expectChecks: ["ok", "ok", "think"],
    },
  ];
  for (const id of Object.keys(TB)) {
    const where = at(id, KEY625[id], "6·25");
    cases.push({ name: `모두 맞음 · ${TB[id]}`, ...where, ...allRight });
    cases.push({ name: `오개념 1개 · ${TB[id]}`, ...where, ...oneWrong[id], expect: "revisit", expectMode: "counter" });
    cases.push({ name: `엉뚱한 답 · ${TB[id]}`, ...where, ...offTrack });
  }

  // ---- 3단원 새 사례: 교과서마다 4개 ----
  const NEW = "3단원 새 사례";
  // 3·1 운동을 배우는 차시(비상은 5차시가 3-5)
  const KEY31 = { chunjae: "3-4", icecream: "3-4", visang: "3-5" };
  for (const id of Object.keys(TB)) {
    // 3-1 차시 모두 맞음: 나라를 지키려는 노력(2차시, 세 교과서 모두 3-2)
    cases.push({
      name: `3-1 모두 맞음 · ${TB[id]}`, ...at(id, "3-2", NEW),
      items: ["일본이 을사늑약으로 외교권을 빼앗았다", "나라 곳곳에서 의병이 일어났다", "안중근이 하얼빈역에서 이토 히로부미를 처단했다"],
      answers: ["이토 히로부미가 우리나라 침략에 앞장선 사람이라서 안중근이 처단한 거예요. 의병은 나라를 지키려고 싸웠어요."],
      expect: "strong", expectMode: "reason",
    });
    // 3-1 차시 하나 틀림: 임시 정부가 3·1 운동을 이끌었다(3-1.m06)
    cases.push({
      name: `3-1 하나 틀림 · ${TB[id]}`, ...at(id, KEY31[id], NEW),
      items: ["1919년에 3·1 운동이 일어났다", "대한민국 임시 정부가 3·1 운동을 이끌었다", "유관순이 천안에서 만세 시위를 이끌었다"],
      answers: ["임시 정부는 3·1 운동 뒤에 세워진 것 같아요.", "아, 3·1 운동이 먼저 일어나고 그 뒤에 임시 정부가 세워졌네요."],
      expect: "revisit", expectMode: "counter",
    });
    // 3-2 첫 차시(광복)에서 3-1 내용을 섞은 모두 맞음: 3번째 항목이 지난 묶음(일본어 수업, 3-1.c39) 내용
    cases.push({
      name: `지난 차시 섞음 · ${TB[id]}`, ...at(id, "3-8", NEW),
      items: ["1945년 8월 15일에 광복을 맞았다", "광복 뒤 학교에서 한글로 쓴 교과서로 배우게 되었다", "일제 때는 학교에서 일본어로 수업하게 했었다"],
      answers: ["일제가 우리말을 못 쓰게 하고 일본어로 가르쳐서, 광복이 되자 우리말 교과서로 다시 배우게 된 거예요."],
      expect: "strong", expectMode: "reason", expectOk: [2],
    });
    // 단원 마무리 하나 틀림: 이봉창과 윤봉길을 헷갈림(3-1.m08)
    cases.push({
      name: `단원 마무리 하나 틀림 · ${TB[id]}`, ...at(id, "wrap", NEW),
      items: ["1919년에 3·1 운동이 일어났다", "이봉창은 상하이 훙커우 공원에서 폭탄을 던졌다", "1948년에 대한민국 정부가 세워졌다"],
      answers: ["훙커우 공원은 윤봉길이었던 것 같아요.", "아, 이봉창은 도쿄에서 일본 왕의 마차에 폭탄을 던졌네요."],
      expect: "revisit",
    });
  }

  const LiveCases = { cases };
  if (typeof module !== "undefined" && module.exports) module.exports = LiveCases;
  else root.SokLiveCases = LiveCases;
})(this);

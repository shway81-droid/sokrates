// 모델 비교용 학생 역할 AI. 가상 학생 설정표(sim-students.js)대로, 엘렌코스의 질문 하나에 학생처럼 한 번 답하게 합니다.
// 엘렌코스 쪽 모델(Opus·Sonnet)이 바뀌어도 학생 역할은 늘 같은 모델이 맡아야 비교가 공정합니다.
(function (root) {
  const LEVEL_STYLE = {
    상: "또박또박 완전한 문장으로 답하고, 배운 낱말을 써서 까닭까지 말합니다.",
    중: "보통 길이의 문장으로 답하고, 헷갈리면 \"~인 것 같아요\"라고 합니다.",
    하: "한두 마디로 짧게 답하고 맞춤법이 가끔 틀립니다. 어렵거나 모르면 \"몰라요\", \"잘 모르겠어요\"라고 합니다.",
    엉뚱: "장난이나 딴소리를 섞어 답합니다. 진지한 질문이 이어지면 조금씩 진지해집니다.",
  };
  const STUBBORN = [
    "질문이 앞뒤가 안 맞는 점을 짚어 주면 쉽게 생각을 고칩니다.",
    "한두 번 짚어 주면 생각을 고칩니다.",
    "까닭을 대며 버팁니다. 아주 분명한 모순을 스스로 알아차렸을 때만 생각을 고칩니다.",
  ];

  function studentPrompt(student, turns, question) {
    const lines = [
      "당신은 초등학교 5학년 학생 역할을 합니다. 사회 시간이 끝날 때 선생님 AI가 오늘 배운 것에 대해 질문합니다.",
      "아래 설정에 맞는 학생이 되어, 지금 받은 질문에 한 번만 답하세요.",
      "",
      `[학생 수준] ${student.level} — ${LEVEL_STYLE[student.level]}`,
      "[학생이 적은 배운 3가지]",
      ...student.items.map((it, i) => `${i + 1}. ${it}`),
      `[속마음] ${student.mind}`,
      `[생각을 바꾸는 정도] ${STUBBORN[student.stubborn]}`,
    ];
    if (turns.length) {
      lines.push("", "[지금까지의 문답]");
      turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `내 답${i + 1}: ${t.a}`));
    }
    lines.push(
      "", `[지금 받은 질문] ${question}`, "",
      "지킬 것",
      "- 속마음에 적힌 것보다 더 많이 알지 마세요. 교과서를 다시 펴 본 것처럼 정답을 줄줄 말하지 않습니다. 질문 덕분에 스스로 떠올릴 수 있는 것만 떠올립니다.",
      "- 질문이 무엇을 묻는지 모르겠으면 모르겠다고 하거나 선생님에게 되물어도 됩니다.",
      "- 학생이 하는 말만 한두 문장으로 쓰세요. 따옴표, 이름표, 행동 설명은 쓰지 않습니다.",
    );
    return lines.join("\n");
  }

  function cleanAnswer(text) {
    let t = String(text || "").split(/\n\s*\n/)[0].replace(/\([^)]*\)/g, "").trim();
    t = t.replace(/^(학생|나|내 답\d*)\s*[:：]\s*/, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s+/g, " ").trim();
    if (!t) return "몰라요";
    return Array.from(t).slice(0, 120).join("");
  }

  const SokSimStudent = { LEVEL_STYLE, STUBBORN, studentPrompt, cleanAnswer };
  if (typeof module !== "undefined" && module.exports) module.exports = SokSimStudent;
  else root.SokSimStudent = SokSimStudent;
})(this);

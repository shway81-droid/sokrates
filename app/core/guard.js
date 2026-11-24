// AI 출력 검사기: AI가 돌려준 JSON이 화면에 띄워도 되는 모양인지 확인합니다.
(function (root) {
  const MAX_CHARS = 40;
  const FORBIDDEN = ["틀렸", "정답은", "오답"];
  const CHECK_VALUES = ["ok", "think", "unsure", "outside"];
  const MODES = ["counter", "reason", "retry"];
  const VERDICTS = ["strong", "revisit", "hold"];

  const DEFAULT_QUESTION = "왜 그렇게 생각했나요?";
  const DEFAULT_SUMMARY = [
    "오늘 배운 것을 세 가지로 말해 보았어요",
    "선생님과 함께 다시 생각해 볼 거예요",
    "다음 시간에 오늘 생각을 다시 확인해 볼까요?",
  ];

  function charLen(s) {
    return Array.from(String(s).trim()).length;
  }

  function hasForbidden(s) {
    return FORBIDDEN.some((w) => s.includes(w));
  }

  function checkQuestion(q) {
    if (typeof q !== "string" || !q.trim()) return { ok: false, reason: "질문이 비어 있음" };
    const t = q.trim();
    if (charLen(t) > MAX_CHARS) return { ok: false, reason: `질문이 ${MAX_CHARS}자를 넘음` };
    if (!t.endsWith("?")) return { ok: false, reason: "물음표로 끝나지 않음" };
    if (/[.?!]/.test(t.slice(0, -1))) return { ok: false, reason: "한 문장이 아님" };
    if (hasForbidden(t)) return { ok: false, reason: "금지어 포함" };
    return { ok: true };
  }

  const LABEL_PREFIX = /^(알게 된 것|다시 생각한 것|다음 시간 확인할 것)\s*[:：]/;
  const THIRD_PERSON = /^학생(이|은|의|도|에게)\s/;
  // 다시 볼 생각의 둘째 줄은 화면에 "고친 생각"으로 나가므로, 고친 과정이 아니라 고친 내용이어야 합니다.
  const PROCESS_WORDS = /처음|고쳤|고쳐|생각했|헷갈렸/;

  function checkSummary(summary, verdict) {
    if (!Array.isArray(summary) || summary.length !== 3) return "세 줄 정리가 3줄이 아님";
    for (const [i, line] of summary.entries()) {
      if (typeof line !== "string" || !line.trim()) return "세 줄 정리에 빈 줄";
      const t = line.trim();
      // 다시 낼 때 고칠 수 있게 몇 번째 줄이 몇 자인지 알려 줍니다.
      if (charLen(t) > MAX_CHARS) return `세 줄 정리 ${i + 1}번째 줄이 ${charLen(t)}자로 ${MAX_CHARS}자를 넘음 — 더 짧게 줄일 것`;
      if (hasForbidden(t)) return "세 줄 정리에 금지어 포함";
      if (LABEL_PREFIX.test(t)) return "세 줄 정리 줄 앞에 칸 이름을 붙임";
      if (THIRD_PERSON.test(t)) return "세 줄 정리를 '학생이'처럼 3인칭으로 씀(학생에게 보여 주는 글)";
    }
    if (!summary[2].trim().endsWith("?")) return "셋째 줄(다음 시간 확인할 것)이 물음표로 끝나는 질문이 아님";
    if (verdict === "revisit" && PROCESS_WORDS.test(summary[1]))
      return "다시 볼 생각의 둘째 줄에 '처음에는', '고쳤다' 같은 과정 말이 있음 — 고친 생각 자체를 사실 문장으로 쓸 것";
    return null;
  }

  function validateStep(obj, allowedStages) {
    if (!obj || typeof obj !== "object") return { ok: false, reason: "객체가 아님" };
    if (!allowedStages.includes(obj.stage)) return { ok: false, reason: `허용되지 않은 단계: ${obj.stage}` };

    if (obj.stage === "check") {
      const c = obj.checks;
      if (!Array.isArray(c) || c.length !== 3 || !c.every((v) => CHECK_VALUES.includes(v)))
        return { ok: false, reason: "checks 형식 오류" };
      if (!Number.isInteger(obj.target) || obj.target < 0 || obj.target > 2)
        return { ok: false, reason: "target 범위 오류" };
      if (!MODES.includes(obj.mode)) return { ok: false, reason: "mode 오류" };
      // 방식과 대상의 짝: 맞는 항목엔 반례를 던지지 않고, 교과서 밖 항목은 반례 대상이 아닙니다.
      const t = c[obj.target];
      if (obj.mode === "counter" && t !== "think") return { ok: false, reason: "counter 대상이 think가 아님" };
      if (obj.mode === "reason" && c.includes("think")) return { ok: false, reason: "다시 볼 항목이 있는데 reason" };
      if (obj.mode === "retry" && (t === "ok" || t === "unsure")) return { ok: false, reason: "retry 대상이 ok나 unsure" };
      return checkQuestion(obj.question);
    }
    if (obj.stage === "question") return checkQuestion(obj.question);
    if (obj.stage === "verdict") {
      if (!VERDICTS.includes(obj.verdict)) return { ok: false, reason: "verdict 오류" };
      const err = checkSummary(obj.summary, obj.verdict);
      return err ? { ok: false, reason: err } : { ok: true };
    }
    return { ok: false, reason: "알 수 없는 단계" };
  }

  const SokGuard = { MAX_CHARS, FORBIDDEN, DEFAULT_QUESTION, DEFAULT_SUMMARY, charLen, checkQuestion, validateStep };
  if (typeof module !== "undefined" && module.exports) module.exports = SokGuard;
  else root.SokGuard = SokGuard;
})(this);

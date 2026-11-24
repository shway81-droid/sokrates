// AI 출력 검사기: AI가 돌려준 JSON이 화면에 띄워도 되는 모양인지 확인합니다.
(function (root) {
  const MAX_CHARS = 40;
  const FORBIDDEN = ["틀렸", "정답은", "오답"];
  const CHECK_VALUES = ["ok", "think", "outside"];
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

  function checkSummary(summary) {
    if (!Array.isArray(summary) || summary.length !== 3) return "세 줄 정리가 3줄이 아님";
    for (const line of summary) {
      if (typeof line !== "string" || !line.trim()) return "세 줄 정리에 빈 줄";
      if (charLen(line) > MAX_CHARS) return `세 줄 정리 한 줄이 ${MAX_CHARS}자를 넘음`;
      if (hasForbidden(line)) return "세 줄 정리에 금지어 포함";
    }
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
      if (obj.mode === "retry" && t === "ok") return { ok: false, reason: "retry 대상이 ok" };
      return checkQuestion(obj.question);
    }
    if (obj.stage === "question") return checkQuestion(obj.question);
    if (obj.stage === "verdict") {
      if (!VERDICTS.includes(obj.verdict)) return { ok: false, reason: "verdict 오류" };
      const err = checkSummary(obj.summary);
      return err ? { ok: false, reason: err } : { ok: true };
    }
    return { ok: false, reason: "알 수 없는 단계" };
  }

  const SokGuard = { MAX_CHARS, FORBIDDEN, DEFAULT_QUESTION, DEFAULT_SUMMARY, charLen, checkQuestion, validateStep };
  if (typeof module !== "undefined" && module.exports) module.exports = SokGuard;
  else root.SokGuard = SokGuard;
})(this);

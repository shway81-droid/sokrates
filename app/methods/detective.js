// 오답 탐정 학습정리: 친구가 정리한 4문장 중 틀린 생각이 숨은 한 문장을 찾아 누르고, 왜 이상한지 말합니다.
// 문제는 미리 만들어 검증한 데이터(data/detective-*.js)이고, AI는 숨은 문장에 대한 학생의 까닭만 판단해
// 이어 묻는 질문 하나를 냅니다. 문제 고르기·질문 수·넘어가기·검사 실패 처리는 이 코드가 정합니다.
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const G = isNode ? require("../core/guard.js") : root.SokGuard;
  const T = isNode ? require("../core/topic.js") : root.SokTopic;

  const ERROR_MESSAGE = "AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요.";
  const PROBLEM_COUNT = 2; // 학생 1명당 문제 수(사용자님 결정)
  const MAX_FOLLOW = 2; // 숨은 문장을 찾은 뒤 이어 묻는 질문 최대 수
  const MAX_WRONG = 2; // 맞는 문장을 이만큼 누르면 그 문제는 선생님께 넘깁니다

  // 문제마다 붙는 표시. 빨간색·점수 대신 이 세 가지 말만 씁니다.
  const MARK_TEXT = { solved: "까닭까지 밝혔어요", found: "이상한 곳을 찾았어요", together: "함께 더 알아봐요" };
  // 학생에게 보이는 고정 문구(AI가 쓰지 않음). "틀린 곳" 대신 "이상한 곳"이라고 씁니다.
  const LINES = {
    wrongFirst: "생각을 말해 줘서 고마워요. 다른 문장도 다시 읽어 볼까요?",
    wrongLast: "이 문제는 선생님과 함께 알아봐요. 다음 문제로 가 볼까요?",
    solved: "까닭까지 찾아냈어요! 다음 문제로 가 볼까요?",
    found: "이상한 곳을 찾았어요. 까닭은 선생님과 함께 더 알아봐요.",
  };
  // 이어 묻는 질문이 검사에 두 번 걸리면 쓰는 기본 질문(이미 한 질문은 다시 쓰지 않음)
  const DEFAULT_QUESTIONS = ["그 부분이 실제로는 어땠는지 말해 줄래요?", "왜 그렇게 생각했는지 더 말해 줄래요?"];

  // 호출마다 고를 수 있는 판단을 좁혀 형식을 만듭니다(코드가 흐름을 정함).
  const RESULTS = { judge: ["solved", "ask"], final: ["solved", "found"], question: ["ask"] };
  const QUESTION_DESC = "이어 묻는 질문 1문장, 40자 이내, \"요?\"로 끝나는 존댓말. 바른 생각을 넣지 않음. result가 solved면 \"\"";
  function schemaFor(stage) {
    const result = { type: "string", enum: RESULTS[stage].slice() };
    if (stage === "final") {
      return { type: "object", properties: { result }, required: ["result"], additionalProperties: false };
    }
    return {
      type: "object",
      properties: { result, question: { type: "string", description: QUESTION_DESC } },
      required: ["result", "question"],
      additionalProperties: false,
    };
  }

  const squash = (s) => String(s ?? "").replace(/\s+/g, "");
  // 둘 중 하나를 고르게 하는 질문(모르는 친구와 같은 규칙). 고르게 하면 답을 알려 주는 셈입니다.
  const CHOICE_TWO = /(까요|나요|예요|에요|(?<!잖)[어아해]요|가요)\s*,.*요\s*[?？]\s*$/;
  const CHOICE_ILKKA = /(일까|인가)\S*\s*,?\s*.+(일까요|인가요)\s*[?？]\s*$/;
  const isChoice = (q) => CHOICE_TWO.test(q) || CHOICE_ILKKA.test(q);

  // 정답 낱말: 바른 생각에만 있는 낱말이 질문에 먼저 나오면 정답을 알려 주는 셈입니다.
  // 학생이 이미 말한 낱말은 되받아도 됩니다(띄어쓰기 무시).
  function leakIn(question, leakWords, said) {
    const q = squash(question);
    const s = squash(said);
    return (leakWords || []).find((w) => squash(w) && q.includes(squash(w)) && !s.includes(squash(w))) || null;
  }

  const fail = (reason) => ({ ok: false, reason });

  // expect = { stage: "judge"|"final"|"question", asked: string[], leakWords: string[], said: string }
  function validateDetectiveStep(out, expect) {
    if (!out || typeof out !== "object") return fail("객체가 아님");
    const allowed = RESULTS[expect.stage];
    if (!allowed.includes(out.result)) return fail(`허용되지 않은 판단: ${out.result} — ${allowed.join(" 또는 ")} 중 하나로 낼 것`);
    if (out.result !== "ask") return { ok: true };
    const q = G.checkQuestion(out.question);
    if (!q.ok) return fail(q.reason);
    if (isChoice(out.question)) return fail("둘 중 하나를 고르게 하는 질문임 — 질문 하나로만 물을 것");
    if ((expect.asked || []).some((a) => squash(a) === squash(out.question)))
      return fail("앞에서 한 질문과 같음 — 학생의 마지막 답에 맞춰 다른 질문을 낼 것");
    const w = leakIn(out.question, expect.leakWords, expect.said);
    if (w) return fail(`질문에 '${w}'가 있음 — 학생이 아직 말하지 않은 바른 생각의 낱말은 쓰지 말고, 학생이 스스로 떠올리게 물을 것`);
    return { ok: true };
  }

  // ---------- 문제 고르기 ----------
  // 첫 문제는 오늘 차시, 둘째는 이미 배운 앞 차시(없으면 오늘 차시의 다른 오개념). 단원 마무리는 범위 전체에서 둘.
  // served(이미 낸 문제 id)로 같은 차시 학생들에게 같은 문제가 되풀이되지 않게 돌립니다.
  function pickProblems({ problems, topic, textbookId, lessonId = null, served = new Set(), random = Math.random }) {
    const inScope = new Set(T.scopeFor(topic, textbookId, lessonId).misconceptions.map((m) => m.id));
    const miscById = new Map(topic.misconceptions.map((m) => [m.id, m]));
    const cands = (problems || []).filter((p) => p.textbooks.includes(textbookId) && inScope.has(p.misconception));
    const isToday = (p) => lessonId != null && miscById.get(p.misconception).sources[textbookId].lesson === lessonId;
    const today = cands.filter(isToday);
    const earlier = cands.filter((p) => !isToday(p));

    // 안 낸 문제(오개념도 안 나옴) → 안 낸 문제(오개념은 나옴) → 낸 문제 차례. 모두 냈으면 그 무리의 기억을 비우고 다시 돕니다.
    function choose(group, avoidMisc) {
      const pool = group.filter((p) => p.misconception !== avoidMisc);
      if (!pool.length) return null;
      if (pool.every((p) => served.has(p.id))) pool.forEach((p) => served.delete(p.id));
      const servedMisc = new Set(problems.filter((p) => served.has(p.id)).map((p) => p.misconception));
      const rank = (p) => (served.has(p.id) ? 2 : servedMisc.has(p.misconception) ? 1 : 0);
      const best = Math.min(...pool.map(rank));
      const top = pool.filter((p) => rank(p) === best);
      const chosen = top[Math.min(top.length - 1, Math.floor(random() * top.length))];
      served.add(chosen.id);
      return chosen;
    }

    const first = lessonId == null ? choose(cands, null) : choose(today, null) || choose(earlier, null);
    if (!first) return [];
    const rest = lessonId == null ? cands : earlier;
    const second = choose(rest, first.misconception) || (lessonId == null ? null : choose(today, first.misconception));
    return [first, second].filter(Boolean).slice(0, PROBLEM_COUNT);
  }

  const SokDetective = {
    id: "detective", name: "오답 탐정", ERROR_MESSAGE, PROBLEM_COUNT, MAX_FOLLOW, MAX_WRONG, MARK_TEXT, LINES, DEFAULT_QUESTIONS,
    schemaFor, validateDetectiveStep, isChoice, leakIn, pickProblems,
  };
  if (isNode) module.exports = SokDetective;
  else root.SokDetective = SokDetective;
})(this);

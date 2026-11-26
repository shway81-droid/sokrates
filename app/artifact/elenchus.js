// 아티팩트판 엘렌코스 학습정리.
// 웹앱판(methods/elenchus.js)은 Haiku 에서도 버티도록 세부 규칙과 문장 검사·재요청을 많이 넣었습니다.
// 아티팩트판은 Sonnet·Opus 를 쓸 수 있으므로 판단은 AI에게 맡기고, 코드는 세 가지만 지킵니다.
//   1) 학습 자료(개념·오개념·같은 뜻 말)는 그대로 넘기기
//   2) 교실 시간: 질문 상한(이유 묻기 2번, 그 밖 3번)과 [바로 정리하기]
//   3) 화면이 읽는 칸의 모양(checks 3개, target 0~2, 빈 질문 아님) — 어긋나면 까닭을 알려 한 번만 다시 받기
//   4) 실제 점검에서 Sonnet 도 가끔 어긴 원칙(고르기·퀴즈 질문, 긴 정리 등) — 걸리면 한 번만 다시 받고, 그래도 남으면 그대로 씀
// 세션 상태 모양은 웹앱판과 같아서 화면(methods/elenchus-views.js)을 그대로 씁니다.
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const T = isNode ? require("../core/topic.js") : root.SokTopic;

  const ERROR_MESSAGE = "AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요.";
  const CANCELLED = Symbol("cancelled");
  const DEFAULT_QUESTION = "왜 그렇게 생각했나요?";
  const DEFAULT_SUMMARY = [
    "오늘 배운 것을 세 가지로 말해 보았어요",
    "선생님과 함께 다시 생각해 볼 거예요",
    "다음 시간에 오늘 생각을 다시 확인해 볼까요?",
  ];

  const SYSTEM_PROMPT = `당신은 초등학교 5학년 사회 수업이 끝날 때 학생과 함께 오늘 배운 것을 정리하는 소크라테스식 질문자입니다.
학생이 말한 "오늘 배운 3가지" 가운데 흔들리는 생각 하나를 골라, 질문만으로 학생이 스스로 다시 생각하게 합니다.

[학습 자료]는 선생님이 확인한 자료입니다. 맞고 틀림은 이 자료로만 판단하고, 따로 아는 지식을 근거로 삼지 않습니다.
표현이 다르거나 덜 자세해도 뜻이 같으면 맞는 것으로 봅니다. [같은 뜻으로 인정할 말]을 참고하고, 맞춤법·띄어쓰기·가운뎃점은 따지지 않습니다("31운동"은 "3·1 운동").

지켜야 할 원칙
- 정답, 설명, 힌트를 말하지 않습니다. 질문 속에 답을 넌지시 담거나 보기를 주고 고르게 하지 않습니다. "~일까요, ~일까요?", "~인가요, 아닌가요?"처럼 답을 늘어놓는 것도 보기입니다. 학생이 스스로 알아차리는 것이 이 정리의 목적입니다.
- 외운 사실 하나를 대게 하는 퀴즈 질문을 하지 않습니다. "어느 도시", "몇 월", "언제", "어디서", "이름이 무엇"을 묻는 질문이 그렇습니다. 대신 학생 말을 그대로 따랐을 때 생기는 어긋남을 상식으로 따져 보게 합니다(예: "한 사람이 같은 때 도쿄와 상하이에 있을 수 있을까요?").
- 맞는 생각에는 반례를 던지지 않습니다. 반례는 한 항목에만 씁니다.
- 질문은 한 번에 하나, 한 문장으로 짧게(40자 안쪽) 쓰고 "~까요?", "~나요?"처럼 존댓말로 끝냅니다. 5학년이 아는 쉬운 말을 씁니다. 앞에서 한 질문을 되풀이하지 않습니다.
- 학생에게 "틀렸", "정답은", "오답", "반례" 같은 말을 쓰지 않습니다.

진행
1. 확인(stage "check"): 세 항목마다 checks를 정합니다.
   ok = 자료와 뜻이 맞음 / think = 학생 문장에 [흔한 오개념]의 틀린 생각이 실제로 들어 있거나 자료와 분명히 어긋남(같은 낱말이 나오는 것만으로는 아님) / unsure = 주제와 관계있지만 자료로 확인되지 않음 / outside = 주제와 관계없는 말(장난, 빈말, 모르겠다)
   그리고 묻을 항목 target(0~2)과 방식 mode를 고르고 첫 질문을 냅니다.
   counter = think 항목에만 씁니다. 학생 말이 맞다면 어떻게 되는지 묻습니다. 오개념의 반례 실마리를 참고합니다.
   retry = think가 없고 outside가 있을 때(unsure가 함께 있어도), 오늘 배운 것을 하나 더 말해 보게 하기
   reason = think와 outside가 없을 때, 학생이 한 말 가운데 까닭이 자료에 나오는 항목의 이유 묻기(학생이 말하지 않은 일의 까닭은 묻지 않음)
   misconception = 고른 항목이 [흔한 오개념] 가운데 하나면 그 id, 아니면 "none". 오늘 차시 오개념을 먼저 보고, 앞 차시 오개념은 학생이 그 내용을 말했을 때만 씁니다.
2. 문답: 학생 답을 보고 판단이 서면 판정하고, 아니면 다음 질문을 냅니다. 학생이 인정한 것을 처음 말의 내용에 다시 대어 묻되, "처음 한 말은 맞을까요?", "처음 말과 어떻게 다른가요?"처럼 처음 말을 가리키지 말고 내용으로 묻습니다(예: "아직 나뉘어 있다면 1953년에 전쟁이 끝난 것일까요?"). 학생이 되물으면 답하지 말고 스스로 찾게 하는 질문으로 돌려줍니다. "모르겠어요"에는 더 쉬운 질문으로 바꿉니다. 까닭을 대면 그 까닭을 시험해 봅니다.
3. 판정(stage "verdict")
   strong = 반례에도 자료 근거를 대며 생각을 지켰거나, 학생 답에 자료와 맞는 까닭이 들어 있음
   revisit = 학생이 스스로 허점을 인정하거나 처음 말을 고쳐 말함
   hold = 어느 쪽도 아님, 근거 없이 고집함, 또는 주제와 관계있는 말이 끝내 나오지 않음
   summary 세 칸은 학생에게 보여 주는 글입니다. 칸마다 40자 안쪽 한 문장으로, 마침표 없이 "~다" 또는 "~요"로 끝냅니다. 칸 이름을 앞에 붙이지 않고, "학생이" 같은 3인칭을 쓰지 않습니다. 주제와 관계없는 말(outside 항목, 장난)은 정리에 옮기지 않습니다.
   learned = 학생이 맞게 말한 내용 한두 가지(학생이 하지 않은 말이나 깨닫지 못한 정답을 보태지 않음). 맞게 말한 것이 없으면 "오늘 배운 것을 아직 말하지 못했어요"
   rethought = revisit이면 고친 생각 자체를 사실 문장으로, strong이면 학생이 댄 근거, hold면 학생이 주제에 대해 한 생각을 "~라고 생각했어요"로(그런 말이 없으면 "오늘 배운 것을 다시 떠올려 보기로 했어요")
   nextQuestion = 다음 시간에 확인할, "요?"로 끝나는 질문 하나

출력은 주어진 JSON 하나만 냅니다. 쓰지 않는 칸은 question "", verdict "none", summary 세 칸 "" 로 둡니다.

예시
학생: ① 북한이 남침했다 ② 유엔군이 도와주었다 ③ 전쟁은 1953년에 끝났다
확인: checks ["ok","ok","think"], target 2, mode "counter", question "전쟁이 끝났다면 왜 지금도 휴전선이 있을까요?"
학생: 아직 남북이 나뉘어 있어서요. → 질문 "아직 나뉘어 있다면 1953년에 전쟁이 끝난 것일까요?"
학생: 아, 싸움만 멈춘 거네요. → 판정 revisit, summary { learned "북한이 남침했고 유엔군이 도와주었다", rethought "1953년에는 전쟁이 끝난 게 아니라 멈췄다", nextQuestion "정전과 종전은 어떻게 다를까요?" }`;

  const STR = { type: "string" };
  const SUMMARY = {
    type: "object",
    properties: { learned: STR, rethought: STR, nextQuestion: STR },
    required: ["learned", "rethought", "nextQuestion"],
    additionalProperties: false,
  };
  const SCHEMAS = {
    check: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["check"] },
        checks: { type: "array", items: { type: "string", enum: ["ok", "think", "unsure", "outside"] } },
        target: { type: "integer", enum: [0, 1, 2] },
        mode: { type: "string", enum: ["counter", "reason", "retry"] },
        misconception: STR,
        question: STR,
      },
      required: ["stage", "checks", "target", "mode", "misconception", "question"],
      additionalProperties: false,
    },
    next: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["question", "verdict"] },
        question: STR,
        verdict: { type: "string", enum: ["strong", "revisit", "hold", "none"] },
        summary: SUMMARY,
      },
      required: ["stage", "question", "verdict", "summary"],
      additionalProperties: false,
    },
    verdict: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["verdict"] },
        question: STR,
        verdict: { type: "string", enum: ["strong", "revisit", "hold"] },
        summary: SUMMARY,
      },
      required: ["stage", "question", "verdict", "summary"],
      additionalProperties: false,
    },
  };

  const MODE_TEXT = { counter: "반례로 묻기", reason: "이유 묻기", retry: "다시 말해 보게 하기" };
  const filled = (s) => typeof s === "string" && s.trim() !== "";

  // 화면이 읽는 칸만 봅니다. 문장의 길이·말투는 AI 판단에 맡깁니다.
  function shapeProblem(out, stages) {
    if (!out || typeof out !== "object") return "JSON 객체가 아님";
    if (!stages.includes(out.stage)) return `stage는 ${stages.join(" 또는 ")} 여야 함`;
    if (out.stage === "check") {
      if (!Array.isArray(out.checks) || out.checks.length !== 3) return "checks는 세 항목마다 하나씩, 3개여야 함";
      if (!Number.isInteger(out.target) || out.target < 0 || out.target > 2) return "target은 0, 1, 2 중 하나여야 함";
      if (!filled(out.question)) return "question이 비어 있음";
    }
    if (out.stage === "question" && !filled(out.question)) return "question이 비어 있음";
    if (out.stage === "verdict") {
      const s = out.summary || {};
      if (!["learned", "rethought", "nextQuestion"].every((k) => filled(s[k]))) return "summary 세 칸을 모두 채워야 함";
    }
    return null;
  }

  // 28개 사례 점검에서 Sonnet 도 가끔 어긴 원칙들입니다. 걸리면 까닭을 알려 한 번만 다시 받고,
  // 다시 받은 답에도 남아 있으면 수업을 멈추지 않도록 그 답을 그대로 씁니다(판단은 AI 몫).
  const CHOICE_Q = /요\s*,|아니면/;
  const QUIZ_Q = /어느\s?(도시|나라|곳|해|달|날)|몇\s?(월|년|일|개|명|나라|번째)|언제|어디(서|에서|였)|이름(은|이)\s?무엇|무엇이라고\s?부르/;
  const FIRST_WORDS_Q = /처음(에)?\s?(한\s?)?말/;
  const FORBIDDEN = /틀렸|정답|오답|반례/;
  const SUMMARY_MAX = 45;
  const squash = (t) => String(t).replace(/[\s.]/g, "");

  function questionProblem(q) {
    if (CHOICE_Q.test(q)) return "질문이 답을 늘어놓고 고르게 함 — 보기 없이 학생이 스스로 말하게 묻기";
    if (QUIZ_Q.test(q)) return "질문이 외운 사실(도시·달·때·곳·이름)을 대게 하는 퀴즈임 — 학생 말을 따랐을 때의 어긋남을 상식으로 따져 보게 묻기";
    if (FIRST_WORDS_Q.test(q)) return "질문이 '처음 한 말'을 가리켜 틀렸음을 알림 — 처음 말의 내용을 넣어 묻기";
    if (FORBIDDEN.test(q)) return "질문에 '틀렸', '정답', '오답', '반례' 같은 말이 있음";
    return null;
  }

  function styleProblem(out, items, checks) {
    if (out.stage === "check") {
      if (out.mode === "counter" && out.checks[out.target] !== "think") return "mode counter는 think 항목에만 씀 — think가 없으면 outside가 있을 때 retry, 없을 때 reason";
      return questionProblem(out.question);
    }
    if (out.stage === "question") return questionProblem(out.question);
    const s = out.summary;
    const lines = [s.learned, s.rethought, s.nextQuestion].map((t) => t.trim());
    for (const [i, t] of lines.entries()) {
      const n = Array.from(t).length;
      if (n > SUMMARY_MAX) return `summary ${i + 1}번째 칸이 ${n}자 — 40자 안쪽으로 줄이기`;
      if (FORBIDDEN.test(t)) return `summary ${i + 1}번째 칸에 '틀렸', '정답', '오답', '반례' 같은 말이 있음`;
    }
    for (const [i, t] of lines.slice(0, 2).entries()) {
      if (/\.$/.test(t)) return `summary ${i + 1}번째 칸 끝의 마침표 빼기`;
      if (!/[다요]$/.test(t)) return `summary ${i + 1}번째 칸을 "~다" 또는 "~요"로 끝나는 문장으로 쓰기`;
    }
    if (!/요\s*\?$/.test(lines[2])) return 'summary nextQuestion을 "요?"로 끝나는 질문으로 쓰기';
    const off = (items || []).filter((_, i) => checks && checks[i] === "outside").map(squash).map((t) => t.replace(/다$/, "")).filter((t) => t.length >= 4);
    if (off.some((t) => lines.some((l) => squash(l).includes(t)))) return "summary에 주제와 관계없는 말(outside 항목)을 옮김 — 정리에서 빼기";
    return null;
  }

  function initialState() {
    return {
      phase: "input", items: [], checks: null, target: null, mode: null, turns: [],
      question: null, maxQuestions: 3, verdict: null, summary: null, error: null,
      misconception: null, fallbacks: 0,
    };
  }

  function createSession({ topic, textbookId, lessonId = null, llm }) {
    const context = T.buildContext(topic, textbookId, lessonId);
    const scopeMiscIds = new Set(T.scopeFor(topic, textbookId, lessonId).misconceptions.map((m) => m.id));
    let state = initialState();
    let generation = 0;
    let lastAction = null;
    const snapshot = () => JSON.parse(JSON.stringify(state));

    function buildMessage(task, note = "") {
      const lines = ["[학습 자료]", context, "", "[학생이 말한 배운 3가지]"];
      state.items.forEach((it, i) => lines.push(`${i}. ${it}`));
      if (state.mode) lines.push("", `[고른 항목] ${state.target}번 / 방식: ${MODE_TEXT[state.mode]}`);
      if (state.turns.length) {
        lines.push("", "[지금까지의 문답]");
        state.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `학생 답${i + 1}: ${t.a}`));
      }
      lines.push("", `지금 할 일: ${task}`);
      if (note) lines.push("", note);
      return lines.join("\n");
    }

    // 모양이 어긋나거나 원칙에 걸리면 까닭을 알려 한 번만 다시 받습니다.
    // 다시 받은 답의 모양이 어긋나면 null(기본값으로 수업을 이어 감), 원칙만 걸리면 그 답을 씁니다.
    async function ask(task, schema, stages) {
      const gen = generation;
      let content = buildMessage(task);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const out = await llm.call({ system: SYSTEM_PROMPT, messages: [{ role: "user", content }], schema });
        if (gen !== generation) throw CANCELLED;
        const problem = shapeProblem(out, stages);
        if (!problem) {
          const style = styleProblem(out, state.items, state.checks);
          if (!style || attempt === 2) return out;
          content = buildMessage(task, `[앞 응답을 고쳐 주세요: ${style}] 이 점만 고쳐 다시 내세요.`);
          continue;
        }
        content = buildMessage(task, `[앞 응답의 모양이 맞지 않았어요: ${problem}] 이 점만 고쳐 다시 내세요.`);
      }
      state.fallbacks++;
      return null;
    }

    function applyVerdict(out) {
      state.verdict = out ? out.verdict : "hold";
      state.summary = out ? [out.summary.learned, out.summary.rethought, out.summary.nextQuestion].map((s) => s.trim()) : DEFAULT_SUMMARY.slice();
      state.question = null;
      state.phase = "done";
    }

    async function doCheck() {
      const out = await ask('stage "check" — 세 항목을 확인하고 target, mode, 첫 질문을 정하세요.', SCHEMAS.check, ["check"]);
      if (out) {
        Object.assign(state, { checks: out.checks, target: out.target, mode: out.mode, question: out.question.trim() });
        state.misconception = scopeMiscIds.has(out.misconception) ? out.misconception : null;
      } else {
        Object.assign(state, { checks: ["unsure", "unsure", "unsure"], target: 0, mode: "reason", question: DEFAULT_QUESTION });
      }
      state.maxQuestions = state.mode === "reason" ? 2 : 3;
      state.phase = "asking";
    }

    async function doNext() {
      const left = state.maxQuestions - state.turns.length;
      const out = await ask(
        `학생의 마지막 답을 보고, 판단이 서면 stage "verdict"로 판정과 세 줄 정리를, 아니면 stage "question"으로 다음 질문 1개를 내세요. 남은 질문은 ${left}번입니다.`,
        SCHEMAS.next, ["question", "verdict"]);
      if (out && out.stage === "verdict") return applyVerdict(out);
      state.question = out ? out.question.trim() : DEFAULT_QUESTION;
      state.phase = "asking";
    }

    async function doVerdict() {
      applyVerdict(await ask('stage "verdict" — 질문을 마쳤습니다. 판정과 세 줄 정리를 내세요.', SCHEMAS.verdict, ["verdict"]));
    }

    async function run(action) {
      lastAction = action;
      state.phase = "waiting";
      state.error = null;
      try {
        await action();
      } catch (e) {
        if (e === CANCELLED) return snapshot();
        state.phase = "error";
        state.error = ERROR_MESSAGE;
        if (root && root.console) root.console.warn("[엘렌코스] AI 호출 실패:", e && e.message);
      }
      return snapshot();
    }

    return {
      getState: snapshot,
      async submitItems(items) {
        if (state.phase !== "input") return snapshot();
        if (!Array.isArray(items) || items.length !== 3 || items.some((s) => typeof s !== "string" || !s.trim()))
          throw new Error("배운 것 3가지를 모두 적어 주세요.");
        state.items = items.map((s) => s.trim());
        return run(doCheck);
      },
      async submitAnswer(text) {
        if (state.phase !== "asking") return snapshot();
        const a = String(text ?? "").trim();
        if (!a) return snapshot();
        state.turns.push({ q: state.question, a });
        return run(state.turns.length >= state.maxQuestions ? doVerdict : doNext);
      },
      async finishNow() {
        if (state.phase !== "asking") return snapshot();
        return run(doVerdict);
      },
      async retry() {
        if (state.phase !== "error" || !lastAction) return snapshot();
        return run(lastAction);
      },
      cancel() {
        generation++;
        state = initialState();
      },
    };
  }

  const SokElenchus = { id: "elenchus", name: "엘렌코스 학습정리", SYSTEM_PROMPT, SCHEMAS, ERROR_MESSAGE, createSession };
  if (isNode) module.exports = SokElenchus;
  else root.SokElenchus = SokElenchus;
})(this);

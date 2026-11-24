// 엘렌코스 학습정리: 질문 횟수·판정 시점·검사 실패 처리는 이 코드가 정하고, AI는 JSON만 돌려줍니다.
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const G = isNode ? require("../core/guard.js") : root.SokGuard;
  const T = isNode ? require("../core/topic.js") : root.SokTopic;

  const ERROR_MESSAGE = "AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요.";
  const CANCELLED = Symbol("cancelled");

  const SYSTEM_PROMPT = `당신은 초등학교 5학년 사회 수업이 끝날 때 학생과 함께 오늘 배운 것을 정리하는 소크라테스식 질문자입니다.
학생이 말한 "오늘 배운 3가지" 가운데 흔들리는 생각 1개에만 반례 질문을 던져, 학생이 스스로 다시 생각하게 합니다.

규칙:
1. 반례는 [반례에 쓸 수 있는 범위]에 있는 개념과 오개념 안에서만 만듭니다. 근거가 없으면 반례 대신 "왜 그렇게 생각했나요?"라고 묻습니다. 반례는 [흔한 오개념(오늘 차시)]에서 먼저 고르고, [흔한 오개념(앞 차시)]는 학생이 그 내용을 말했을 때만 씁니다.
2. 정답이나 설명을 말하지 않습니다. 질문은 1문장, 30자 안팎으로 짧게(40자를 넘으면 안 됩니다) 쓰고, "~까요?", "~나요?"처럼 "요?"로 끝나는 존댓말로 냅니다. 질문 안에 마침표나 느낌표를 넣지 않습니다. 앞에서 한 질문을 되풀이하지 않습니다.
3. 5학년이 아는 쉬운 낱말과 존댓말을 씁니다.
4. 맞는 지식에는 반례를 던지지 않습니다. 반례는 target 1개에만 씁니다.
5. [같은 뜻으로 인정할 말]에 있는 표현은 같은 말로 봅니다. 맞춤법과 띄어쓰기는 문제 삼지 않습니다.
6. 오늘 주제와 관계없는 입력(장난, 빈말)에는 반례를 던지지 않습니다.
7. 세 줄 정리는 각 줄 30자 안팎의 짧은 문장으로(40자를 넘으면 안 됩니다), 학생이 한 말을 바탕으로 씁니다. 학생이 깨닫지 못한 정답을 정리에 적어 주지 않습니다. 셋째 줄 "다음 시간 확인할 것"은 물음표로 끝나는 질문으로 씁니다. 자세한 것은 아래 [세 줄 정리 쓰는 법]을 따릅니다.
8. 출력은 주어진 JSON 형식 하나만 냅니다. 쓰지 않는 칸은 question "", verdict "none", summary의 세 칸은 "" 로 둡니다.
9. 맞는지 판단할 때는 [오늘 차시 교과서 원문](주어졌을 때)과 [전체 개념]만 근거로 삼고, 따로 아는 지식은 쓰지 않습니다. 원문은 학생 말이 교과서에 있는지 찾는 데 씁니다. 표현이 달라도 원문이나 개념과 뜻이 같으면 맞는 것으로 봅니다(예: 원문 "수많은 사람이 죽거나 다쳤다" ↔ 학생 "많은 사람이 죽거나 다쳤다").
10. "틀렸", "정답은", "오답" 같은 말은 쓰지 않습니다.

내용 확인(stage "check")에서 정할 것:
- checks: 세 항목마다 다음 중 하나
  "ok": 원문이나 전체 개념과 맞음
  "think": 학생 말이 [흔한 오개념]의 틀린 생각과 같은 뜻이거나, 원문·개념과 분명히 어긋남. 학생 문장 안에 오개념의 틀린 주장이 실제로 들어 있어야 합니다. 오개념과 같은 사건이나 낱말이 나오는 것만으로는 "think"가 아닙니다(예: 오개념 "임시 정부가 3·1 운동을 이끌었다" ↔ 학생 "3·1 운동을 통해 임시 정부가 세워졌다"는 다른 말입니다). 원문보다 덜 자세하거나, 낱말이 조금 다른 것도 "think"가 아닙니다
  "unsure": 오늘 주제와 관계있지만 원문과 전체 개념에서 확인되지 않고, 어긋나지도 않음(반례를 던지지 않습니다)
  "outside": 오늘 주제와 관계없는 말(장난, 빈말, "모르겠다")
- target(0, 1, 2 중 하나)과 mode를 이 순서로 고릅니다.
  1) 오개념이 의심되는 항목이 있으면 그 항목, mode "counter" (여럿이면 [오늘 차시] 개념과 관계있는 항목)
  2) 없고 "outside" 항목이 있으면 그 항목, mode "retry" — "오늘 배운 것 중에서 하나 더 말해 볼까요?"처럼 다시 말해 보게 합니다
  3) 세 항목이 모두 "outside"이면 첫 항목, mode "retry"
  4) 모두 "ok"이거나 "unsure"이면 이유가 [반례에 쓸 수 있는 범위]에 나와 있는 항목, mode "reason" — "왜 그렇게 되었을까요?"처럼 이유를 묻습니다. 교과서에 까닭이 나오지 않는 것(예: 작전이 성공한 까닭)은 묻지 않습니다
- misconception: target이 [반례에 쓸 수 있는 범위]의 흔한 오개념에 해당하면 그 id(예: "3-2.m01"), 아니면 "none"
- question: 첫 질문

[반례 질문 만드는 법] (mode "counter")
- 반례는 checks에서 이미 "think"로 정한 항목에만 씁니다. 반례 질문을 만들 수 있다고 해서 "think"로 정하지 않습니다. "think"인지는 위 내용 확인의 기준으로만 정합니다.
- 반례는 퀴즈가 아닙니다. 협정 이름, 나라 수, 연도, 낱말 뜻처럼 외운 것을 맞히게 하는 질문("~의 이름은 무엇일까요?", "몇 개였을까요?")은 쓰지 않습니다. 그 사실을 모르는 학생은 더 생각해 볼 수 없기 때문입니다.
- 첫 질문: 학생 말이 맞다면 어떻게 되는지 묻거나, 학생이 상식이나 오늘 배운 것으로 쉽게 답할 수 있는 것을 묻습니다(예: "다친 사람은 군인뿐이었다" → "전쟁이 난 곳에는 군인만 살고 있었을까요?").
- 다음 질문: 학생이 인정한 말을 학생이 처음 한 말과 나란히 놓아, 둘이 함께 맞을 수 있는지 묻습니다(예: "마을에서 싸움이 벌어지면 누가 다쳤을까요?"). 결론은 학생이 스스로 말하게 합니다.
- 학생이 까닭을 대면(예: "싸운 건 군인이니까요") 같은 것을 다시 묻지 말고 그 까닭을 시험하는 질문을 합니다(예: "싸우지 않은 사람은 전쟁에서 다치지 않을까요?").
- 학생이 "모르겠어요"라고 하면 같은 것을 다시 묻지 말고, 그 사실을 몰라도 답할 수 있는 더 쉬운 질문으로 바꿉니다.
- 오개념의 "반례 실마리"는 이렇게 만든 질문의 예입니다. 그대로 쓰거나 학생 말에 맞게 바꿉니다.
- 질문이 기대는 사실은 교과서 범위 안이어야 합니다. 다만 "마을에는 사람이 산다"처럼 5학년이면 다 아는 상식으로 따져 보게 하는 것은 괜찮습니다.

판정(stage "verdict"):
- 질문이 남아 있는데 학생이 되물으면(예: "다른 나라도 왔어요?") 판정하지 말고 질문을 이어 갑니다. 답을 알려 주지 말고 학생이 스스로 답을 찾게 하는 질문으로 돌려줍니다.
- "strong"(튼튼한 생각): 학생이 반례에도 교과서 근거를 대며 생각을 지켰거나, 이유를 근거 있게 설명했습니다.
- "revisit"(다시 볼 생각): 학생이 "그러면 아닌가?"처럼 스스로 허점을 인정했습니다. 학생이 처음 말한 대상 항목을 고쳐 말하면(예: "아, 군인만이 아니었네요") 근거를 함께 말했더라도 "strong"이 아니라 "revisit"입니다.
- "hold"(판정 보류): 어느 쪽도 아니거나, 끝까지 오늘 주제와 관계있는 내용이 나오지 않았습니다. 학생이 근거 없이 "제 말이 맞아요"처럼 처음 생각을 끝까지 고집하면, 그 생각이 다시 봐야 할 생각이더라도 "revisit"이나 "strong"이 아니라 "hold"입니다("revisit"은 학생이 스스로 고쳐 말했을 때만 줍니다).
- 이유 묻기(mode "reason")에서 학생 답이 맞는 방향이지만 교과서 근거(까닭)가 빠졌으면, 바로 판정하지 말고 정답을 말하지 않은 채 그 까닭을 스스로 찾게 하는 질문을 한 번 더 합니다(예: "나라를 구하기 위해서" → "무엇으로부터 나라를 구하려 했을까요?").
- summary: learned(알게 된 것), rethought(다시 생각한 것), nextQuestion(다음 시간 확인할 것) 세 칸. 학생이 말한 3가지를 그대로 옮겨 적는 칸이 아닙니다

[세 줄 정리 쓰는 법]
- 학생에게 보여 주는 글입니다. "학생이", "학생은" 같은 3인칭과 "반례" 같은 어려운 말을 쓰지 않고, 줄 앞에 칸 이름(예: "알게 된 것:")을 붙이지 않습니다.
- 첫째 줄 "알게 된 것": 학생이 문답이나 배운 3가지에서 맞게 말한 교과서 내용만 적습니다. 학생이 하지 않은 말을 보태지 않고, 오개념은 적지 않습니다. 판정 보류일 때는 학생이 끝까지 고치지 않은 대상 항목의 바른 내용(예: "민간인도 많이 다쳤다")을 적지 않습니다. 그런 내용이 없으면 "오늘 배운 내용을 아직 말로 꺼내지 못했어요"처럼 씁니다.
- 둘째 줄 "다시 생각한 것":
  · 다시 볼 생각(revisit): 학생이 고쳐 말한 고친 생각 자체를 사실 문장으로 씁니다. "처음에는", "고쳤다", "생각했다" 같은 말은 쓰지 않습니다(예: "처음에는 대통령 선거라고 생각했다"가 아니라 "5·10 총선거로는 국회의원을 뽑았다").
  · 판정 보류(hold)에서 학생이 생각을 바꾸지 않았으면, 학생이 말한 생각을 그대로 "~라고 생각했어요"로 적습니다. 학생이 깨닫지 않은 바른 생각을 학생이 깨달은 것처럼 적지 않습니다.
  · 튼튼한 생각(strong): 학생이 댄 근거를 적습니다.
  · 다시 말해 보게 하기(retry)로 끝난 판정 보류: 고친 생각이 없으므로, 오늘 주제와 다른 말을 했던 자리에 무엇을 더 떠올려 보면 좋을지 적습니다(예: "3·1 운동에 참여한 사람들을 더 떠올려 보아요").
- 셋째 줄 "다음 시간 확인할 것": 오늘 주제와 관계있는, 물음표로 끝나는 질문 1개입니다(예: "~은 왜 그랬을까요?"). 근거나 사실 문장으로 쓰지 않습니다.

예시(천재교과서):
학생: ① 북한이 남침했다 ② 유엔군이 도와주었다 ③ 전쟁은 1953년에 끝났다
확인: checks ["ok","ok","think"], target 2, mode "counter", misconception "3-2.m01", question "전쟁이 끝났다면 왜 지금도 휴전선이 있을까요?"
학생 답: 아직 남북이 나뉘어 있어서요. → 다음 질문: "아직 나뉘어 있다면 1953년에 전쟁이 끝난 것일까요?"
학생 답: 아, 싸움만 멈춘 거네요. 그럼 끝난 건 아니네요. → 판정 "revisit", summary { learned: "북한의 남침과 국제 연합군의 참전", rethought: "1953년에 전쟁이 끝난 게 아니라 멈췄다", nextQuestion: "정전과 종전은 어떻게 다를까요?" }`;

  const STR = { type: "string" };
  // 세 줄 정리는 칸마다 이름을 붙여 받습니다. 배열 자리로만 받으면 AI가 학생이 말한 3가지를
  // 그대로 옮겨 적어 셋째 줄이 질문이 아니게 되는 일이 잦았습니다(실제 AI 점검).
  const SUMMARY = {
    type: "object",
    properties: {
      learned: { type: "string", description: "알게 된 것: 학생이 맞게 말한 교과서 내용 1문장, 30자 안팎(40자를 넘으면 안 됨)" },
      rethought: { type: "string", description: "다시 생각한 것: 고친 생각, 끝까지 지킨 생각, 또는 학생이 댄 근거 1문장, 30자 안팎(40자를 넘으면 안 됨)" },
      nextQuestion: { type: "string", description: "다음 시간 확인할 것: 물음표로 끝나는 존댓말 질문 1개(\"~까요?\"처럼 요?로 끝남), 30자 안팎(40자를 넘으면 안 됨)" },
    },
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

  // 질문이 검사에 걸려 다시 받을 때 쓰는 형식: 질문만 낼 수 있습니다(판정으로 넘어가지 못하게).
  SCHEMAS.question = {
    ...SCHEMAS.next,
    properties: { ...SCHEMAS.next.properties, stage: { type: "string", enum: ["question"] }, verdict: { type: "string", enum: ["none"] } },
  };

  const MODE_TEXT ={ counter: "반례로 묻기", reason: "이유 묻기", retry: "다시 말해 보게 하기" };

  // 이름 붙은 세 칸을 화면과 검사가 쓰는 세 줄 배열로 바꿉니다.
  function toLines(out) {
    const s = out && out.summary;
    if (!s || Array.isArray(s) || typeof s !== "object") return out;
    return { ...out, summary: [s.learned, s.rethought, s.nextQuestion] };
  }

  function initialState() {
    return {
      phase: "input", items: [], checks: null, target: null, mode: null, turns: [],
      question: null, maxQuestions: 3, verdict: null, summary: null, error: null,
      misconception: null, // 선생님 도움말에 쓰는 오개념 id(고른 교과서 범위 안일 때만)
      fallbacks: 0, // 검사에 두 번 걸려 기본값으로 대신한 횟수(점검 페이지가 봅니다)
    };
  }

  // 오늘 차시 교과서 원문이 있으면 시스템 프롬프트 뒤에 붙이고 캐시합니다(같은 차시 동안 매번 같은 글).
  function systemFor(sourceText) {
    const text = typeof sourceText === "string" ? sourceText.trim() : "";
    if (!text) return SYSTEM_PROMPT;
    return [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `[오늘 차시 교과서 원문]
${text}`, cache_control: { type: "ephemeral" } },
    ];
  }

  function createSession({ topic, textbookId, lessonId = null, llm, sourceText = null }) {
    const context = T.buildContext(topic, textbookId, lessonId);
    const system = systemFor(sourceText);
    const scopeMiscIds = new Set(T.scopeFor(topic, textbookId, lessonId).misconceptions.map((m) => m.id));
    let state = initialState();
    let generation = 0; // cancel() 때마다 올려서 늦게 온 응답을 버립니다
    let lastAction = null;

    const snapshot = () => JSON.parse(JSON.stringify(state));

    // 메시지는 두 블록입니다. 첫 블록(단원 개념)은 같은 차시 동안 늘 같아서 캐시해 두고 싸게 다시 읽고,
    // 둘째 블록에는 학생마다 바뀌는 글만 둡니다. 글의 차례는 캐시 전과 같습니다(차례를 바꾸면 판단이 달라졌음).
    function buildMessage(task, note = "") {
      const lines = ["[학생이 말한 배운 3가지]"];
      state.items.forEach((it, i) => lines.push(`${i}. ${it}`));
      if (state.mode) {
        lines.push("", `[대상 항목] ${state.target}번 / 방식: ${MODE_TEXT[state.mode]}`);
      }
      if (state.turns.length) {
        lines.push("", "[지금까지의 문답]");
        state.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `학생 답${i + 1}: ${t.a}`));
      }
      lines.push("", `지금 할 일: ${task}`);
      if (note) lines.push("", note);
      return [
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
        { type: "text", text: lines.join("\n") },
      ];
    }

    // 앞에서 한 질문을 그대로 되풀이하면 문답이 나아가지 않습니다(띄어쓰기만 다른 것도 같은 질문으로 봅니다).
    const squash = (q) => String(q).replace(/\s+/g, "");
    function checkStep(out, allowedStages) {
      const v = G.validateStep(out, allowedStages);
      if (v.ok && out.stage === "question" && state.turns.some((t) => squash(t.q) === squash(out.question)))
        return { ok: false, reason: "앞에서 한 질문과 같음 — 학생의 마지막 답에 맞춰 다른 질문을 낼 것" };
      return v;
    }

    // AI를 부르고 검사합니다. 검사에 걸리면 까닭을 알려 주고 다시 받습니다(질문은 두 번, 세 줄 정리는 세 번까지).
    // 그래도 걸리면 null을 돌려줍니다. AI 오류는 그대로 throw합니다.
    async function callChecked(task, schema, allowedStages) {
      const gen = generation;
      let content = buildMessage(task);
      for (let attempt = 1; ; attempt++) {
        const out = toLines(await llm.call({ system, messages: [{ role: "user", content }], schema }));
        if (gen !== generation) throw CANCELLED; // 기다리는 동안 [다음 학생]을 눌렀으면 결과를 버립니다
        const v = checkStep(out, allowedStages);
        if (v.ok) return out;
        const stage = out && out.stage;
        if (attempt >= (stage === "verdict" ? 3 : 2)) break;
        if (stage === "verdict") {
          content = buildMessage(task, `[앞 응답이 검사에 걸렸어요: ${v.reason}] 판정은 그대로 두고 이 점만 고쳐 다시 내세요.`);
        } else if (stage === "question") {
          // 질문이 걸렸을 때 까닭만 알리면 AI가 질문 대신 판정으로 넘어가 버리는 일이 있어(차시별 테스트),
          // 다시 낼 때는 질문만 낼 수 있는 형식으로 받습니다.
          content = buildMessage(task, `[앞 응답의 질문이 검사에 걸렸어요: ${v.reason}] 질문만 고쳐 다시 내세요.`);
          schema = SCHEMAS.question;
          allowedStages = ["question"];
        } else if (stage === "check") {
          content = buildMessage(task, `[앞 응답이 검사에 걸렸어요: ${v.reason}] 이 점만 고쳐 다시 내세요.`);
        }
      }
      state.fallbacks++;
      return null;
    }

    function applyVerdict(out) {
      state.verdict = out ? out.verdict : "hold";
      state.summary = out ? out.summary.map((s) => s.trim()) : G.DEFAULT_SUMMARY.slice();
      state.question = null;
      state.phase = "done";
    }

    async function doCheck() {
      const out = await callChecked(
        'stage "check" — 세 항목을 확인하고 target, mode, 첫 질문을 정하세요.',
        SCHEMAS.check, ["check"]);
      if (out) {
        Object.assign(state, { checks: out.checks, target: out.target, mode: out.mode, question: out.question.trim() });
        state.misconception = scopeMiscIds.has(out.misconception) ? out.misconception : null;
      } else {
        Object.assign(state, { checks: ["think", "think", "think"], target: 0, mode: "counter", question: G.DEFAULT_QUESTION });
      }
      state.maxQuestions = state.mode === "reason" ? 2 : 3;
      state.phase = "asking";
    }

    async function doNext() {
      const left = state.maxQuestions - state.turns.length;
      const out = await callChecked(
        `학생의 마지막 답을 보고, 판정할 만큼 분명하면 stage "verdict"로 판정과 세 줄 정리를, 아니면 stage "question"으로 다음 질문 1개를 내세요. 남은 질문은 ${left}번입니다.`,
        SCHEMAS.next, ["question", "verdict"]);
      if (out && out.stage === "verdict") return applyVerdict(out);
      state.question = out ? out.question.trim() : G.DEFAULT_QUESTION;
      state.phase = "asking";
    }

    async function doVerdict() {
      const out = await callChecked('stage "verdict" — 판정과 세 줄 정리를 내세요.', SCHEMAS.verdict, ["verdict"]);
      applyVerdict(out);
    }

    // action을 실행합니다. 처리 중 표시, 오류 처리, 취소된 세션의 늦은 응답 버리기를 맡습니다.
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

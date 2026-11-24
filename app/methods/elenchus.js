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
2. 정답이나 설명을 말하지 않습니다. 질문은 1문장, 40자 이내, 물음표(?)로 끝냅니다. 질문 안에 마침표나 느낌표를 넣지 않습니다.
3. 5학년이 아는 쉬운 낱말과 존댓말을 씁니다.
4. 맞는 지식에는 반례를 던지지 않습니다. 반례는 target 1개에만 씁니다.
5. [같은 뜻으로 인정할 말]에 있는 표현은 같은 말로 봅니다. 맞춤법과 띄어쓰기는 문제 삼지 않습니다.
6. 오늘 주제와 관계없는 입력(장난, 빈말)에는 반례를 던지지 않습니다.
7. 세 줄 정리는 각 줄 40자 이내로, 학생이 한 말을 바탕으로 씁니다. 학생이 깨닫지 못한 정답을 정리에 적어 주지 않습니다. 셋째 줄 "다음 시간 확인할 것"은 물음표로 끝나는 질문으로 씁니다. 자세한 것은 아래 [세 줄 정리 쓰는 법]을 따릅니다.
8. 출력은 주어진 JSON 형식 하나만 냅니다. 쓰지 않는 칸은 question "", verdict "none", summary [] 로 둡니다.
9. 맞는지 판단할 때도 주어진 [전체 개념]만 근거로 삼고, 따로 아는 지식은 쓰지 않습니다.
10. "틀렸", "정답은", "오답" 같은 말은 쓰지 않습니다.

내용 확인(stage "check")에서 정할 것:
- checks: 세 항목마다 "ok"(전체 개념과 맞음), "think"(오개념이 의심되거나 다시 생각해 볼 것), "outside"(사실일 수 있지만 전체 개념 어디에도 없음) 중 하나
- target(0, 1, 2 중 하나)과 mode를 이 순서로 고릅니다.
  1) 오개념이 의심되는 항목이 있으면 그 항목, mode "counter" (여럿이면 [오늘 차시] 개념과 관계있는 항목)
  2) 없고 오늘 주제와 관계없는 항목이 있으면 그 항목, mode "retry" — "오늘 배운 것 중에서 하나 더 말해 볼까요?"처럼 다시 말해 보게 합니다
  3) 세 항목이 모두 "outside"이면 첫 항목, mode "retry"
  4) 모두 맞으면 이유가 [반례에 쓸 수 있는 범위]에 나와 있는 항목, mode "reason" — "왜 그렇게 되었을까요?"처럼 이유를 묻습니다. 교과서에 까닭이 나오지 않는 것(예: 작전이 성공한 까닭)은 묻지 않습니다
- misconception: target이 [반례에 쓸 수 있는 범위]의 흔한 오개념에 해당하면 그 id(예: "3-2.m01"), 아니면 "none"
- question: 첫 질문

판정(stage "verdict"):
- "strong"(튼튼한 생각): 학생이 반례에도 교과서 근거를 대며 생각을 지켰거나, 이유를 근거 있게 설명했습니다.
- "revisit"(다시 볼 생각): 학생이 "그러면 아닌가?"처럼 스스로 허점을 인정했습니다. 학생이 처음 말한 대상 항목을 고쳐 말하면(예: "아, 군인만이 아니었네요") 근거를 함께 말했더라도 "strong"이 아니라 "revisit"입니다.
- "hold"(판정 보류): 어느 쪽도 아니거나, 끝까지 오늘 주제와 관계있는 내용이 나오지 않았습니다. 학생이 근거 없이 "제 말이 맞아요"처럼 처음 생각을 끝까지 고집하면, 그 생각이 다시 봐야 할 생각이더라도 "revisit"이나 "strong"이 아니라 "hold"입니다("revisit"은 학생이 스스로 고쳐 말했을 때만 줍니다).
- 이유 묻기(mode "reason")에서 학생 답이 맞는 방향이지만 교과서 근거(까닭)가 빠졌으면, 바로 판정하지 말고 정답을 말하지 않은 채 그 까닭을 스스로 찾게 하는 질문을 한 번 더 합니다(예: "나라를 구하기 위해서" → "무엇으로부터 나라를 구하려 했을까요?").
- summary: [알게 된 것, 다시 생각한 것, 다음 시간 확인할 것] 세 줄

[세 줄 정리 쓰는 법]
- 학생에게 보여 주는 글입니다. "학생이", "학생은" 같은 3인칭을 쓰지 않고, 줄 앞에 칸 이름(예: "알게 된 것:")을 붙이지 않습니다.
- 첫째 줄 "알게 된 것": 학생이 문답이나 배운 3가지에서 맞게 말한 교과서 내용만 적습니다. 학생이 하지 않은 말을 보태지 않고, 오개념은 적지 않습니다. 그런 내용이 없으면 "오늘 배운 내용을 아직 말로 꺼내지 못했어요"처럼 씁니다.
- 둘째 줄 "다시 생각한 것":
  · 다시 볼 생각(revisit): 학생이 고쳐 말한 고친 생각 자체를 사실 문장으로 씁니다. "처음에는", "고쳤다", "생각했다" 같은 말은 쓰지 않습니다(예: "처음에는 대통령 선거라고 생각했다"가 아니라 "5·10 총선거로는 국회의원을 뽑았다").
  · 판정 보류(hold)에서 학생이 생각을 바꾸지 않았으면, 학생이 말한 생각을 그대로 "~라고 생각했어요"로 적습니다. 학생이 깨닫지 않은 바른 생각을 학생이 깨달은 것처럼 적지 않습니다.
  · 튼튼한 생각(strong): 학생이 댄 근거를 적습니다.
- 셋째 줄 "다음 시간 확인할 것": 오늘 주제와 관계있는, 물음표로 끝나는 질문 1개입니다.

예시(천재교과서):
학생: ① 북한이 남침했다 ② 유엔군이 도와주었다 ③ 전쟁은 1953년에 끝났다
확인: checks ["ok","ok","think"], target 2, mode "counter", misconception "3-2.m01", question "1953년에 맺은 협정의 이름은 무엇이었나요?"
학생 답: 정전 협정이요. → 다음 질문: "정전은 전쟁을 끝낸 것일까요, 멈춘 것일까요?"
학생 답: 아, 멈춘 거예요. 그럼 끝난 건 아니네요. → 판정 "revisit", summary ["북한의 남침과 국제 연합군의 참전", "1953년에 전쟁이 끝난 게 아니라 멈췄다", "정전과 종전은 어떻게 다를까요?"]`;

  const STR = { type: "string" };
  const SCHEMAS = {
    check: {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["check"] },
        checks: { type: "array", items: { type: "string", enum: ["ok", "think", "outside"] } },
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
        summary: { type: "array", items: STR },
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
        summary: { type: "array", items: STR },
      },
      required: ["stage", "question", "verdict", "summary"],
      additionalProperties: false,
    },
  };

  const MODE_TEXT = { counter: "반례로 묻기", reason: "이유 묻기", retry: "다시 말해 보게 하기" };

  function initialState() {
    return {
      phase: "input", items: [], checks: null, target: null, mode: null, turns: [],
      question: null, maxQuestions: 3, verdict: null, summary: null, error: null,
      misconception: null, // 선생님 도움말에 쓰는 오개념 id(고른 교과서 범위 안일 때만)
      fallbacks: 0, // 검사에 두 번 걸려 기본값으로 대신한 횟수(점검 페이지가 봅니다)
    };
  }

  function createSession({ topic, textbookId, lessonId = null, llm }) {
    const context = T.buildContext(topic, textbookId, lessonId);
    const scopeMiscIds = new Set(T.scopeFor(topic, textbookId, lessonId).misconceptions.map((m) => m.id));
    let state = initialState();
    let generation = 0; // cancel() 때마다 올려서 늦게 온 응답을 버립니다
    let lastAction = null;

    const snapshot = () => JSON.parse(JSON.stringify(state));

    function buildMessage(task) {
      const lines = [context, "", "[학생이 말한 배운 3가지]"];
      state.items.forEach((it, i) => lines.push(`${i}. ${it}`));
      if (state.mode) {
        lines.push("", `[대상 항목] ${state.target}번 / 방식: ${MODE_TEXT[state.mode]}`);
      }
      if (state.turns.length) {
        lines.push("", "[지금까지의 문답]");
        state.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `학생 답${i + 1}: ${t.a}`));
      }
      lines.push("", `지금 할 일: ${task}`);
      return lines.join("\n");
    }

    // AI를 부르고 검사합니다. 검사에 두 번 걸리면 null을 돌려줍니다. AI 오류는 그대로 throw합니다.
    async function callChecked(task, schema, allowedStages) {
      const gen = generation;
      let content = buildMessage(task);
      for (let attempt = 0; attempt < 2; attempt++) {
        const out = await llm.call({ system: SYSTEM_PROMPT, messages: [{ role: "user", content }], schema });
        if (gen !== generation) throw CANCELLED; // 기다리는 동안 [다음 학생]을 눌렀으면 결과를 버립니다
        const v = G.validateStep(out, allowedStages);
        if (v.ok) return out;
        // 세 줄 정리가 걸렸을 때만 까닭을 알려 줍니다. 질문이 걸렸을 때 까닭을 알리면
        // AI가 질문 대신 판정으로 넘어가 버리는 일이 있어(차시별 테스트), 그때는 같은 요청을 다시 보냅니다.
        if (out && out.stage === "verdict")
          content = `${buildMessage(task)}\n\n[앞 응답이 검사에 걸렸어요: ${v.reason}] 판정은 그대로 두고 이 점만 고쳐 다시 내세요.`;
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

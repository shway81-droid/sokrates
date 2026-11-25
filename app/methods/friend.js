// 모르는 친구 학습정리: 학생이 오늘 배운 것을 설명하면, AI가 "잘 모르는 친구"가 되어 엉뚱한 질문을 하고 학생이 다시 설명합니다.
// 질문 수·질문 종류·끝내는 때·검사 실패 처리는 이 코드가 정하고, AI는 JSON만 돌려줍니다(엘렌코스와 같은 원칙).
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const G = isNode ? require("../core/guard.js") : root.SokGuard;
  const T = isNode ? require("../core/topic.js") : root.SokTopic;
  const U = isNode ? require("../core/ui.js") : root.SokUI;

  const ERROR_MESSAGE = "AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요.";

  // 질문 종류: 뜻·까닭 묻기, 더 말해 달라기, 다시 말해 보기, 잘못 알아듣기
  const KINDS = ["meaning", "more", "retry", "mixup"];
  // 질문마다 붙는 표시. 빨간색·점수 대신 이 세 가지 말만 씁니다.
  const MARK_TEXT = { explained: "잘 설명했어요", corrected: "친구를 바로잡았어요", together: "함께 더 알아봐요" };
  const marksFor = (kind) => (kind === "mixup" ? ["corrected", "together"] : ["explained", "together"]);

  // 검사에 두 번 걸리면 쓰는 기본값
  const DEFAULT_QUESTION = { meaning: "조금 더 자세히 알려 줄래요?", more: "그래서 어떻게 되었는지 더 알려 줄래요?", retry: "오늘 배운 것 하나만 알려 줄래요?" };
  // "몰라요"나 아주 짧은 설명이면 첫 기본 질문을 "오늘 배운 것 하나만"으로 합니다.
  const SHORT_OR_UNKNOWN = (t) => G.charLen(String(t).replace(/\s/g, "")) <= 6 || /몰라|모르/.test(t);
  const DEFAULT_FINISH = { thanks: "설명해 줘서 고마워요!", nextQuestion: "오늘 배운 것을 다음 시간에 다시 말해 볼까요?" };

  const REACTION_MAX = 20;
  const THANKS_MAX = 40;
  // 반응에 칭찬·맞장구가 들어가면, 학생이 틀린 말을 했을 때도 "맞아요"가 나올 수 있어 막습니다.
  // "맞아"는 칭찬·맞장구일 때만 잡습니다("총에 맞아서", "비를 맞아도"는 다치다·맞다 뜻이라 통과).
  const PRAISE = /맞(?:아|네|죠|습니다|군요|구나)(?![서도야])|잘했|정답|훌륭/;
  // 반응도 질문처럼 존댓말로 씁니다. 쉼표·마침표·느낌표로 나눈 마디마다 끝을 봅니다.
  // "아", "오" 같은 한 글자 감탄사와 "우와", "아하" 같은 감탄사는 통과, "~니다"는 존댓말이라 통과합니다.
  const CASUAL_END = /(구나|구먼|군|네|어|아|야|지|다|래|해|려|워|라|봐|돼|줘|걸|데)$/;
  const INTERJECTION = new Set(["아하", "우와", "와아", "이야", "어머", "오오", "아아", "오호", "어라"]);
  const isCasual = (r) => String(r).split(/[,.!~…]+/).map((c) => c.replace(/\s/g, "")).some((c) =>
    c === "응" || (G.charLen(c) >= 2 && !INTERJECTION.has(c) && !/니다$/.test(c) && CASUAL_END.test(c)));
  const THIRD_PERSON = /^학생(이|은|의|도|에게)\s/;
  // 둘 중 하나를 고르게 하는 질문. 고르게 하면 답을 알려 주는 셈입니다.
  // - "~까요, ~까요?"처럼 묻는 말 두 개(앞의 "있잖아요,", "그런데요," 같은 이어 주는 말은 빼고)
  // - "~일까, ~일까요?", "~일까요 ~일까요?"
  const CHOICE_TWO = /(까요|나요|예요|에요|(?<!잖)[어아해]요|가요)\s*,.*요\s*[?？]\s*$/;
  const CHOICE_ILKKA = /(일까|인가)\S*\s*,?\s*.+(일까요|인가요)\s*[?？]\s*$/;
  const isChoice = (q) => CHOICE_TWO.test(q) || CHOICE_ILKKA.test(q);

  const STR = { type: "string" };
  // 호출마다 고를 수 있는 종류와 표시를 좁혀 형식을 만듭니다(코드가 흐름을 정함).
  function schemaFor({ stage, kinds = [], prevKind = null }) {
    const mark = { type: "string", enum: prevKind ? marksFor(prevKind) : ["none"] };
    if (stage === "finish") {
      return {
        type: "object",
        properties: {
          stage: { type: "string", enum: ["finish"] },
          mark,
          thanks: { type: "string", description: `친구의 한마디: 학생 덕분에 알게 된 것 1문장, ${THANKS_MAX}자 이내. 학생이 맞게 설명한 것만` },
          nextQuestion: { type: "string", description: "다음 시간 확인할 것: \"~까요?\"처럼 요?로 끝나는 질문 1개, 40자 이내" },
        },
        required: ["stage", "mark", "thanks", "nextQuestion"],
        additionalProperties: false,
      };
    }
    return {
      type: "object",
      properties: {
        stage: { type: "string", enum: ["ask"] },
        mark,
        kind: { type: "string", enum: kinds.slice() },
        misconception: STR,
        reaction: { type: "string", description: `학생의 앞 답을 받는 친구의 짧은 한마디, ${REACTION_MAX}자 이내, "아, 그렇군요!"처럼 존댓말로, 물음표·칭찬·정답 없이. 없으면 ""` },
        question: { type: "string", description: "친구의 질문 1문장, 40자 이내, \"요?\"로 끝나는 존댓말" },
      },
      required: ["stage", "mark", "kind", "misconception", "reaction", "question"],
      additionalProperties: false,
    };
  }

  const squash = (q) => String(q).replace(/\s+/g, "");
  const hasForbidden = (s) => G.FORBIDDEN.some((w) => s.includes(w));
  const fail = (reason) => ({ ok: false, reason });

  // expect = { stage, kinds, prevKind, scopeMisc:Set, usedMisc:Set, asked:string[] }
  function validateFriendStep(out, expect) {
    if (!out || typeof out !== "object") return fail("객체가 아님");
    if (out.stage !== expect.stage) return fail(`허용되지 않은 단계: ${out.stage}`);
    const marks = expect.prevKind ? marksFor(expect.prevKind) : ["none"];
    if (!marks.includes(out.mark)) return fail(`앞 질문의 표시가 맞지 않음 — ${marks.join(" 또는 ")} 중 하나로 낼 것`);

    if (expect.stage === "finish") {
      const t = typeof out.thanks === "string" ? out.thanks.trim() : "";
      if (!t) return fail("친구의 한마디가 비어 있음");
      if (G.charLen(t) > THANKS_MAX) return fail(`친구의 한마디가 ${G.charLen(t)}자로 ${THANKS_MAX}자를 넘음 — 더 짧게 줄일 것`);
      if (hasForbidden(t)) return fail("친구의 한마디에 금지어 포함");
      if (THIRD_PERSON.test(t)) return fail("친구의 한마디를 '학생이'처럼 3인칭으로 씀 — 친구가 학생에게 하는 말로 쓸 것");
      const q = G.checkQuestion(out.nextQuestion);
      if (!q.ok) return fail(`다음 시간 확인할 것: ${q.reason}`);
      if (isChoice(out.nextQuestion)) return fail("다음 시간 확인할 것이 둘 중 하나를 고르게 하는 질문임 — 까닭이나 결과를 생각하게 하는 질문 하나로 쓸 것");
      return { ok: true };
    }

    if (!(expect.kinds || []).includes(out.kind)) return fail(`질문 종류 ${out.kind}는 지금 쓸 수 없음 — ${expect.kinds.join(", ")} 중 하나`);
    if (out.kind === "mixup") {
      if (!expect.scopeMisc.has(out.misconception)) return fail(`오개념 id ${out.misconception}가 범위에 없음 — [반례에 쓸 수 있는 범위]의 흔한 오개념 id를 쓸 것`);
      if (expect.usedMisc.has(out.misconception)) return fail(`오개념 ${out.misconception}는 앞에서 썼음 — 다른 오개념을 쓸 것`);
    }
    const q = G.checkQuestion(out.question);
    if (!q.ok) return fail(q.reason);
    if (isChoice(out.question)) return fail("둘 중 하나를 고르게 하는 질문임 — 질문 하나로만 물을 것");
    if ((expect.asked || []).some((a) => squash(a) === squash(out.question)))
      return fail("앞에서 한 질문과 같음 — 학생의 마지막 답에 맞춰 다른 질문을 낼 것");
    const r = typeof out.reaction === "string" ? out.reaction.trim() : "";
    if (G.charLen(r) > REACTION_MAX) return fail(`반응이 ${G.charLen(r)}자로 ${REACTION_MAX}자를 넘음 — 더 짧게 하거나 비울 것`);
    if (/[?？]/.test(r)) return fail("반응에 물음표가 있음 — 질문은 question 칸에만 쓸 것");
    if (PRAISE.test(r) || hasForbidden(r)) return fail("반응에 칭찬·맞장구·정답 말이 있음 — '아, 그렇군요!'처럼 느낌만 쓰거나 비울 것");
    if (isCasual(r)) return fail("반응이 반말임 — '아, 그렇군요!', '음, 헷갈려요.'처럼 질문과 같은 존댓말로 쓰거나 비울 것");
    return { ok: true };
  }

  const SYSTEM_PROMPT = `당신은 초등학교 5학년 사회 수업이 끝날 때, 학생의 설명을 듣는 "잘 모르는 친구"입니다.
학생이 오늘 배운 것을 설명하면, 친구는 호기심 많고 조금 엉뚱한 또래처럼 질문합니다. 학생은 친구에게 다시 설명하거나 친구의 잘못 알아들은 말을 바로잡으며, 자기가 이해한 것을 스스로 꺼내 보입니다.

규칙:
1. 친구는 답을 모르는 척합니다. 정답이나 설명을 말하지 않고, 학생이 하지 않은 사실을 먼저 꺼내지 않습니다.
2. 질문은 1문장, 30자 안팎으로 짧게(40자를 넘으면 안 됩니다) 쓰고, "~예요?", "~까요?", "~나요?"처럼 "요?"로 끝나는 존댓말로 냅니다. 질문 안에 마침표나 느낌표를 넣지 않습니다. 앞에서 한 질문을 되풀이하지 않습니다.
3. 5학년이 아는 쉬운 낱말을 씁니다.
4. 질문 재료는 [반례에 쓸 수 있는 범위]의 개념과 오개념 안에서만 고릅니다. 맞는지 판단할 때는 [오늘 차시 교과서 원문](주어졌을 때)과 [전체 개념]만 근거로 삼고, 따로 아는 지식은 쓰지 않습니다. 표현이 달라도 원문이나 개념과 뜻이 같으면 맞는 것으로 봅니다. 원문보다 덜 자세하거나 낱말이 조금 다른 것도 맞는 쪽으로 봅니다. [같은 뜻으로 인정할 말]은 같은 말로 보고, 맞춤법과 띄어쓰기는 문제 삼지 않습니다.
5. 퀴즈를 내지 않습니다. 이름, 연도, 숫자, 낱말 뜻처럼 외운 것을 맞히게 하는 질문("~의 이름은 무엇이에요?", "몇 년이에요?")은 쓰지 않습니다. 학생이 설명에서 이미 쓴 낱말의 뜻이나 까닭을 묻는 것은 괜찮습니다.
6. "틀렸", "정답은", "오답" 같은 말은 쓰지 않습니다. 학생이 잘못했다는 느낌을 주는 말도 쓰지 않습니다.
7. 출력은 주어진 JSON 형식 하나만 냅니다. 쓰지 않는 칸은 misconception "none", reaction "" 로 둡니다.

질문 종류(kind): 지금 할 일에 적힌 종류 중에서만 고릅니다.
- "meaning"(뜻·까닭 묻기): 학생 설명이나 답에 나온 낱말의 뜻이나 일의 까닭을 순진하게 묻습니다(예: "정전이 뭐예요?", "왜 중국에서 정부를 만들었어요?"). 교과서(원문·개념)에 그 뜻이나 까닭이 나오는 것만 묻습니다.
- "more"(더 말해 달라기): 설명이 한두 낱말로 짧을 때 조금 더 말해 달라고 합니다(예: "그래서 어떻게 되었는지 더 알려 줄래요?").
- "retry"(다시 말해 보기): 설명이 오늘 주제와 관계없거나 "몰라요"뿐일 때, 오늘 배운 것 하나를 말해 보게 합니다(예: "오늘 무엇을 배웠는지 하나만 알려 줄래요?").
- "mixup"(잘못 알아듣기): 친구가 학생 설명을 [흔한 오개념]의 틀린 생각 쪽으로 엉뚱하게 받아들여, 그 틀린 생각을 믿는 말투로 되묻습니다(예: 학생 "많은 사람이 다쳤어요" → "그럼 싸운 군인들만 다친 거예요?"). 학생 설명이나 답에 나온 말과 이어지는 오개념을 고르고, [흔한 오개념(오늘 차시)]을 [흔한 오개념(앞 차시)]보다 먼저 씁니다. 학생이 말하지 않은 화제의 오개념은 쓰지 않습니다(안 됨: 쌀 이야기를 한 적 없는 학생에게 "쌀 생산을 늘렸으면 살림이 넉넉해졌어요?"). 고를 수 있는 종류에 "meaning"도 있는데 이어지는 오개념이 없으면 "meaning"을 고릅니다. "mixup"만 고를 수 있으면 오늘 차시 오개념 중 학생이 말한 주제와 가장 가까운 것을 씁니다. 바른 생각은 질문에 넣지 않습니다. misconception 칸에 그 오개념 id(예: "3-2.m06")를 적습니다. [이미 쓴 오개념]은 다시 쓰지 않습니다.
- 학생이 맞장구친 오개념(표시 "together")의 바른 생각은 다음 질문, 반응, 한마디 어디에도 넣지 않습니다. 고쳐 주는 것은 선생님 몫입니다(안 됨: 학생이 "네"라고 의병이 약해졌다는 말에 맞장구친 뒤 "의병은 왜 군인이 들어오면 더 거세졌어요?").
- 학생이 "몰라요"라고 하면 같은 것을 다시 묻지 말고, 그 사실을 몰라도 답할 수 있는 더 쉬운 질문으로 바꿉니다.
- 학생이 되물으면(예: "다른 나라도 왔어요?") 답을 알려 주지 않습니다. 반응으로 "나도 궁금해요"처럼 받고 다음 질문을 이어 갑니다.

표시(mark): 학생의 마지막 답에 붙입니다. 앞 질문이 없으면 "none"입니다.
- "explained"(잘 설명했어요): meaning·more·retry 질문에 원문이나 개념과 맞는 설명을 했습니다. 덜 자세해도 맞는 쪽이면 여기입니다.
- "corrected"(친구를 바로잡았어요): mixup 질문에 친구의 틀린 생각을 받아들이지 않고, 바른 생각이나 그 까닭을 말했습니다. "아니에요"만 하고 바른 생각이나 까닭이 없으면 여기가 아닙니다.
- "together"(함께 더 알아봐요): 위 둘이 아닙니다. "몰라요", 친구의 틀린 생각에 맞장구친 답(예: "네, 군인만 다쳤어요"), 원문과 어긋나는 설명, 관계없는 말, 되물음이 여기입니다.
- mixup 질문의 표시는 "corrected"나 "together", 그 밖의 질문의 표시는 "explained"나 "together"만 씁니다.

반응(reaction): 질문 앞에 붙는 친구의 짧은 한마디입니다. 20자 이내, 물음표 없이, 비워 두어도 됩니다.
- 느낌만 씁니다(예: "아, 그렇군요!", "음, 헷갈려요.", "괜찮아요, 나도 잘 몰라요."). 학생 말을 따라 하는 것은 괜찮습니다.
- 질문처럼 존댓말로 씁니다. 반말 혼잣말은 쓰지 않습니다(안 됨: "아, 그렇구나!", "신기하네!", "몰랐어.").
- 정답이나 학생이 하지 않은 사실을 넣지 않습니다. "맞아요", "잘했어요" 같은 칭찬이나 맞장구도 쓰지 않습니다. 학생이 틀린 말을 했을 때도 맞다고 하게 되기 때문입니다.
- 학생이 장난치거나 오늘 주제와 관계없는 말을 하면, 맞장구치거나 재미있다고 하지 않고(안 됨: "재미있는 얘기네요!") "음, 나는 잘 모르겠어요."처럼 담담하게 받습니다.

끝낼 때(stage "finish"):
- thanks(친구의 한마디): 친구가 학생 덕분에 알게 된 것을 1문장, 40자 이내로 말합니다(예: "덕분에 휴전선이 왜 있는지 알았어요!"). 학생이 실제로 맞게 설명한 것만 넣고, 학생이 깨닫지 못한 정답은 넣지 않습니다. 맞게 설명한 것이 없으면 "우리 같이 더 알아봐요!"처럼 쓰고, 바른 내용을 덧붙이지 않습니다(안 됨: "우리 같이 더 알아봐요! 광주 학생 항일 운동은 여러 곳으로 퍼졌대요."). "학생이" 같은 3인칭을 쓰지 않습니다.
- nextQuestion(다음 시간 확인할 것): 오늘 주제와 관계있는, "요?"로 끝나는 질문 1개, 40자 이내입니다. 외운 이름·장소·연도를 묻지 않고 까닭이나 결과를 생각하게 하는 질문으로 씁니다. "~일까요, ~일까요?"처럼 둘 중 하나를 고르게 하는 질문은 쓰지 않습니다.

예시(천재교과서, 6·25 전쟁):
학생의 설명: 북한이 쳐들어와서 전쟁이 났고 많은 사람이 다쳤어요.
첫 질문: kind "meaning", reaction "", question "전쟁이 나면 왜 사람들이 다쳐요?"
학생 답: 마을에서도 싸워서 집이 부서지고 사람들이 다쳤어요.
다음 질문: mark "explained", kind "mixup", misconception "3-2.m06", reaction "아, 그렇군요!", question "그럼 싸운 군인들만 다친 거예요?"
학생 답: 아니에요. 피란 가던 보통 사람들도 많이 다쳤어요.
다음 질문: mark "corrected", kind "meaning", reaction "몰랐어요!", question "피란은 왜 가야 했어요?"
학생 답: 몰라요.
끝: mark "together", thanks "덕분에 보통 사람들도 다쳤다는 걸 알았어요!", nextQuestion "사람들은 왜 피란을 떠났을까요?"`;

  const KIND_TEXT = { meaning: "뜻·까닭 묻기", more: "더 말해 달라기", retry: "다시 말해 보기", mixup: "잘못 알아듣기" };
  const CANCELLED = Symbol("cancelled");

  function initialState() {
    return {
      phase: "input", explanation: "", turns: [], // turns: [{ q, kind, misconception, reaction, a, mark }]
      question: null, kind: null, misconception: null, reaction: "",
      maxQuestions: 3, thanks: null, nextQuestion: null, error: null,
      fallbacks: 0, // 검사에 걸려 기본값으로 대신한 횟수(점검 페이지가 봅니다)
    };
  }

  // 오늘 차시 교과서 원문이 있으면 시스템 프롬프트 뒤에 붙이고 캐시합니다(엘렌코스와 같은 차례).
  function systemFor(sourceText) {
    const text = typeof sourceText === "string" ? sourceText.trim() : "";
    if (!text) return SYSTEM_PROMPT;
    return [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `[오늘 차시 교과서 원문]\n${text}`, cache_control: { type: "ephemeral" } },
    ];
  }

  function createSession({ topic, textbookId, lessonId = null, llm, sourceText = null }) {
    const context = T.buildContext(topic, textbookId, lessonId);
    const system = systemFor(sourceText);
    const scopeList = T.scopeFor(topic, textbookId, lessonId).misconceptions;
    const scopeMisc = new Set(scopeList.map((m) => m.id));
    const miscById = new Map(scopeList.map((m) => [m.id, m]));
    let state = initialState();
    let generation = 0; // cancel() 때마다 올려서 늦게 온 응답을 버립니다
    let lastAction = null;

    const snapshot = () => JSON.parse(JSON.stringify(state));
    const usedMisc = () => new Set(state.turns.map((t) => t.misconception).filter(Boolean));
    const freeMisc = () => [...scopeMisc].filter((id) => !usedMisc().has(id));

    // 첫 블록(단원 맥락)은 같은 차시 동안 늘 같아서 캐시하고, 둘째 블록에는 학생마다 바뀌는 글만 둡니다.
    function buildMessage(task, note = "") {
      const lines = ["[학생의 설명]", state.explanation];
      if (state.turns.length) {
        lines.push("", "[지금까지의 문답]");
        state.turns.forEach((t, i) => {
          const misc = t.misconception ? `, 오개념 ${t.misconception}` : "";
          lines.push(`질문${i + 1}(${KIND_TEXT[t.kind]}${misc}): ${t.q}`, `학생 답${i + 1}: ${t.a}`);
          if (t.mark) lines.push(`표시${i + 1}: ${t.mark}`);
        });
      }
      const used = [...usedMisc()];
      if (used.length) lines.push("", `[이미 쓴 오개념] ${used.join(", ")}`);
      lines.push("", `지금 할 일: ${task}`);
      // 학생이 맞장구친 오개념은 그 뒤 모든 호출에서 바른 생각을 넣지 말라고 콕 집어 알립니다(끝맺음 포함).
      const agreed = state.turns.filter(agreedMixup).map(agreedNote);
      if (agreed.length) lines.push("", ...agreed);
      if (note) lines.push("", note);
      return [
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
        { type: "text", text: lines.join("\n") },
      ];
    }

    // AI를 부르고 검사합니다. 걸리면 까닭을 알려 주고 다시 받습니다(질문 2번, 끝 3번까지). 그래도 걸리면 { out: null }.
    // mark: 앞 답의 표시. 질문·반응·한마디가 걸려도 표시만은 맞았으면 그것을 씁니다(맞게 답한 학생을 "함께 더"로 바꾸지 않음).
    async function callChecked(task, expect, note = "") {
      const gen = generation;
      const schema = schemaFor(expect);
      const allowed = expect.prevKind ? marksFor(expect.prevKind) : [];
      let content = buildMessage(task, note);
      let mark = "together";
      const tries = expect.stage === "finish" ? 3 : 2;
      for (let attempt = 1; attempt <= tries; attempt++) {
        const out = await llm.call({ system, messages: [{ role: "user", content }], schema });
        if (gen !== generation) throw CANCELLED; // 기다리는 동안 [다음 학생]을 눌렀으면 결과를 버립니다
        const v = validateFriendStep(out, expect);
        if (v.ok) return { out, mark: out.mark };
        if (out && out.stage === expect.stage && allowed.includes(out.mark)) mark = out.mark;
        content = buildMessage(task, [note, `[앞 응답이 검사에 걸렸어요: ${v.reason}] 이 점만 고쳐 다시 내세요.`].filter(Boolean).join("\n"));
      }
      state.fallbacks++;
      return { out: null, mark };
    }

    const lastTurn = () => state.turns[state.turns.length - 1];
    const agreedMixup = (t) => t.kind === "mixup" && t.mark === "together" && miscById.has(t.misconception);
    function agreedNote(t) {
      const m = miscById.get(t.misconception);
      return `[주의] 학생이 방금 친구의 틀린 생각(오개념 ${m.id}: ${m.wrong})을 바로잡지 못했어요. 그 바른 생각("${m.truth}")이나 그것을 알려 주는 말은 질문·반응·한마디·다음 시간 확인할 것 어디에도 넣지 마세요. 맞장구친 것을 고쳐 주는 것은 선생님 몫이에요.`;
    }

    function applyAsk(out, kinds) {
      if (out) {
        Object.assign(state, { question: out.question.trim(), kind: out.kind, reaction: out.reaction.trim(),
          misconception: out.kind === "mixup" ? out.misconception : null });
      } else {
        // 기본 질문은 앞에서 한 질문과 겹치지 않게 고릅니다.
        const order = state.turns.length === 0 && SHORT_OR_UNKNOWN(state.explanation) ? ["retry", "meaning", "more"] : ["meaning", "more", "retry"];
        const asked = new Set(state.turns.map((t) => squash(t.q)));
        const kind = order.find((k) => !asked.has(squash(DEFAULT_QUESTION[k]))) || order[0];
        Object.assign(state, { question: DEFAULT_QUESTION[kind], kind, reaction: "", misconception: null });
      }
      state.phase = "asking";
    }

    // 질문 종류는 코드가 정합니다: 1번 뜻·까닭/더 말해/다시 말해, 2번 잘못 알아듣기, 3번 뜻·까닭이나 잘못 알아듣기
    function kindsFor(n) {
      const canMix = freeMisc().length > 0;
      if (n === 0) return ["meaning", "more", "retry"];
      if (n === 1) return canMix ? ["mixup"] : ["meaning"];
      return canMix ? ["meaning", "mixup"] : ["meaning"];
    }
    const expectAsk = (kinds, prevKind) => ({ stage: "ask", kinds, prevKind, scopeMisc, usedMisc: usedMisc(),
      asked: state.turns.map((t) => t.q).concat(state.question ? [state.question] : []) });
    const kindList = (kinds) => kinds.map((k) => `"${k}"(${KIND_TEXT[k]})`).join(", ");

    async function doFirst() {
      const kinds = kindsFor(0);
      const { out } = await callChecked(`stage "ask" — 학생의 설명을 읽고 첫 질문을 내세요. 질문 종류는 ${kindList(kinds)} 중 하나이고, mark는 "none"입니다.`,
        expectAsk(kinds, null));
      applyAsk(out, kinds);
    }

    async function doNext() {
      const n = state.turns.length;
      const kinds = kindsFor(n);
      const prev = lastTurn();
      const free = kinds.includes("mixup") ? ` 쓸 수 있는 오개념: ${freeMisc().join(", ")}.` : "";
      const ask = `질문 ${n + 1}을 내세요. 질문 종류는 ${kindList(kinds)} 중 하나입니다.${free} 남은 질문은 이것까지 ${state.maxQuestions - n}번입니다.`;
      let { out, mark } = await callChecked(`stage "ask" — 학생의 마지막 답에 표시(mark)를 붙이고, ${ask}`, expectAsk(kinds, prev.kind));
      prev.mark = mark;
      // 학생이 친구의 틀린 생각에 맞장구쳤으면, 같은 응답의 질문에 바른 생각이 섞이기 쉬워 콕 집어 다시 받습니다.
      if (agreedMixup(prev)) ({ out } = await callChecked(`stage "ask" — mark는 "none"으로 두고, ${ask}`, expectAsk(kinds, null)));
      applyAsk(out, kinds);
    }

    // answered: 마지막 질문에 학생이 답했으면 그 답에 표시를 받습니다([바로 정리하기]면 표시 없음).
    async function doFinish(answered) {
      const prevKind = answered ? lastTurn().kind : null;
      const markTask = answered ? "학생의 마지막 답에 표시(mark)를 붙이고," : 'mark는 "none"으로 두고,';
      const finishTask = "친구의 한마디(thanks)와 다음 시간 확인할 것(nextQuestion)을 내세요.";
      let { out, mark } = await callChecked(`stage "finish" — ${markTask} ${finishTask}`, { stage: "finish", prevKind });
      if (answered) {
        lastTurn().mark = mark;
        if (agreedMixup(lastTurn()))
          ({ out } = await callChecked(`stage "finish" — mark는 "none"으로 두고, ${finishTask}`, { stage: "finish", prevKind: null }));
      }
      const f = out || DEFAULT_FINISH;
      Object.assign(state, { thanks: f.thanks.trim(), nextQuestion: f.nextQuestion.trim(), question: null, kind: null, reaction: "", misconception: null, phase: "done" });
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
        if (root && root.console) root.console.warn("[모르는 친구] AI 호출 실패:", e && e.message);
      }
      return snapshot();
    }

    return {
      getState: snapshot,

      async submitExplanation(text) {
        if (state.phase !== "input") return snapshot();
        const t = String(text ?? "").trim();
        if (!t) throw new Error("설명을 적어 주세요.");
        state.explanation = t;
        return run(doFirst);
      },

      async submitAnswer(text) {
        if (state.phase !== "asking") return snapshot();
        const a = String(text ?? "").trim();
        if (!a) return snapshot();
        state.turns.push({ q: state.question, kind: state.kind, misconception: state.misconception, reaction: state.reaction, a, mark: null });
        return run(state.turns.length >= state.maxQuestions ? () => doFinish(true) : doNext);
      },

      async finishNow() {
        if (state.phase !== "asking") return snapshot();
        return run(() => doFinish(false));
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

  // 복사용 결과 글. 답하지 않은 질문은 turns 에 없으므로 나오지 않습니다.
  function resultText({ topicTitle, textbookName, dateStr, state }) {
    const lines = [`[모르는 친구 학습정리] ${topicTitle} · ${textbookName} · ${dateStr}`, "", "나의 설명", state.explanation];
    if (state.turns.length) {
      lines.push("", "친구와 나눈 이야기");
      state.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `답${i + 1}: ${t.a}${t.mark ? ` (${MARK_TEXT[t.mark]})` : ""}`));
    }
    if (state.thanks) lines.push("", `친구의 한마디: ${state.thanks}`);
    if (state.nextQuestion) lines.push(`다음 시간 확인할 것: ${state.nextQuestion}`);
    return lines.join("\n");
  }

  // '함께 더 알아봐요' 질문마다 선생님 도움말 한 묶음. 오개념이 아닌 질문의 "오늘 차시" 내용은 첫 묶음에만 둡니다.
  function friendHelp(topic, textbookId, state, lessonId = null) {
    const together = (state.turns || []).filter((t) => t.mark === "together");
    if (!together.length) return null;
    let todayShown = false;
    const sections = together.map((t) => {
      const base = U.helpFor(topic, textbookId, { item: t.q, misconception: t.misconception, lessonId });
      if (!base) return null;
      const h = { ...base, itemLabel: "살펴볼 질문" }; // 이 방법의 item은 친구의 질문입니다(엘렌코스는 "살펴볼 생각")
      if (h.truth) return h; // 오개념 쪽은 질문마다 다릅니다(같은 오개념을 두 번 쓰지 않음)
      if (todayShown) return { ...h, where: null, notes: [] };
      todayShown = true;
      return h;
    }).filter(Boolean);
    return sections.length ? { sections } : null;
  }

  const SokFriend = {
    id: "friend", name: "모르는 친구", ERROR_MESSAGE, KINDS, MARK_TEXT, DEFAULT_QUESTION, DEFAULT_FINISH, SYSTEM_PROMPT,
    PRAISE, marksFor, schemaFor, validateFriendStep, createSession, resultText, friendHelp,
  };
  if (isNode) module.exports = SokFriend;
  else root.SokFriend = SokFriend;
})(this);

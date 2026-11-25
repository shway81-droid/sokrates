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
  // 낱말 자리에 같은 뜻 무리(배열)가 올 수 있습니다. 학생이 무리 가운데 하나라도 말했으면 그 무리 전체를 되받아도 됩니다.
  function leakIn(question, leakWords, said) {
    const q = squash(question);
    const s = squash(said);
    for (const entry of leakWords || []) {
      const words = (Array.isArray(entry) ? entry : [entry]).filter((w) => squash(w));
      if (words.some((w) => s.includes(squash(w)))) continue;
      const hit = words.find((w) => q.includes(squash(w)));
      if (hit) return hit;
    }
    return null;
  }

  // 문제의 정답 낱말에 단원의 같은 뜻 낱말(synonyms)을 더합니다(정전 → 정전 협정, 휴전 협정).
  // 카드 4문장에 이미 보이는 낱말은 더하지 않습니다(학생 눈앞에 있는 말이라 새는 것이 아님).
  function leakWordsFor(problem, topic) {
    const groups = (topic && topic.synonyms) || [];
    const onCards = squash((problem.sentences || []).join(" "));
    return (problem.leakWords || []).map((w) => {
      const sw = squash(w);
      const extra = groups
        // 같은 낱말이거나, 그 낱말로 시작하는 말("정전" → "정전 협정")일 때만 그 무리를 씁니다("중국군"이 "국군"을 끌어오지 않게).
        .filter((g) => g.some((m) => squash(m) === sw || String(m).trim().startsWith(String(w).trim() + " ")))
        .flat()
        .filter((m) => squash(m) !== sw && !onCards.includes(squash(m)));
      const uniq = [...new Set(extra)];
      return uniq.length ? [w, ...uniq] : w;
    });
  }

  // 사실 하나를 떠올려 맞히게 하는 질문(언제·누가·무엇을·어디에서·어떤 일을 한…)은 퀴즈입니다.
  // "~다면/~려면"처럼 학생 주장이 맞을 때의 결과를 묻는 가정과, 까닭·목적("누구를 위해서")을 묻는 질문은 괜찮습니다.
  const FACT = /언제|누구(가|를|였|일까|인가)|무엇(을|이었|일까|인가)|어디(에서|서|였|일까|로)(?!든)|어떤\s*일을\s*(한|했)|어떤\s*\S+(일까요|인가요)\s*[?？]\s*$|어느\s+\S+(\s+\S+)?(였을까요|이었을까요|일까요|인가요)\s*[?？]\s*$|어느\s*나라|몇\s*\S*(년|명|개|나라|번)/;
  const NOT_FACT = /다면|라면|려면|었으면|였으면|했으면|까닭|이유|왜|위해/;
  // 줄임꼴 "누가"도 사람 하나를 맞히게 합니다. 다만 "싸움이 나면 누가 다칠까요?"처럼 ~면 뒤의 결과를 묻거나
  // "누가 한 일이 이상한지"처럼 문장을 다시 보게 하는 질문은 괜찮습니다.
  const WHO = /(^|[\s,])누가(?=\s|$)/;
  const NOT_WHO = /[가-힣]면\s|이상한지|다른지|달라/;
  const isFactQuestion = (q) => {
    const s = String(q ?? "");
    return (FACT.test(s) || (WHO.test(s) && !NOT_WHO.test(s))) && !NOT_FACT.test(s);
  };

  // 가정 질문("~다면/~라면/~려면")은 사실 묻기 검사를 비켜 가므로, 가정 속에 바른 생각을 넣지 않았는지 따로 한 번 더 봅니다.
  const HYPO = /다면|라면|려면|었으면|였으면|했으면/;
  const isHypothetical = (q) => HYPO.test(String(q ?? ""));
  // 검사 AI는 먼저 가정이 그리는 상황(premise)을 적고, 그 상황이 누구 편인지(side) 고릅니다. truth일 때만 막습니다.
  const PREMISE_SCHEMA = {
    type: "object",
    properties: {
      premise: { type: "string" },
      side: { type: "string", enum: ["friend", "truth", "other"] },
    },
    required: ["premise", "side"],
    additionalProperties: false,
  };
  const PREMISE_SYSTEM = `당신은 초등학교 5학년 사회 수업의 질문 검사자입니다. 학생은 친구의 정리에서 틀린 생각이 숨은 문장을 찾아 왜 이상한지 말하고 있습니다. 선생님이 낼 질문 하나에 "~다면", "~라면" 같은 가정이 들어 있습니다.
1. premise: 가정 부분이 그리는 상황을 짧게 적습니다("~다면"을 뺀 내용 그대로).
2. side: 그 상황이 어느 쪽 이야기인지 고릅니다.
- "friend": 그 상황이 친구의 숨은 문장(틀린 생각)과 같은 쪽이거나 거기서 나오는 일입니다. 친구 말이 맞다고 쳐 보는 가정입니다. "그대로", "정말", "만약" 같은 말이 붙어 실제는 다르다는 느낌이 들어도, 가정한 상황 자체가 친구 쪽이면 friend입니다.
- "truth": 그 상황이 [바른 생각]이나 [핵심 생각]의 내용(또는 그 일부, 같은 뜻의 다른 말)이고, 학생이 아직 그 내용을 말하지 않았습니다. 정답을 가정 속에 넣어 알려 주는 셈입니다.
- "other": 둘 다 아니거나, 학생이 이미 말한 내용입니다.
예 1: 숨은 문장 "3·1 운동을 이끈 것은 임시 정부였어요", 바른 생각 "임시 정부는 3·1 운동 뒤에 세워졌다"
- "임시 정부가 아직 없던 때라면 만세 시위는 누가 외쳤을까요?" → truth (임시 정부가 아직 없었다는 정답이 가정임)
- "임시 정부가 먼저 있었다면 만세 시위를 누가 준비했을까요?" → friend
예 2: 숨은 문장 "일제가 쌀 생산을 늘린 덕분에 우리 살림도 넉넉해졌어요", 바른 생각 "늘린 쌀보다 더 많은 쌀을 일본으로 가져가 살림은 어려워졌다"
- "늘린 쌀이 그대로 우리 밥상에 남았다면 살림은 어땠을까요?" → friend (쌀이 우리에게 남았다는 것은 친구 말에서 나오는 상황)
- "쌀을 일본으로 가져갔다면 우리 살림은 어땠을까요?" → truth
출력은 JSON 하나만 냅니다.`;

  const fail = (reason) => ({ ok: false, reason });

  // expect = { stage: "judge"|"final"|"question", asked: string[], leakWords: (string|string[])[], said: string }
  function validateDetectiveStep(out, expect) {
    if (!out || typeof out !== "object") return fail("객체가 아님");
    const allowed = RESULTS[expect.stage];
    if (!allowed.includes(out.result)) return fail(`허용되지 않은 판단: ${out.result} — ${allowed.join(" 또는 ")} 중 하나로 낼 것`);
    if (out.result !== "ask") return { ok: true };
    const q = G.checkQuestion(out.question);
    if (!q.ok) return fail(q.reason);
    if (isChoice(out.question)) return fail("둘 중 하나를 고르게 하는 질문임 — 질문 하나로만 물을 것");
    if (isFactQuestion(out.question))
      return fail("사실 하나(언제·누가·무엇을·어디·어떤 일)를 맞히게 하는 퀴즈 질문임 — 학생 말이 맞다면 어떤 일이 생기는지, 또는 왜 그렇게 생각했는지 물을 것");
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
    // shown: 앞 문제의 문장들. 그 문장에 정답 낱말이 들어 있는 문제는 (다른 문제가 있으면) 내지 않습니다.
    function choose(group, avoidMisc, shown = []) {
      const all = group.filter((p) => p.misconception !== avoidMisc);
      const seen = shown.join(" ").replace(/\s+/g, "");
      const clean = all.filter((p) => !(p.leakWords || []).some((w) => seen.includes(w.replace(/\s+/g, ""))));
      const pool = clean.length ? clean : all;
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
    const second = choose(rest, first.misconception, first.sentences) || (lessonId == null ? null : choose(today, first.misconception, first.sentences));
    return [first, second].filter(Boolean).slice(0, PROBLEM_COUNT);
  }

  const SYSTEM_PROMPT = `당신은 초등학교 5학년 사회 수업이 끝날 때 "오답 탐정" 활동을 돕는 선생님입니다.
학생은 친구가 정리한 4문장 가운데 틀린 생각이 숨은 문장을 찾아 눌렀고, 그 문장이 왜 이상한지 까닭을 말했습니다. 당신은 그 까닭을 판단하고, 모자라면 학생이 스스로 생각하게 하는 질문 하나를 냅니다. 학생에게 보이는 것은 질문뿐입니다.

판단(result):
- "solved": 학생이 숨은 문장에서 이상한 부분을 짚고, 실제로는 어떤지(핵심 생각) 또는 그 까닭을 말했습니다. 덜 자세하거나 낱말이 달라도 뜻이 핵심 생각과 맞으면 solved입니다. 앞의 까닭과 답을 합쳐서 봅니다. 맞춤법과 띄어쓰기는 문제 삼지 않습니다.
- "ask": 그 밖입니다. "아니에요", "이상해요"처럼 아니라고만 함, "몰라요", 다른 부분을 이상하다고 함, 교과서와 어긋나는 까닭, 되물음, 장난이 여기입니다. 이어 묻는 질문 1개를 함께 냅니다.
- "found"(마지막 판단에서만): 끝까지 핵심 생각에 닿지 못했습니다. 숨은 문장은 찾았으니 나머지는 선생님이 함께 알아봅니다.
- 판단 근거는 [문제]의 핵심 생각·바른 생각, [전체 개념], [오늘 차시 교과서 원문](주어졌을 때)뿐입니다. 따로 아는 지식은 쓰지 않습니다.

이어 묻는 질문(question) 규칙:
1. 1문장, 30자 안팎(40자를 넘으면 안 됩니다), "~까요?", "~나요?"처럼 "요?"로 끝나는 존댓말입니다. 질문 안에 마침표나 느낌표를 넣지 않습니다. 앞에서 한 질문을 되풀이하지 않습니다.
2. 정답을 말하지 않습니다. 바른 생각이나 핵심 생각의 내용, [정답 낱말]은 학생이 먼저 말하기 전에는 질문에 넣지 않습니다(안 됨: 이봉창 문제에서 "도쿄에서 일본 왕을 노린 사람이 이봉창일까요?", "윤봉길은 어디에서 폭탄을 던졌을까요?"). "~다면", "~라면" 같은 가정 속에도 바른 생각을 넣지 않습니다. 가정은 친구의 숨은 문장이 맞다고 쳐 볼 때만 씁니다(안 됨: "이봉창이 일본에 갔다면 무엇을 했을까요?").
3. 학생 말을 따라가 스스로 생각하게 합니다. 아니라고만 했으면 "그럼 실제로는 어땠을까요?" 쪽으로, 까닭이 빠졌으면 "왜 그렇게 되었을까요?" 쪽으로 묻습니다. 학생이 이미 꺼낸 말("다른 데서 던졌어요")을 더 말해 보게 하는 것은 좋습니다.
4. 학생이 "몰라요"라고 하면 같은 것을 다시 묻지 않고, 그 사실을 몰라도 답할 수 있는 더 쉬운 질문으로 바꿉니다. [이어 묻는 질문의 예]를 참고합니다.
5. 학생이 되물으면 답을 알려 주지 않고 질문을 이어 갑니다.
6. 퀴즈를 내지 않습니다. 이름, 연도, 장소, 숫자를 맞히게 하는 질문("~의 이름은 무엇일까요?", "몇 년이었을까요?")과, 사실 하나를 떠올리게 하는 질문("언제였을까요?", "무엇을 뽑았을까요?", "어떤 일을 한 사람이었을까요?")은 쓰지 않습니다. 대신 학생 말이 맞다면 어떤 일이 생기는지 묻습니다(쌀 문제의 예: "늘어난 쌀은 누구의 밥상에 올라갔을까요?"). "~일까요, ~일까요?"처럼 둘 중 하나를 고르게 하는 질문도 쓰지 않습니다.
7. 5학년이 아는 쉬운 낱말을 씁니다. "정답은", "오답" 같은 말과 학생이 잘못했다는 느낌을 주는 말은 쓰지 않습니다.
8. 출력은 주어진 JSON 형식 하나만 냅니다. solved면 question은 ""입니다.

예시(이봉창 문제, 숨은 문장 "이봉창은 상하이 훙커우 공원에서 폭탄을 던졌어요.", 핵심 생각 "이봉창은 도쿄에서 일본 왕을 향해 폭탄을 던졌다"):
- 학생 까닭 "이봉창이 아니에요" → ask, question "그 문장의 어느 부분이 실제와 다를까요?" ("이봉창은 어떤 일을 했을까요?"는 사실을 맞히게 하는 퀴즈라 안 됨)
- 학생 답 "몰라요" → ask. "이봉창은 누구를 향해 폭탄을 던졌을까요?"는 퀴즈라 안 됨. "그 문장에서 어느 낱말이 가장 이상해 보였나요?"처럼 몰라도 답할 수 있는 쉬운 질문
- 학생 답 "이봉창은 일본에 가서 일본 왕한테 던졌어요" → solved`;

  const CANCELLED = Symbol("cancelled");
  // 같은 차시 학생들에게 같은 문제가 되풀이되지 않게, 페이지가 열려 있는 동안 "교과서|차시"마다 낸 문제를 기억합니다(저장하지 않음).
  const SERVED = new Map();
  function servedFor(textbookId, lessonId) {
    const key = `${textbookId}|${lessonId ?? "wrap"}`;
    if (!SERVED.has(key)) SERVED.set(key, new Set());
    return SERVED.get(key);
  }
  // 브라우저에서는 data/detective-*.js 가 root.SokDetectiveData 에 넣은 문제를 모두 씁니다.
  const allProblems = () => (isNode ? [] : Object.values(root.SokDetectiveData || {}).flatMap((d) => d.problems || []));

  const newRecord = (p) => ({ problemId: p.id, wrongTaps: [], reason: null, turns: [], mark: null });

  // 오늘 차시 교과서 원문이 있으면 시스템 프롬프트 뒤에 붙이고 캐시합니다(엘렌코스·모르는 친구와 같은 차례).
  function systemFor(sourceText) {
    const text = typeof sourceText === "string" ? sourceText.trim() : "";
    if (!text) return SYSTEM_PROMPT;
    return [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `[오늘 차시 교과서 원문]\n${text}`, cache_control: { type: "ephemeral" } },
    ];
  }

  function createSession({ topic, textbookId, lessonId = null, llm, sourceText = null, problems = allProblems(),
    problemIds = null, random = Math.random, served = null }) {
    const picked = problemIds
      ? problemIds.map((id) => problems.find((p) => p.id === id)).filter(Boolean)
      : pickProblems({ problems, topic, textbookId, lessonId, served: served || servedFor(textbookId, lessonId), random });
    const context = T.buildContext(topic, textbookId, lessonId);
    const system = systemFor(sourceText);
    const miscById = new Map(topic.misconceptions.map((m) => [m.id, m]));
    const initialState = () => ({
      phase: "input", problems: JSON.parse(JSON.stringify(picked)), index: 0, step: "pick", selected: null, line: null,
      question: null, records: [], error: null,
      fallbacks: 0, // 검사에 걸려 기본값으로 대신한 횟수(점검 페이지가 봅니다)
    });
    let state = initialState();
    let generation = 0; // cancel() 때마다 올려서 늦게 온 응답을 버립니다
    let lastAction = null;

    const snapshot = () => JSON.parse(JSON.stringify(state));
    const problem = () => state.problems[state.index];
    const record = () => state.records[state.index];
    const said = () => [record().reason, ...record().turns.map((t) => t.a)].filter(Boolean).join(" ");

    // 첫 블록(단원 맥락)은 같은 차시 동안 늘 같아서 캐시하고, 둘째 블록에는 이 문제와 학생의 말만 둡니다.
    // 학생이 맞는 문장을 눌렀던 기록은 보내지 않습니다(판단은 숨은 문장의 까닭만 봅니다).
    function buildMessage(task, note = "") {
      const p = problem();
      const r = record();
      const m = miscById.get(p.misconception);
      const lines = [`[문제] 친구의 정리`, ...p.sentences.map((s, i) => `${i + 1}. ${s}`), `숨은 문장: ${p.hidden + 1}번`];
      if (m) lines.push(`틀린 생각(오개념 ${m.id}): ${m.wrong}`, `바른 생각: ${m.truth}`);
      lines.push(`핵심 생각(판단 기준): ${p.key}`, `이어 묻는 질문의 예: ${p.hints.join(" / ")}`,
        `[정답 낱말] 학생이 먼저 말하기 전에는 질문에 쓰지 말 것: ${leakWordsFor(p, topic).flat().join(", ")}`,
        "", "[학생의 까닭]", r.reason);
      if (r.turns.length) {
        lines.push("", "[이어 묻는 질문과 답]");
        r.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `학생 답${i + 1}: ${t.a}`));
      }
      lines.push("", `지금 할 일: ${task}`);
      if (note) lines.push("", note);
      return [
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
        { type: "text", text: lines.join("\n") },
      ];
    }

    // 가정 질문의 가정 부분이 바른 생각을 담았는지 AI에게 한 번 더 묻습니다. 검사가 실패하면 쓰지 않는 쪽(true)으로 봅니다.
    async function premiseReveals(question) {
      const p = problem();
      const m = miscById.get(p.misconception);
      const text = [
        `[숨은 문장] ${p.sentences[p.hidden]}`,
        ...(m ? [`[틀린 생각] ${m.wrong}`, `[바른 생각] ${m.truth}`] : []),
        `[핵심 생각] ${p.key}`,
        `[학생이 지금까지 한 말] ${said() || "(없음)"}`,
        `[검사할 질문] ${question}`,
        "", "가정이 그리는 상황을 premise에 적고, 그 상황이 누구 쪽인지 side로 내세요.",
      ].join("\n");
      try {
        const out = await llm.call({ system: [{ type: "text", text: PREMISE_SYSTEM }], messages: [{ role: "user", content: [{ type: "text", text }] }], schema: PREMISE_SCHEMA });
        return !(out && (out.side === "friend" || out.side === "other"));
      } catch (e) {
        return true;
      }
    }

    // AI를 부르고 검사합니다. 걸리면 까닭을 알려 주고 다시 받습니다(판단 2번, 마지막 판단 3번까지).
    // 판단이 ask인데 질문만 걸렸으면, 다시 받을 때는 형식을 "질문만"으로 좁힙니다(판단이 바뀌어 버리지 않게).
    async function callChecked(stage, task) {
      const gen = generation;
      const asked = record().turns.map((t) => t.q);
      const tries = stage === "final" ? 3 : 2;
      let shape = stage;
      let note = "";
      for (let attempt = 1; attempt <= tries; attempt++) {
        const out = await llm.call({ system, messages: [{ role: "user", content: buildMessage(task, note) }], schema: schemaFor(shape) });
        if (gen !== generation) throw CANCELLED; // 기다리는 동안 [다음 학생]을 눌렀으면 결과를 버립니다
        let v = validateDetectiveStep(out, { stage: shape, asked, leakWords: leakWordsFor(problem(), topic), said: said() });
        if (v.ok && out.result === "ask" && isHypothetical(out.question)) {
          const reveals = await premiseReveals(out.question);
          if (gen !== generation) throw CANCELLED;
          if (reveals) v = { ok: false, reason: "가정(~다면/~라면) 속에 바른 생각을 넣었음 — 정답을 알려 주는 셈이니, 가정은 친구의 숨은 문장이 맞다고 칠 때만 쓰거나 가정 없이 물을 것" };
        }
        if (v.ok) return out;
        if (stage === "judge" && out && out.result === "ask") shape = "question";
        note = `[앞 응답이 검사에 걸렸어요: ${v.reason}] 이 점만 고쳐 다시 내세요.${shape === "question" ? ' result는 "ask"로 두고 질문만 다시 내세요.' : ""}`;
      }
      state.fallbacks++;
      return null;
    }

    function close(mark) {
      record().mark = mark;
      Object.assign(state, { step: "between", line: LINES[mark === "together" ? "wrongLast" : mark], question: null, selected: null });
    }

    async function doJudge() {
      const left = MAX_FOLLOW - record().turns.length;
      const out = await callChecked("judge", `result "solved" 또는 "ask"를 내세요. 학생의 까닭(과 답)이 핵심 생각에 닿았으면 "solved", 아니면 "ask"와 이어 묻는 질문 1개입니다. 남은 이어 묻는 질문은 이것까지 ${left}번입니다.`);
      if (out && out.result === "solved") return close("solved");
      let q = out ? out.question.trim() : null;
      if (!q) { // 기본 질문은 앞에서 한 질문과 겹치지 않게 고릅니다.
        const asked = new Set(record().turns.map((t) => squash(t.q)));
        q = DEFAULT_QUESTIONS.find((d) => !asked.has(squash(d))) || DEFAULT_QUESTIONS[0];
      }
      Object.assign(state, { step: "follow", question: q, line: null });
    }

    async function doFinal() {
      const out = await callChecked("final", '마지막 판단입니다. result "solved" 또는 "found"를 내세요. 학생의 까닭과 답을 모두 합쳐 핵심 생각에 닿았으면 "solved", 아니면 "found"입니다.');
      close(out ? out.result : "found");
    }

    // action을 실행합니다. 처리 중 표시, 오류 처리, 취소된 세션의 늦은 응답 버리기를 맡습니다.
    async function run(action) {
      lastAction = action;
      state.phase = "waiting";
      state.error = null;
      try {
        await action();
        state.phase = "asking";
      } catch (e) {
        if (e === CANCELLED) return snapshot();
        state.phase = "error";
        state.error = ERROR_MESSAGE;
        if (root && root.console) root.console.warn("[오답 탐정] AI 호출 실패:", e && e.message);
      }
      return snapshot();
    }

    const picking = () => state.phase === "asking" && state.step === "pick";

    return {
      getState: snapshot,

      async start() {
        if (state.phase !== "input") return snapshot();
        if (!state.problems.length) { state.phase = "done"; return snapshot(); }
        state.records.push(newRecord(problem()));
        Object.assign(state, { phase: "asking", step: "pick" });
        return snapshot();
      },

      // 카드 누르기. 살펴본(이미 보낸) 맞는 문장은 다시 누를 수 없습니다. 어느 카드를 눌러도 화면은 같습니다.
      async select(i) {
        if (!picking() || !Number.isInteger(i) || i < 0 || i >= problem().sentences.length) return snapshot();
        if (record().wrongTaps.some((w) => w.index === i)) return snapshot();
        Object.assign(state, { selected: i, line: null });
        return snapshot();
      },

      async submitReason(text) {
        if (!picking() || state.selected == null) return snapshot();
        const t = String(text ?? "").trim();
        if (!t) return snapshot();
        const r = record();
        if (state.selected !== problem().hidden) {
          // 맞는 문장: AI를 부르지 않고 학생의 생각을 적어 둡니다(선생님 도움말에 나감).
          r.wrongTaps.push({ index: state.selected, reason: t });
          state.selected = null;
          if (r.wrongTaps.length >= MAX_WRONG) close("together");
          else state.line = LINES.wrongFirst;
          return snapshot();
        }
        r.reason = t;
        return run(doJudge);
      },

      async submitAnswer(text) {
        if (state.phase !== "asking" || state.step !== "follow") return snapshot();
        const a = String(text ?? "").trim();
        if (!a) return snapshot();
        record().turns.push({ q: state.question, a });
        return run(record().turns.length >= MAX_FOLLOW ? doFinal : doJudge);
      },

      async next() {
        if (state.phase !== "asking" || state.step !== "between") return snapshot();
        if (state.index + 1 >= state.problems.length) { state.phase = "done"; return snapshot(); }
        state.index++;
        state.records.push(newRecord(problem()));
        Object.assign(state, { step: "pick", selected: null, line: null, question: null });
        return snapshot();
      },

      // [바로 정리하기]: 하던 문제는 까닭을 보냈으면 found, 아니면 together. 시작하지 않은 문제는 결과에 나오지 않습니다.
      async finishNow() {
        if (state.phase !== "asking") return snapshot();
        const r = record();
        if (r && !r.mark) r.mark = r.reason != null ? "found" : "together";
        Object.assign(state, { phase: "done", selected: null, question: null, line: null });
        return snapshot();
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

  const NUM = ["①", "②", "③", "④"];
  const shown = (r) => r.mark === "solved" || r.mark === "found"; // 학생이 찾은 문제만 숨은 문장을 표시합니다

  // 복사용 결과 글
  function resultText({ topicTitle, textbookName, dateStr, state }) {
    const lines = [`[오답 탐정 학습정리] ${topicTitle} · ${textbookName} · ${dateStr}`];
    state.records.forEach((r, i) => {
      const p = state.problems[i];
      lines.push("", `문제 ${i + 1}${r.mark ? ` (${MARK_TEXT[r.mark]})` : ""}`);
      p.sentences.forEach((s, j) => lines.push(`${NUM[j]} ${s}${shown(r) && j === p.hidden ? "  ← 찾은 문장" : ""}`));
      if (r.reason) lines.push(`나의 까닭: ${r.reason}`);
      r.turns.forEach((t) => lines.push(`질문: ${t.q}`, `답: ${t.a}`));
    });
    return lines.join("\n");
  }

  // 까닭까지 밝히지 못했거나 맞는 문장을 이상하다고 본 문제마다 선생님 도움말 한 묶음.
  function detectiveHelp(topic, textbookId, state, lessonId = null) {
    const U = isNode ? require("../core/ui.js") : root.SokUI;
    const sections = (state.records || []).map((r, i) => {
      const p = state.problems[i];
      if (r.mark === "solved" && !r.wrongTaps.length) return null;
      const base = U.helpFor(topic, textbookId, { item: p.sentences[p.hidden], misconception: p.misconception, lessonId });
      if (!base) return null;
      return { ...base, itemLabel: "숨은 문장", wrongTaps: r.wrongTaps.map((w) => ({ sentence: p.sentences[w.index], reason: w.reason })) };
    }).filter(Boolean);
    return sections.length ? { sections } : null;
  }

  const SokDetective = {
    id: "detective", name: "오답 탐정", ERROR_MESSAGE, PROBLEM_COUNT, MAX_FOLLOW, MAX_WRONG, MARK_TEXT, LINES, DEFAULT_QUESTIONS,
    SYSTEM_PROMPT, SERVED, schemaFor, validateDetectiveStep, isChoice, isFactQuestion, isHypothetical, PREMISE_SCHEMA, PREMISE_SYSTEM, leakIn, leakWordsFor, pickProblems, createSession, resultText, detectiveHelp,
  };
  if (isNode) module.exports = SokDetective;
  else root.SokDetective = SokDetective;
})(this);

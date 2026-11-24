# 엘렌코스 MVP 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사 PC에서 더블클릭으로 여는 단일 폴더 웹앱입니다. 학생이 말한 "배운 3가지" 중 흔들리는 생각 1개에 Claude가 반례 질문을 최대 3번 던지고, 판정과 세 줄 정리를 띄웁니다.

**Architecture:** 빌드 없는 정적 폴더입니다. 로컬 JS 파일은 모두 일반 `<script>`로 불러옵니다. 각 파일은 `window.SokXxx` 전역을 만들고, Node에서도 테스트할 수 있게 `module.exports`도 함께 내보냅니다. Anthropic SDK만 jsDelivr CDN에서 동적 `import()`로 불러옵니다. 흐름 제어(질문 횟수, 판정 시점, 검사 실패 처리)는 `methods/elenchus.js`의 세션 객체가 맡고, AI는 JSON만 돌려줍니다.

**Tech Stack:**
- 화면: 바닐라 HTML·CSS·JS (ES2020, 크롬)
- AI 호출: `@anthropic-ai/sdk@1.13.0`(jsDelivr `+esm`)
- 테스트: Node 24 내장 `node --test`
- 데이터 추출: Python `pypdf`

**Spec:** `docs/superpowers/specs/2026-11-24-elenchus-mvp-design.md` (실행 전에 함께 읽으세요)

## Global Constraints

- `app/index.html`을 `file://`로 더블클릭해서 열 수 있어야 합니다. 로컬 파일에 `fetch`나 ES 모듈 `import`를 쓰지 않습니다(크롬이 `file://`에서 막습니다).
- 본문 글씨는 최소 `32px`이고, 질문 글씨는 그보다 크게 합니다. 화면에 빨간색, X 표시, 점수, "틀렸습니다"를 쓰지 않습니다.
- AI 질문은 1문장, `40`자 이내(`Array.from(s.trim()).length`), `?`로 끝나야 합니다. 금지어는 `["틀렸", "정답은", "오답"]`입니다.
- 기본 질문은 `"왜 그렇게 생각했나요?"`입니다.
- 판정 문구는 정확히 다음과 같습니다.
  - strong: `튼튼한 생각` / `반례에도 무너지지 않았어요. 근거가 있는 생각이에요.`
  - revisit: `다시 볼 생각` / `스스로 허점을 찾았어요. 다음 시간에 확인해 봐요.`
  - hold: `판정 보류` / `선생님과 더 이야기해 봐요.`
- 학생 이름은 받지 않고, 대화도 저장하지 않습니다. `localStorage` 키는 `sok.apiKey`, `sok.model`, `sok.effort`, `sok.textbook` 네 개만 씁니다.
- 자료는 세 교과서(천재·아이스크림·비상)의 6·25 내용으로만 한정합니다. 반례는 고른 교과서의 범위 안에서만 냅니다. 교과서 문장을 그대로 길게 옮기지 않고, 요약한 문장과 쪽 번호로 적습니다.
- 모델 기본값은 `claude-haiku-5-5`, effort는 `low`입니다 **[사용자 결정]**. 설정에서 `claude-sonnet-5-5`, `claude-opus-5-5`로 바꿀 수 있습니다. Opus·Sonnet에는 서버 측 대체 호출(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)을 켭니다.
- 교과서 원문에서 뽑은 텍스트(`work/`)는 git에 올리지 않습니다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙입니다.

## Review Focus

1. **요청이 끝나기 전에 [다음 학생]을 누른 경우:** 앞 학생의 늦게 온 응답이 새 학생 화면에 섞이면 안 됩니다. → Task 4 `cancelled session ignores late result` 테스트로 확인합니다.
2. **AI를 기다리는 동안 [보내기]를 두 번 누른 경우:** 호출이 두 번 나가면 안 됩니다. 기다리는 동안 버튼을 막고, 세션도 처리 중에 들어온 입력을 무시합니다. → Task 4 `ignores answer while pending` 테스트로 확인합니다.
3. **키가 틀렸거나(401), 학교망이 CDN·API를 막았거나, 거절 응답(`stop_reason: "refusal"`)이 온 경우:** 화면이 멈추면 안 됩니다. 오류 문구를 띄우고, 입력한 내용은 그대로 둡니다. → Task 4 `llm error keeps input` 테스트, Task 5 수동 확인으로 봅니다.
4. **공백만 넣었거나 아주 긴 입력(줄바꿈 포함 200자 이상)을 넣은 경우:** 공백만 있는 칸은 빈칸으로 봅니다. 긴 입력은 자르지 않고 줄바꿈해서 보여 줍니다. → Task 4 `rejects blank items` 테스트, Task 6 화면 확인으로 봅니다.
5. **한글 글자 수 세기:** 이모지나 자모가 섞여도 40자 검사가 화면에 보이는 글자 수와 맞아야 합니다. → Task 1 `counts by code point` 테스트로 확인합니다.

---

### Task 1: 프로젝트 뼈대와 출력 검사기 (`core/guard.js`)

**Files:**
- Create: `.gitignore`, `app/core/guard.js`, `app/tests/guard.test.js`, `app/tests/load.js`

**Interfaces:**
- Produces:
  - `SokGuard.charLen(s: string): number`
  - `SokGuard.checkQuestion(q: string): {ok: boolean, reason?: string}`
  - `SokGuard.validateStep(obj: object, allowedStages: string[]): {ok: boolean, reason?: string}`
  - `SokGuard.DEFAULT_QUESTION: string`, `SokGuard.DEFAULT_SUMMARY: string[3]`
  - `app/tests/load.js`의 `load(relPath)`: 브라우저용 파일을 Node에서 `require`해 내보낸 객체를 돌려줍니다.
- 모든 `app/core/*.js`, `app/methods/*.js`, `app/data/*.js` 파일은 이 모양을 따릅니다.
  `(function (root) { const X = {...}; if (typeof module !== "undefined") module.exports = X; else root.SokX = X; })(this);`

- [ ] **Step 1: `sokrates`에서 `git init` 하고 `.gitignore`(`work/`, `node_modules/`)를 만듭니다**

- [ ] **Step 2: 실패하는 테스트를 씁니다** (`app/tests/guard.test.js`)

```js
test("counts by code point", () => assert.equal(G.charLen(" 정전😀 "), 3));
test("accepts short question", () => assert.ok(G.checkQuestion("정전은 전쟁을 끝낸 것일까요, 멈춘 것일까요?").ok));
test("rejects 41 chars", () => assert.equal(G.checkQuestion("가".repeat(40) + "?").ok, false));
test("rejects two sentences", () => assert.equal(G.checkQuestion("맞아요. 왜 그럴까요?").ok, false));
test("rejects no question mark", () => assert.equal(G.checkQuestion("왜 그렇게 생각했나요").ok, false));
test("rejects forbidden word", () => assert.equal(G.checkQuestion("정답은 무엇일까요?").ok, false));
test("check step valid", () => assert.ok(G.validateStep({stage:"check",checks:["ok","ok","think"],target:2,mode:"counter",question:"협정의 이름은 무엇이었나요?"},["check"]).ok));
test("check step bad checks value", () => assert.equal(G.validateStep({stage:"check",checks:["ok","bad","ok"],target:0,mode:"reason",question:"왜 그럴까요?"},["check"]).ok,false));
test("check step outside allowed", () => assert.ok(G.validateStep({stage:"check",checks:["outside","outside","outside"],target:0,mode:"retry",question:"오늘 배운 것 중 하나를 말해 볼까요?"},["check"]).ok));
test("stage not allowed", () => assert.equal(G.validateStep({stage:"verdict",verdict:"hold",summary:["a","b","c"]},["question"]).ok,false));
test("verdict needs 3 lines ≤40", () => assert.equal(G.validateStep({stage:"verdict",verdict:"strong",summary:["a","b"]},["verdict"]).ok,false));
test("verdict valid", () => assert.ok(G.validateStep({stage:"verdict",verdict:"revisit",summary:["알게 된 것","다시 생각한 것","정전과 종전은 어떻게 다를까요?"]},["verdict"]).ok));
```

- [ ] **Step 3: 실행해서 실패를 확인합니다** — `node --test app/tests/` → FAIL(`Cannot find module`)

- [ ] **Step 4: `app/core/guard.js`를 구현합니다**
  - 문장 수 판정: 마지막 글자를 뺀 본문 안에 `.`, `?`, `!`가 있으면 2문장으로 봅니다.
  - `validateStep`의 단계별 필수 필드는 다음과 같습니다.
    - `check`: `checks`(길이 3, 각 값 ∈ `ok|think|outside`), `target`(0~2 정수), `mode`(∈ `counter|reason|retry`), `question`
    - `question`: `question`
    - `verdict`: `verdict`(∈ `strong|revisit|hold`), `summary`(길이 3, 각 줄 1~40자, 금지어 없음)

- [ ] **Step 5: 실행해서 통과를 확인합니다** — `node --test app/tests/` → 모두 PASS

- [ ] **Step 6: 커밋합니다** — `git commit -m "feat: AI 출력 검사기와 프로젝트 뼈대"`

---

### Task 2: 주제 데이터 도우미 (`core/topic.js`)

**Files:**
- Create: `app/core/topic.js`, `app/tests/topic.test.js`, `app/tests/fixtures/topic-mini.js`

**Interfaces:**
- Consumes: 설계서 6절의 데이터 구조. `sources`는 `{ [textbookId]: { lesson: "3-11", page: "123" } }` 모양입니다.
- Produces:
  - `SokTopic.validateTopic(topic): string[]` — 오류 목록을 돌려주고, 문제가 없으면 `[]`
  - `SokTopic.scopeFor(topic, textbookId): {concepts: object[], misconceptions: object[]}` — `sources`에 그 교과서가 있는 항목만
  - `SokTopic.unreviewedCount(topic): number`
  - `SokTopic.buildContext(topic, textbookId): string` — 프롬프트에 넣을 글. 형식은 아래와 같습니다.
    - `[전체 개념]`: 모든 개념을 한 줄씩
    - `[반례에 쓸 수 있는 범위: <교과서명>]`: 범위 안의 개념 id와 오개념(wrong / truth / counterHints)
    - `[같은 뜻으로 인정할 말]`: 동의어 묶음
- 미니 데이터: 교과서 2종, 개념 3개, 오개념 3개(그중 1개는 한 교과서에만 있음), `reviewed` 섞음

- [ ] **Step 1: 실패하는 테스트를 씁니다**

```js
test("valid mini topic", () => assert.deepEqual(T.validateTopic(mini), []));
test("unknown textbook key", () => assert.match(T.validateTopic(withSource("zzz")).join(), /zzz/));
test("duplicate id", () => assert.match(T.validateTopic(withDupId()).join(), /중복/));
test("textbook needs ≥2 misconceptions", () => assert.match(T.validateTopic(withOnlyOneMiscFor("b")).join(), /b/));
test("scope filters by textbook", () => assert.deepEqual(T.scopeFor(mini,"a").misconceptions.map(m=>m.id), ["m1","m2"]));
test("unreviewed count", () => assert.equal(T.unreviewedCount(mini), 2));
test("context marks scope", () => { const c = T.buildContext(mini,"b"); assert.ok(c.includes("[반례에 쓸 수 있는 범위: 교과서B]")); assert.ok(!c.includes(onlyAMiscWrong)); });
```

- [ ] **Step 2: 실행해서 실패를 확인합니다** — `node --test app/tests/topic.test.js` → FAIL

- [ ] **Step 3: `app/core/topic.js`를 구현합니다**

- [ ] **Step 4: 실행해서 통과를 확인합니다** — PASS

- [ ] **Step 5: 커밋합니다** — `git commit -m "feat: 주제 데이터 검사·범위 거르기"`

---

### Task 3: 6·25 주제 데이터 (`data/topic-625.js`)

**Files:**
- Create: `tools/extract_625.py`, `work/625/*.txt`(git 제외), `app/data/topic-625.js`, `app/tests/data.test.js`

**Interfaces:**
- Consumes: `SokTopic.validateTopic`
- Produces: `window.SOKRATES_TOPICS["625"]`(Node에서는 `module.exports`)

재료 PDF(`C:\Users\User\Desktop\claude2\classall\textbook\`)는 다음과 같습니다.
- 핵심: 천재 `3단원_11차시`·`3단원_12차시`, 아이스크림 `3단원_10차시`·`3단원_12차시`, 비상 `3단원_11차시`
- 참고: 천재 `3단원_01·08·10·14차시`, 아이스크림 `3단원_01·08·13·14차시`, 비상 `3단원_08·10차시` (6·25를 언급한 부분만)

- [ ] **Step 1: `tools/extract_625.py`를 만듭니다** — 위 PDF에서 장마다 글자를 뽑아 `work/625/<교과서>_<차시>.txt`에 `=== p.<인쇄 쪽> ===` 머리줄과 함께 저장합니다.
  - 인쇄 쪽 번호는 PDF 본문 아래쪽에 찍힌 숫자로 확인합니다. 찾지 못하면 진도표의 시작 쪽에 장 순번을 더합니다.
  - 천재 3단원은 offset이 -1 구간입니다(`classall/textbook/README.md` 참고).
  - 실행: `PYTHONUTF8=1 python -I tools/extract_625.py`
- [ ] **Step 2: 실패하는 테스트를 씁니다** (`app/tests/data.test.js`)

```js
test("625 topic valid", () => assert.deepEqual(T.validateTopic(D), []));
test("concept count 15~25", () => assert.ok(D.concepts.length >= 15 && D.concepts.length <= 25));
test("misconception count 6~10", () => assert.ok(D.misconceptions.length >= 6 && D.misconceptions.length <= 10));
test("PRD example present", () => assert.ok(D.misconceptions.some(m => /1953/.test(m.wrong) && /정전/.test(m.truth))));
test("synonym 국제 연합군", () => assert.ok(D.synonyms.some(g => g.includes("국제 연합군") && g.includes("유엔군"))));
test("no long verbatim", () => { /* work/625 원문에 있는 25자 이상 연속 문자열이 concept.text·truth에 없어야 합니다. work/가 없으면 skip */ });
```

- [ ] **Step 3: 실행해서 실패를 확인합니다** — FAIL(`Cannot find module`)
- [ ] **Step 4: `work/625/*.txt`를 읽고 `app/data/topic-625.js`를 씁니다**
  - 개념은 5학년 말투로 요약합니다.
  - 오개념에는 학생이 실제로 할 법한 말을 적습니다. 예: "1953년에 전쟁이 끝났다", "국제 연합군은 미국 군대만이다", "피란은 전쟁이 끝난 뒤에 간 것이다".
  - 모든 오개념은 `reviewed: false`로 둡니다.
  - 교과서 문장을 25자 넘게 그대로 옮기지 않습니다.
- [ ] **Step 5: 실행해서 통과를 확인합니다** — `node --test app/tests/data.test.js` → PASS
- [ ] **Step 6: 커밋합니다** — `git commit -m "feat: 세 교과서 6·25 주제 데이터 초안"`
- [ ] **Step 7: 교사 검토 체크포인트** — 사용자님께 개념·오개념 목록을 보여 드리고 고칠 곳을 받습니다. 승인된 항목을 `reviewed: true`로 바꾸고 커밋합니다. *(나머지 Task는 이 검토를 기다리지 않고 진행합니다.)*

---

### Task 4: 엘렌코스 진행 세션 (`methods/elenchus.js`)

**Files:**
- Create: `app/methods/elenchus.js`, `app/tests/elenchus.test.js`

**Interfaces:**
- Consumes: `SokGuard.*`, `SokTopic.buildContext`
- Produces:
  - `SokElenchus.SYSTEM_PROMPT: string` — 설계서 8절의 규칙 1~9를 그대로 담습니다.
  - `SokElenchus.SCHEMAS: {check, next, verdict}` — JSON Schema입니다. `next`는 `stage ∈ {question, verdict}`이고 필드는 `question`·`verdict`·`summary` 중 선택해서 씁니다.
  - `SokElenchus.createSession({topic, textbookId, llm}) → Session`
  - `llm` 계약: `llm.call({system: string, messages: {role, content}[], schema: object}) → Promise<object>`. 오류나 거절이 오면 throw합니다.
  - `Session`이 가진 것:
    - `submitItems(items: string[]) → Promise<State>`
    - `submitAnswer(text: string) → Promise<State>`
    - `finishNow() → Promise<State>`
    - `getState(): State`
    - `cancel(): void`
  - `State` 모양:
    - `{ phase: "input"|"waiting"|"asking"|"done"|"error", items: string[], checks: string[]|null, target: number|null, mode: "counter"|"reason"|"retry"|null, turns: {q: string, a: string}[], question: string|null, maxQuestions: 3|1, verdict: "strong"|"revisit"|"hold"|null, summary: string[]|null, error: string|null }`
- 규칙(코드가 정합니다):
  - `maxQuestions`는 `mode === "reason"`이면 1, 아니면 3입니다.
  - 답 수가 `maxQuestions`에 이르거나 `finishNow()`를 부르면 판정 호출로 갑니다.
  - 답이 1·2번째일 때는 `next` 호출을 합니다. 이때 AI가 일찍 `verdict`를 돌려주면 받아들입니다.
  - 검사에 걸리면 같은 호출을 1번 다시 합니다. 또 걸리면 질문은 `DEFAULT_QUESTION`으로, 판정은 `hold` + `DEFAULT_SUMMARY`로 바꿉니다.
  - 확인 단계(check)가 두 번 다 검사에 걸리면 다음과 같이 둡니다: `checks=["think","think","think"]`, `target=0`, `mode="counter"`, `question=DEFAULT_QUESTION`.
  - `llm`이 throw하면 `phase: "error"`가 되고 `error`에 `"AI 연결에 문제가 있어요. 선생님이 직접 물어봐 주세요."`를 넣습니다. 입력과 대화는 그대로 둡니다. 다시 시도하는 메서드 `retry()`도 둡니다.
  - 처리 중(`waiting`)에 들어온 `submitAnswer`·`finishNow`는 무시하고 현재 상태를 돌려줍니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다** — 가짜 `llm`(응답을 차례로 꺼내 주고, 호출 기록을 남김)을 씁니다.

```js
test("rejects blank items", async () => { await assert.rejects(s.submitItems(["a"," ","c"])); });
test("counter flow ends after 3 answers", async () => { /* check→q→q→verdict 응답 준비 */ await s.submitItems(three); await s.submitAnswer("1"); await s.submitAnswer("2"); const st = await s.submitAnswer("3"); assert.equal(st.phase,"done"); assert.equal(st.turns.length,3); assert.equal(fake.calls.at(-1).schema, E.SCHEMAS.verdict); });
test("reason mode asks once", async () => { /* check mode reason */ await s.submitItems(three); const st = await s.submitAnswer("이유"); assert.equal(st.maxQuestions,1); assert.equal(st.phase,"done"); });
test("early verdict accepted", async () => { /* next가 verdict 반환 */ const st = await s.submitAnswer("아, 멈춘 거네요"); assert.equal(st.verdict,"revisit"); assert.equal(st.turns.length,1); });
test("guard fail retries once then default question", async () => { /* check 응답 question 60자 두 번 */ const st = await s.submitItems(three); assert.equal(st.question, G.DEFAULT_QUESTION); assert.equal(fake.calls.length,2); });
test("guard fail on verdict falls back to hold", async () => { /* verdict summary 2줄 두 번 */ assert.equal(st.verdict,"hold"); assert.deepEqual(st.summary, G.DEFAULT_SUMMARY); });
test("finishNow goes to verdict", async () => { await s.submitItems(three); const st = await s.finishNow(); assert.equal(st.phase,"done"); });
test("llm error keeps input", async () => { /* fake throws */ const st = await s.submitItems(three); assert.equal(st.phase,"error"); assert.deepEqual(st.items, three); });
test("ignores answer while pending", async () => { const p1 = s.submitAnswer("a"); const st2 = await s.submitAnswer("b"); assert.equal(st2.phase,"waiting"); await p1; assert.equal(s.getState().turns.length,1); });
test("cancelled session ignores late result", async () => { const p = s.submitItems(three); s.cancel(); await p; assert.equal(s.getState().phase,"input"); });
test("prompt carries scope", async () => { await s.submitItems(three); assert.ok(fake.calls[0].messages[0].content.includes("[반례에 쓸 수 있는 범위:")); });
```

- [ ] **Step 2: 실행해서 실패를 확인합니다** — `node --test app/tests/elenchus.test.js` → FAIL
- [ ] **Step 3: `app/methods/elenchus.js`를 구현합니다** — 메시지는 매 호출마다 한 개의 `user` 메시지로 다시 조립합니다. 내용은 맥락(`buildContext`) + 학생 3가지 + 지금까지의 문답 + "지금 할 일" 한 줄입니다. 대화 이력을 assistant 턴으로 쌓지 않습니다.
- [ ] **Step 4: 실행해서 통과를 확인합니다** — `node --test app/tests/` → 모두 PASS
- [ ] **Step 5: 커밋합니다** — `git commit -m "feat: 엘렌코스 진행 세션"`

---

### Task 5: Claude 호출과 설정 (`core/llm.js`)

**Files:**
- Create: `app/core/llm.js`, `app/tests/llm.test.js`

**Interfaces:**
- Produces:
  - `SokLLM.MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]`, `SokLLM.DEFAULTS = {model: "claude-haiku-5-5", effort: "low"}`
  - `SokLLM.loadSettings(storage = localStorage): {apiKey: string|null, model, effort}` / `saveSettings(s, storage)` / `clearKey(storage)` — 키 이름은 Global Constraints에 적은 대로입니다.
  - `SokLLM.buildRequest({model, effort, system, messages, schema}): object` — 순수 함수라 테스트할 수 있습니다.
  - `SokLLM.createClaudeLLM(settings): {call}` — Task 4의 `llm` 계약을 따릅니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다** (가짜 storage 객체 사용)

```js
test("defaults when empty", () => assert.deepEqual(L.loadSettings(mem()), {apiKey:null, model:"claude-haiku-5-5", effort:"low"}));
test("clearKey removes only key", () => { const m = mem({"sok.apiKey":"x","sok.model":"claude-sonnet-5-5"}); L.clearKey(m); assert.equal(m.getItem("sok.apiKey"), null); assert.equal(m.getItem("sok.model"),"claude-sonnet-5-5"); });
test("request uses structured output", () => { const r = L.buildRequest(args); assert.deepEqual(r.output_config.format, {type:"json_schema", schema:args.schema}); assert.equal(r.output_config.effort,"low"); });
test("fallback on opus/sonnet only", () => { assert.equal(L.buildRequest({...args, model:"claude-opus-5-5"}).fallbacks, "default"); assert.equal(L.buildRequest({...args, model:"claude-haiku-5-5"}).fallbacks, undefined); });
test("no thinking/temperature fields", () => { const r = L.buildRequest(args); assert.equal(r.thinking, undefined); assert.equal(r.temperature, undefined); });
```

- [ ] **Step 2: 실행해서 실패를 확인합니다** — FAIL
- [ ] **Step 3: `app/core/llm.js`를 구현합니다**
  - `buildRequest`의 기본 필드: `max_tokens: 8000`, `system`, `messages`, `output_config: {effort, format}`
  - Opus·Sonnet이면 `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`를 더합니다.
  - `createClaudeLLM`이 하는 일:
    1. SDK를 한 번만 불러옵니다: `import("https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.13.0/+esm")`
    2. 클라이언트를 만듭니다: `new Anthropic({apiKey, dangerouslyAllowBrowser: true})`
    3. `client.beta.messages.create(buildRequest(...))`로 호출합니다.
    4. 응답을 확인합니다. `stop_reason === "refusal"`이면 throw합니다. 그렇지 않으면 첫 `text` 블록을 `JSON.parse`해서 돌려줍니다.
  - **먼저 확인할 것:** 1.13.0 README에서 `dangerouslyAllowBrowser` 옵션 이름과, `client.beta.messages.create`가 `fallbacks`와 `output_config.format`을 함께 받는지 확인합니다. 다르면 README를 따르고, 이 계획을 고쳐 적습니다.
- [ ] **Step 4: 실행해서 통과를 확인합니다** — PASS
- [ ] **Step 5: 커밋합니다** — `git commit -m "feat: Claude 호출·설정 저장"`

---

### Task 6: 교사 화면 (`index.html`, `core/app.js`, `core/ui.js`, `core/style.css`)

**Files:**
- Create: `app/index.html`, `app/core/app.js`, `app/core/ui.js`, `app/core/style.css`, `app/tests/ui.test.js`

**Interfaces:**
- Consumes: `SokLLM`, `SokTopic`, `SokElenchus`, `window.SOKRATES_TOPICS`
- Produces:
  - `SokUI.VERDICT_TEXT: {strong: {label, message}, revisit: {...}, hold: {...}}` — 문구는 Global Constraints에 적은 대로입니다.
  - `SokUI.CHECK_TEXT = {ok: "✓", think: "더 생각해 볼 것", outside: "교과서 밖 이야기예요"}`
  - `SokUI.formatElapsed(ms: number): string` — 예: `"4:07"`
  - `SokUI.resultText({topicTitle, textbookName, dateStr, state}): string` — 복사용 일반 텍스트. 학생 이름 칸은 없습니다.
  - `SokApp.registerMethod({id, name, createSession})` — 다음 방법들이 붙을 자리입니다. `index.html`은 `<script>` 순서대로 다음을 불러옵니다: `data/topic-625.js` → `core/guard.js` → `core/topic.js` → `core/llm.js` → `core/ui.js` → `methods/elenchus.js` → `core/app.js`
- 화면(설계서 7절):
  - 설정 → 시작(방법·주제·교과서) → 3가지 입력 → 확인과 반례 문답 → 판정·세 줄 정리
  - 오른쪽 위에 지난 시간 타이머가 있습니다.
  - [바로 정리하기], [복사](`navigator.clipboard.writeText`), [인쇄](`window.print` + `@media print` A4 한 장), [다음 학생](`session.cancel()` 후 새 세션)이 있습니다.
  - `waiting` 동안에는 버튼을 막고 "생각하는 중이에요…"를 띄웁니다.
  - 검토하지 않은 오개념이 있으면 시작 화면에 "검토하지 않은 오개념이 N개 있어요"를 띄웁니다.
  - 키 입력 칸은 `type="password"`이고, [키 지우기] 버튼이 있습니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다**

```js
test("elapsed format", () => { assert.equal(U.formatElapsed(247000), "4:07"); assert.equal(U.formatElapsed(0), "0:00"); });
test("verdict text exact", () => assert.equal(U.VERDICT_TEXT.revisit.message, "스스로 허점을 찾았어요. 다음 시간에 확인해 봐요."));
test("result text has summary, no name field", () => { const t = U.resultText(sample); assert.ok(t.includes(sample.state.summary[2])); assert.ok(!/이름/.test(t)); });
```

- [ ] **Step 2: 실행해서 실패를 확인합니다** — FAIL
- [ ] **Step 3: `ui.js`, `app.js`, `style.css`, `index.html`을 구현합니다**
- [ ] **Step 4: 실행해서 통과를 확인합니다** — `node --test app/tests/` → 모두 PASS
- [ ] **Step 5: 브라우저로 화면을 확인합니다** — 앱 내장 브라우저로 `file:///C:/Users/User/Desktop/claude2/sokrates/app/index.html`을 엽니다.
  - 키가 없으면 설정 화면에서 넘어가지 않는지 봅니다.
  - 콘솔 오류가 0개인지 봅니다.
  - 1280×720 화면에서 글씨가 32px 이상인지 봅니다.
  - 200자 입력이 줄바꿈되는지 봅니다.
  - 인쇄 미리보기가 A4 한 장인지 봅니다.
- [ ] **Step 6: 커밋합니다** — `git commit -m "feat: 교사 화면"`

---

### Task 7: 실제 AI 호출 점검 페이지 (`tests/live.html`)

**Files:**
- Create: `app/tests/live.html`, `app/tests/live-cases.js`

**Interfaces:**
- Consumes: 앱과 같은 스크립트들, `SokLLM.loadSettings()`로 읽은 저장된 키
- 실제 학생과 같은 길을 거치도록, 각 경우를 `createSession`으로 끝까지 돌립니다. 학생의 답은 `live-cases.js`에 미리 적어 둔 답을 차례로 넣습니다.

- [ ] **Step 1: `live-cases.js`에 점검할 경우를 적습니다**
  - PRD 예시: 천재, 입력 `["북한이 남침했다","유엔군이 도와주었다","전쟁은 1953년에 끝났다"]`, 답 `["정전 협정이요.","아, 멈춘 거예요. 그럼 끝난 건 아니네요."]`
    - 기대: ①② ok, ③ think, 판정 revisit
  - 가상 학생 3세트(모두 맞음 / 오개념 1개 / 엉뚱한 답) × 교과서 3종
    - 기대: strong(reason) / revisit(counter) / hold(retry)
- [ ] **Step 2: `live.html`을 만듭니다** — [모두 실행]을 누르면 경우마다 다음을 표로 보여 줍니다: 질문 목록, 글자 수, 판정, 기대와 같은지(같음/다름), 걸린 시간.
- [ ] **Step 3: 사용자님이 앱 설정 화면에서 API 키를 직접 넣습니다** (키는 채팅에 붙이지 않습니다) → `live.html`을 실행합니다. 기대: 10건 중 판정 일치 8건 이상, 질문 40자 초과 0건, 고른 교과서 밖 반례 0건(질문을 눈으로 확인)
- [ ] **Step 4: 어긋난 경우를 고칩니다** — `SYSTEM_PROMPT`를 고치고 다시 돌립니다. 결과 표를 `docs/live-check-2026-11-xx.md`에 붙입니다(학생 이름 없음).
- [ ] **Step 5: 커밋합니다** — `git commit -m "test: 실제 호출 점검 페이지와 결과"`

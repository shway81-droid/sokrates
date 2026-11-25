# 공통 틀 정리와 "모르는 친구" 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공통 틀이 방법별 화면을 받게 고치고, 그 위에 "2. 모르는 친구"를 만들어 단위 테스트와 실제 AI 점검을 거칩니다.

**Architecture:** 화면 제어(`core/app.js`)는 설정·시작·위 막대·타이머만 맡고, 각 방법이 `methods/*-views.js`에서 입력·문답·결과 화면을 `root.SokMethods`에 등록합니다. 겹치는 화면 조각은 `core/parts.js`의 함수입니다. 모르는 친구의 문답 흐름은 `methods/friend.js`(Node 테스트 가능)에 있고, 엘렌코스와 같은 방식(코드가 흐름, AI는 JSON, 검사에 걸리면 까닭을 알려 다시 받기)을 따릅니다.

**Tech Stack:** 빌드 없는 일반 스크립트(`(function (root) {…})(this)`), Node `node:test`, Claude API(`@anthropic-ai/sdk` 브라우저, 구조화 출력), 기본 모델 `claude-haiku-5-5`.

**Spec:** `docs/superpowers/specs/2026-11-24-friend-method-design.md` (함께 읽기: `docs/elenchus-handoff.md`)

## Global Constraints

- 사용자님께 하는 모든 보고는 한국어 존댓말.
- 질문·다음 시간 질문: 40자 이내, 한 문장, "요?"로 끝, 금지어(`틀렸`, `정답은`, `오답`) 없음 — `SokGuard.checkQuestion`.
- 반응 20자 이내·물음표 없음, 한마디 40자 이내.
- 화면에 빨간색·X·점수 없음. 학생 이름 받지 않음.
- 판단 근거는 [오늘 차시 교과서 원문]과 [전체 개념]만. 질문 재료는 고른 교과서의 오늘까지 배운 범위만.
- 기존 테스트 파일(`tests/*.test.js`)은 고치지 않음. `cd app && node --test "tests/*.test.js"`의 기존 177개가 계속 통과.
- `core/guard.js`, `methods/elenchus.js`는 고치지 않음.
- API 키 값을 읽거나 출력하지 않음(있는지만 확인). 하네스는 localStorage에 쓰지 않음.
- 교과서 원문(`work/`, `app/local/`)은 커밋하지 않음. 커밋·푸시는 사용자님이 말씀하실 때만(아래 "Commit" 단계는 그때 묶어서 함).
- 브라우저 캐시는 `?v=숫자`로 피함. 개발 서버는 `.claude/launch.json`의 `sokrates-app`(포트 8765).
- Python은 `-I -X utf8`. 일부 파일은 CRLF 줄끝이니 바꾸기 전에 확인.

## Review Focus

1. 학생이 [바로 정리하기]를 질문 0개 상태에서 누름 → 결과에 질문 줄 없이 설명·한마디·다음 시간만 나옴(Task 5 테스트).
2. AI가 반응에 "맞아요"·정답을 넣음 → 검사에 걸려 다시 받음(Task 4 테스트: `/맞아|잘했|정답|훌륭/`).
3. 오늘까지 배운 오개념을 이미 다 썼거나 범위에 없음 → 질문 2·3이 `meaning`으로 바뀜(Task 5 테스트).
4. 응답이 늦게 오는 동안 [다음 학생] → 늦은 응답이 새 학생 화면을 덮지 않음(Task 5 테스트, 엘렌코스와 같은 세대 번호).
5. 오개념이 아닌 질문 둘이 모두 `together` → 도움말에 "오늘 차시" 내용이 한 번만(Task 6 테스트).

---

## 파일 지도

| 파일 | 할 일 |
|---|---|
| `app/tests/views.html` (새) | 키 없이 가짜 AI로 각 방법의 화면을 띄우고 `#screen` HTML을 찍는 하네스 |
| `app/tests/fixtures/elenchus-views-baseline.js` (새) | 정리 전 엘렌코스 화면 HTML 기준값 |
| `app/core/parts.js` (새) | 공통 화면 부품 `SokParts` |
| `app/methods/elenchus-views.js` (새) | `app.js`에서 옮긴 엘렌코스 화면 + 등록 |
| `app/core/app.js` (고침) | 공통 틀만 남김, `SokMethods` 읽기, `kit`, 방법 기억 |
| `app/core/ui.js` (고침) | `helpFor` 더하고 `teacherHelp`가 그것을 씀 |
| `app/methods/friend.js` (새) | 모르는 친구 프롬프트·형식·검사·세션·결과 글·도움말 |
| `app/methods/friend-views.js` (새) | 모르는 친구 화면 + 등록 |
| `app/core/style.css` (고침) | 모르는 친구 표시·설명 상자 |
| `app/index.html` (고침) | 스크립트 줄 |
| `app/tests/ui-help.test.js`, `friend.test.js`, `live-friend-cases.test.js` (새) | 단위 테스트 |
| `app/tests/live-friend.html`, `live-friend-cases.js` (새) | 실제 AI 점검 |
| `docs/live-check-friend-2026-11-24.md`, `docs/friend-handoff.md` (새) | 점검 기록, 정리 문서 |

---

### Task 1: 화면 확인 하네스와 정리 전 기준값

**Files:**
- Create: `app/tests/views.html`, `app/tests/fixtures/elenchus-views-baseline.js`

**Interfaces:**
- Produces: `views.html?run=elenchus` → 페이지의 `<pre id="out">`에 `{ "장면 이름": "정규화한 #screen innerHTML", … }` JSON. `?compare=1`이면 `window.SOK_VIEWS_BASELINE`과 비교해 `같음 N/N` 또는 다른 장면 이름과 첫 차이 위치를 보여 줌. 장면 목록은 방법별 배열(`SCENES.elenchus`, 뒤에 `SCENES.friend`를 더함).

- [ ] **Step 1: `views.html` 만들기**
  - `index.html`의 머리·몸통을 그대로 옮기고(경로는 `../`), 스크립트 차례도 같게 합니다.
  - `core/llm.js` 바로 뒤의 인라인 스크립트에서 다음을 합니다.
    - `SokLLM.loadSettings`를 `{ apiKey: "fake", model: "claude-haiku-5-5", effort: "low" }`를 돌려주게 바꿉니다.
    - `saveSettings`·`clearKey`를 아무것도 하지 않게 바꿉니다.
    - `createClaudeLLM`이 가짜 AI(장면이 넣어 둔 응답 큐를 차례로 돌려줌, `Error`면 throw, `"PENDING"`이면 끝나지 않는 promise)를 돌려주게 합니다.
    - `Storage.prototype.setItem`을 아무것도 하지 않게 하고, `sok.*` 읽기는 null을 돌려주게 합니다.
    - `SOKRATES_TEXTS`는 지웁니다(원문 유무와 무관하게 같은 결과).
  - `app.js` 뒤의 인라인 스크립트가 장면을 차례로 돌립니다. DOM을 클릭·입력하고 `#screen`이 바뀔 때까지 기다린 뒤 `innerHTML`을 찍습니다.
  - 정규화: `\d+:\d\d`(경과 시간) → `0:00`, `\d{4}-\d{2}-\d{2}` → `DATE`.
- [ ] **Step 2: 엘렌코스 장면 넣기** (모두 토픽 3, 천재 `3-12`, 시작 화면 기본값)
  - `start`: 시작 화면
  - `input`: 배운 3가지 입력 화면
  - `waiting`: 응답 PENDING 중 화면
  - `asking-1`: CHECK(counter, target 2, misconception "3-2.m01") 뒤 첫 질문 화면
  - `asking-2`: 답 1 뒤 다음 질문 화면(history 포함)
  - `result-revisit`: 답 2 뒤 revisit 판정(도움말·rethink 포함)
  - `result-strong-reason`: reason 모드 → strong
  - `result-hold-retry`: retry 모드 → [바로 정리하기] → hold
  - `error`: 첫 호출이 Error인 화면
  - `settings`: 설정 화면
- [ ] **Step 3: 기준값 찍기**
  - Run: `preview_start sokrates-app` → `http://localhost:8765/tests/views.html?run=elenchus&v=1`
  - Expected: `#out`에 장면 10개가 들어 있고, 각 HTML이 비어 있지 않음.
  - `get_page_text`로 읽은 JSON을 `tests/fixtures/elenchus-views-baseline.js`에 `window.SOK_VIEWS_BASELINE = {…};`로 저장합니다(Write 도구).
- [ ] **Step 4: 비교가 돌아가는지 확인**
  - Run: `…/tests/views.html?run=elenchus&compare=1&v=2`
  - Expected: `같음 10/10`(아직 코드를 바꾸지 않았으므로).
- [ ] **Step 5: 기존 테스트 확인**
  - Run: `cd app && node --test "tests/*.test.js"`
  - Expected: pass 177, fail 0.

### Task 2: 공통 틀 정리 (parts · elenchus-views · app)

**Files:**
- Create: `app/core/parts.js`, `app/methods/elenchus-views.js`
- Modify: `app/core/app.js` (전체), `app/index.html`, `app/tests/views.html`(스크립트 줄)

**Interfaces:**
- Produces:
  - 방법 객체: `{ id, name, startHint, createSession, views: { input(kit), talk(kit), result(kit) } }`. 각 view는 DOM 요소 1개를 돌려줌. 각 `*-views.js` 끝에서 `(root.SokMethods = root.SokMethods || []).push(방법)`.
  - `kit = { session, scope, show(view), act(promise), toast(msg), onEnter(fn), copy(text), elapsedText(), today(), nextStudent(), openSettings() }`. `act(p)`는 `show("talk")` → `await p` → 세션이 그대로면 `phase==="done"`일 때 타이머를 멈추고 `show("result")`, 아니면 `show("talk")`.
  - `SokParts`:
    - `goal(title)`
    - `dots(done, max)`
    - `thinkingCard(who, dotsEl|null)`
    - `questionCard(who, dotsEl, question, extra=null)`
    - `answerArea(kit, { send(text), finish() })` → `[textarea#answer, div.row.end]`
    - `errorArea(kit)` → `[div.error-box, div.row.end]`
    - `helperBox(help)`
    - `recordBox(lines: string[])` → `details.record.card`(summary "문답 기록 보기" + 줄마다 `<p>`)
    - `resultActions(kit, text)` → `div.row.end.no-print`
  - 세션 약속: `getState().phase ∈ {input, waiting, asking, error, done}`, `cancel()`, `retry()`.
  - 방법 기억 키: `sok.method`.

- [ ] **Step 1: `parts.js` 쓰기.** 지금 `app.js`의 해당 DOM 코드를 그대로 함수로 옮깁니다(클래스·속성·글이 같아야 기준값과 같음). `send`는 빈 답이면 칸에 포커스만 합니다.
- [ ] **Step 2: `elenchus-views.js` 쓰기.**
  - `app.js`의 `input`·`talk`·`result` 화면, `rethinkBox`, 판정 상자를 옮기고 부품을 씁니다.
  - `startHint`는 `"반례 질문은 고른 교과서에서 오늘까지 배운 내용으로만 나와요."`입니다.
  - 등록 이름과 `createSession`은 `root.SokElenchus`의 것을 씁니다.
- [ ] **Step 3: `app.js` 줄이기.**
  - 남길 것: 설정·시작 화면, 위 막대, 타이머, 설정에서 돌아가기, `newStudent`, `goHome`, `liveLLM`, `copy`·`toast`·`onEnter`·`today`.
  - `VIEWS` 대신 `show(view)`가 `settings`·`start`는 자기 것을, 나머지는 `method().views[view](kit())`를 씁니다.
  - 시작 화면 안내 글은 `method().startHint`를 씁니다.
  - 정리 방법 select의 onchange에서 `sok.method`를 저장합니다. 처음 값은 저장값이 목록에 있으면 그것, 없으면 첫 방법입니다.
  - `root.SokApp = { registerMethod, methods, show }`는 유지하되, `methods`는 `root.SokMethods`입니다.
- [ ] **Step 4: 스크립트 줄.** `index.html`과 `views.html`에서 `core/ui.js` 뒤에 `core/parts.js`를, `methods/elenchus.js` 뒤에 `methods/elenchus-views.js`를 넣습니다. 바뀐 파일에는 `?v=2`를 붙입니다.
- [ ] **Step 5: 기준값과 비교**
  - Run: `…/tests/views.html?run=elenchus&compare=1&v=3`
  - Expected: `같음 10/10`. 다르면 첫 차이를 보고 부품을 고칩니다(기준값은 고치지 않음).
- [ ] **Step 6: 단위 테스트**
  - Run: `cd app && node --test "tests/*.test.js"`
  - Expected: pass 177, fail 0.
- [ ] **Step 7: 실제 앱 확인**
  - `http://localhost:8765/index.html?v=3`에서 콘솔 오류 0을 봅니다.
  - 시작 화면이 기존과 같은지 스크린샷으로 봅니다.
  - 저장된 키가 있으면(값은 보지 않고 `!!loadSettings().apiKey`만) 엘렌코스 학생 1명을 끝까지 돌려 봅니다. 없으면 사용자님께 [설정]에 넣어 달라고 부탁하고, 그동안 하네스 결과로 갈음합니다.
- [ ] **Step 8: Commit** (사용자님이 말씀하실 때) `refactor: 방법마다 자기 화면을 가져오는 공통 틀`

### Task 3: 도움말 계산 나누기 (`ui.js`)

**Files:**
- Modify: `app/core/ui.js`
- Test: `app/tests/ui-help.test.js` (새)

**Interfaces:**
- Produces: `SokUI.helpFor(topic, textbookId, { item, misconception, lessonId })` → `{ item, truth, where, hints, notes } | null`(교과서가 없을 때만 null). `teacherHelp(topic, textbookId, state, lessonId)`는 판정 확인 뒤 `helpFor(topic, textbookId, { item: 대상 항목, misconception: state.misconception, lessonId })`를 돌려줌.

- [ ] **Step 1: 실패하는 테스트 쓰기** (`data/topic-3-2.js`를 `D`로)
  - `helpFor with a misconception id equals teacherHelp for the same item`: `helpFor(D,"chunjae",{item:"x",misconception:"3-2.m01",lessonId:null})`가 `teacherHelp(D,"chunjae",{verdict:"hold",items:["x"],target:0,misconception:"3-2.m01"})`와 deepEqual.
  - `helpFor without misconception points to today's lesson`: `helpFor(D,"icecream",{item:"y",misconception:null,lessonId:"3-12"})`의 `.truth === null`, `.hints`는 `[]`, `.where`에 `"3단원"`이 들어 있음, `.notes.length > 0`.
  - `helpFor with unknown textbook is null`.
- [ ] **Step 2:** Run `node --test tests/ui-help.test.js` → FAIL(`helpFor is not a function`).
- [ ] **Step 3: `helpFor` 구현.** `teacherHelp` 몸통을 옮기고 `teacherHelp`는 위 Interfaces대로 부릅니다.
- [ ] **Step 4:** Run `node --test "tests/*.test.js"` → 기존 177 + 새 3개 통과.

### Task 4: 모르는 친구 — 응답 형식과 검사 (`friend.js` 앞부분)

**Files:**
- Create: `app/methods/friend.js`
- Test: `app/tests/friend.test.js`

**Interfaces:**
- Produces (`SokFriend`, Node `module.exports`·브라우저 `root.SokFriend`):
  - `id: "friend"`, `name: "모르는 친구"`
  - `KINDS = ["meaning","more","retry","mixup"]`
  - `MARK_TEXT = { explained:"잘 설명했어요", corrected:"친구를 바로잡았어요", together:"함께 더 알아봐요" }`
  - `marksFor(kind)` → mixup이면 `["corrected","together"]`, 아니면 `["explained","together"]`
  - `DEFAULT_QUESTION = { meaning:"조금 더 자세히 알려 줄래요?", more:"조금 더 자세히 알려 줄래요?", retry:"오늘 배운 것 하나만 알려 줄래요?" }`
  - `DEFAULT_FINISH = { thanks:"설명해 줘서 고마워요!", nextQuestion:"오늘 배운 것을 다음 시간에 다시 말해 볼까요?" }`
  - `ERROR_MESSAGE` (엘렌코스와 같은 글)
  - `schemaFor({ stage: "ask"|"finish", kinds?: string[], prevKind: string|null })` → JSON 스키마. ask: `stage` enum `["ask"]`, `mark` enum(`prevKind` 있으면 `marksFor(prevKind)`, 없으면 `["none"]`), `kind` enum `kinds`, `misconception`·`reaction`·`question` 문자열. finish: `stage` `["finish"]`, `mark` 같은 규칙, `thanks`, `nextQuestion`. 모두 required, `additionalProperties:false`.
  - `validateFriendStep(out, expect)` → `{ ok:true } | { ok:false, reason }`. `expect = { stage, kinds, prevKind, scopeMisc:Set, usedMisc:Set, asked:string[] }`.

- [ ] **Step 1: 실패하는 테스트 쓰기**
  - `schemaFor narrows kind and mark`: `schemaFor({stage:"ask",kinds:["mixup"],prevKind:"meaning"})`의 kind enum `["mixup"]`, mark enum `["explained","together"]`. prevKind null이면 mark enum `["none"]`.
  - validate 통과: 좋은 ask(`kind:"meaning"`, `question:"정전이 뭐예요?"`, `reaction:""`, `mark:"none"`, `misconception:"none"`).
  - validate 실패(이유 문자열에 단서가 있는지까지):
    - 허락 안 된 kind
    - 짝 안 맞는 mark(prevKind mixup에 explained)
    - mixup인데 범위 밖 id
    - mixup인데 이미 쓴 id
    - 반말 질문 `"정전이 뭐야?"`
    - 41자 질문
    - 앞 질문과 띄어쓰기만 다른 질문
    - 반응 21자
    - 반응에 `?`
    - 반응 `"맞아요!"`
    - 반응에 `"정답은"`
    - finish의 빈 thanks
    - thanks 41자
    - thanks가 `"학생이 "`로 시작
    - nextQuestion이 `"…다."`로 끝남
  - 경계값 통과: 질문 40자, 반응 20자, thanks 40자.
- [ ] **Step 2:** Run `node --test tests/friend.test.js` → FAIL(모듈 없음).
- [ ] **Step 3: 구현.**
  - `require("../core/guard.js")`의 `checkQuestion`·`charLen`·`FORBIDDEN`을 씁니다. 칭찬 정규식은 `/맞아|잘했|정답|훌륭/`, 3인칭 정규식은 `/^학생(이|은|의|도|에게)\s/`입니다.
  - 검사 차례: stage → kind → mark 짝 → misconception → question → reaction(ask) / mark → thanks → nextQuestion(finish).
- [ ] **Step 4:** Run → PASS. 전체 테스트도 통과.

### Task 5: 모르는 친구 — 프롬프트와 세션

**Files:**
- Modify: `app/methods/friend.js`
- Test: `app/tests/friend.test.js`

**Interfaces:**
- Consumes: Task 4의 `schemaFor`, `validateFriendStep`, 기본값. `SokTopic.buildContext`, `SokTopic.scopeFor`.
- Produces:
  - `SYSTEM_PROMPT`(문자열)
  - `createSession({ topic, textbookId, lessonId=null, llm, sourceText=null })` → `{ getState, submitExplanation(text), submitAnswer(text), finishNow(), retry(), cancel() }`
  - 상태는 설계 6.7 그대로입니다: `turns[i] = { q, kind, misconception, reaction, a, mark }`, `thanks`, `nextQuestion`, `fallbacks`.

- [ ] **Step 1: 실패하는 테스트 쓰기** (가짜 AI는 `elenchus.test.js`의 `fakeLLM` 모양, 주제는 `fixtures/topic-mini.js`, 교과서 `"a"`)
  - `rejects blank explanation`
  - `full flow`: 설명 → ASK(meaning) → 답 → ASK(mark explained, mixup m1) → 답 → ASK(mark corrected, meaning) → 답 → FINISH(mark together)
    - phase `done`, turns 3개, marks `["explained","corrected","together"]`
    - thanks·nextQuestion이 채워짐, 호출 4번
  - `call schemas`: 호출별 스키마의 kind enum이 `["meaning","more","retry"]`, `["mixup"]`, `["meaning","mixup"]`이고, 마지막은 finish이며 mark enum이 `marksFor("meaning")`.
  - `no misconception left → question 2 is meaning`: 교과서 `"a"`의 범위 오개념(m1, m2)을 질문 2·3에서 다 쓰게 한 다른 경우를 씁니다. 범위가 빈 주제(오개념 배열을 비운 복사본)에서는 질문 2의 kind enum이 `["meaning"]`.
  - `finishNow with no answers`: ASK 뒤 `finishNow()` → finish 스키마 mark enum `["none"]`, turns 0개, phase done.
  - `finishNow after one answer drops the unanswered question`: turns 1개(mark 있음).
  - `retry on bad question`: ASK(반말) → ASK(정상). 두 번째 요청 메시지에 `"검사에 걸렸어요"`와 까닭이 있고, fallbacks 0.
  - `fallback after two bad questions`: 질문이 `DEFAULT_QUESTION[kind]`, fallbacks 1. mixup 자리면 kind가 `"meaning"`, 앞 질문 mark는 `"together"`.
  - `finish fallback after three bad finishes`: `DEFAULT_FINISH`, 마지막 mark `"together"`.
  - `invalid misconception is not stored`: (검사에서 걸러져 다시 받음) 최종 turn의 misconception이 범위 안 id.
  - `cancel drops late response`: 세대 번호(엘렌코스 테스트와 같은 방식).
  - `error then retry`: 첫 호출 Error → phase error, `ERROR_MESSAGE` → retry → asking.
  - `cache blocks`: system이 `sourceText`가 있으면 2블록(둘째에 `cache_control`), user content가 2블록(첫째가 `buildContext` 글 + `cache_control`, 둘째에 `"[학생의 설명]"`).
  - `prompt rules`: `SYSTEM_PROMPT`에 다음 말들이 들어 있음 — `"정답"`, `"퀴즈"`, `"오늘 차시 교과서 원문"`, `"전체 개념"`, `"같은 뜻으로 인정할 말"`, `"반응"`, `"맞아요"`(쓰지 말라는 규칙), `"친구를 바로잡았어요"`(표시 기준).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: 프롬프트 쓰기.**
  - 엘렌코스 `SYSTEM_PROMPT`에서 다음 규칙을 가져옵니다: 범위, 정답 말하지 않기, 질문 형식, 쉬운 말, 같은 뜻 말, 원문·개념만 근거와 덜 자세한 것은 맞는 쪽, 금지어, 퀴즈 금지.
  - 설계 6.2~6.4를 더합니다: 친구 역할, 질문 종류와 차례, mixup 조건, 표시 기준과 짝, 반응·한마디·다음 시간 규칙, 몰라요·되묻기 처리.
  - 예시 대화를 1개 넣습니다(천재, 3-2.m03 군인만 다쳤다).
- [ ] **Step 4: 세션 구현.** 엘렌코스 `createSession`의 뼈대(`run`, 세대 번호, `callChecked`의 다시 받기)를 따릅니다.
  - **질문 종류(코드가 정함)**:
    - 질문 1은 `["meaning","more","retry"]`입니다.
    - 질문 2는 쓸 수 있는 오개념(범위 − 쓴 것)이 있으면 `["mixup"]`, 없으면 `["meaning"]`입니다.
    - 질문 3은 `["meaning","mixup"]`에서 오개념이 없으면 mixup을 뺍니다.
  - **메시지 둘째 블록**: `[학생의 설명]`, `[지금까지의 문답]`(질문·종류·오개념 id·답·표시), `지금 할 일: …(허락된 종류, 남은 질문 수)`, 다시 받을 때 `[앞 응답이 검사에 걸렸어요: 까닭] 이 점만 고쳐 다시 내세요.`
  - **다시 받기**: ask는 2번, finish는 3번입니다. 그래도 걸리면 기본값을 씁니다(mixup 자리는 meaning 기본 질문, mark는 together, reaction은 "").
- [ ] **Step 5:** Run → PASS, 전체도 통과.

### Task 6: 모르는 친구 — 결과 글과 도움말

**Files:**
- Modify: `app/methods/friend.js`
- Test: `app/tests/friend.test.js`

**Interfaces:**
- Consumes: Task 3 `SokUI.helpFor`(Node에서는 `require("../core/ui.js")`).
- Produces:
  - `resultText({ topicTitle, textbookName, dateStr, state })` → 설계 6.9 모양의 글(첫 줄 `[모르는 친구 학습정리] …`, 답 뒤 `(표시 글)`)
  - `friendHelp(topic, textbookId, state, lessonId)` → `null`(together 없음) 또는 `{ sections: [{ item, truth, where, hints, notes }] }`. 오늘 차시 쪽(오개념 없는 together)은 첫 것만 `where`·`notes`를 갖고, 둘째부터는 `item`만 있음(`where:null, notes:[]`).

- [ ] **Step 1: 실패하는 테스트 쓰기**
  - `resultText` 줄 확인: 표시 글이 붙고, 답하지 않은 질문은 없음.
  - `friendHelp` null(모두 explained/corrected).
  - mixup together → `sections[0].truth`가 그 오개념의 truth.
  - 오개념 없는 together 둘 → 두 번째 섹션 `where === null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** 구현. **Step 4:** Run → PASS, 전체도 통과.

### Task 7: 모르는 친구 화면

**Files:**
- Create: `app/methods/friend-views.js`
- Modify: `app/core/style.css`, `app/index.html`, `app/tests/views.html`

**Interfaces:**
- Consumes: `SokParts`, `kit`, `SokFriend`(`MARK_TEXT`, `resultText`, `friendHelp`, `createSession`), Task 2의 등록 방식.
- Produces: 방법 `{ id:"friend", name:"모르는 친구", startHint:"친구의 질문은 고른 교과서에서 오늘까지 배운 내용으로만 나와요.", … }`.

- [ ] **Step 1: 화면 쓰기** (설계 6.1)
  - **input**: `goal` + 제목 "친구에게 오늘 배운 것을 설명해 볼까요?" + `textarea#explain`(rows 3, 자리 글 "예) 오늘은 ~을 배웠어요. ~해서 ~가 되었어요.") + [보내기]. Enter는 줄바꿈 없이 보내기입니다(엘렌코스와 같은 `onEnter`).
  - **talk**: 설명 상자(`.explain-box`) + 지난 문답(`.history`) + `thinkingCard`/`questionCard("모르는 친구", dots, question, reaction)` + `answerArea` / `errorArea`.
  - **result**: `goal` + "나의 설명" 상자 + 질문 목록(`ol.marks`, 줄마다 질문·답·`span.mark.{explained|corrected|together}`) + 친구의 한마디·다음 시간(`.summary` 모양 재사용) + 섹션별 `helperBox` + `recordBox` + `resultActions(kit, resultText(...))`.
- [ ] **Step 2: CSS.**
  - `.explain-box`는 `.history`와 비슷한 작은 글로 합니다.
  - `.mark.explained`는 `--ok` 계열, `.corrected`는 `--accent` 계열, `.together`는 `--amber` 계열입니다. 빨간색은 쓰지 않습니다.
  - `.qcard .reaction`은 24~28px로 합니다.
- [ ] **Step 3: 스크립트 줄.** `methods/friend.js`, `methods/friend-views.js`를 엘렌코스 뒤에 넣습니다(`index.html`, `views.html`, `?v=` 올림).
- [ ] **Step 4: 하네스에 `SCENES.friend` 더하기**
  - `input`, `waiting`, `asking-1`, `asking-2`(반응 있음), `result-mixed`(explained/corrected/together, 도움말 있음), `result-none`(질문 0개로 끝냄), `error`
  - Run: `…/tests/views.html?run=friend&v=4` → 스크린샷으로 각 장면을 봅니다. TV 글씨, 빨간색 없음, 넘침 없음을 확인합니다.
- [ ] **Step 5: 엘렌코스 회귀 확인**
  - `?run=elenchus&compare=1`의 `start` 장면은 정리 방법 목록에 옵션이 하나 늘어 다릅니다. 이 장면은 기준값에 모르는 친구 옵션을 더한 값과 같아야 합니다.
  - 나머지 9장면은 같음이어야 합니다.
  - 전체 단위 테스트도 통과해야 합니다.
- [ ] **Step 6: 실제 앱**
  - 시작에서 "모르는 친구"를 골라 학생 1명을 끝까지 해 봅니다(키는 사용자님이 넣은 것).
  - 다시 열었을 때 방법이 기억되는지 봅니다.
  - 콘솔 오류 0을 확인합니다.
- [ ] **Step 7: Commit** (사용자님이 말씀하실 때) `feat: 모르는 친구 학습정리`

### Task 8: 실제 AI 점검

**Files:**
- Create: `app/tests/live-friend-cases.js`, `app/tests/live-friend.html`, `app/tests/live-friend-cases.test.js`, `docs/live-check-friend-2026-11-24.md`

**Interfaces:**
- Produces: `SokLiveFriendCases.cases`
  - 각 사례: `{ name, group, textbookId, unitId: 3, key, explanation, answers: string[], mixup: string, byMisc?: { [miscId]: string }, expect }`
  - `expect`: `{ marks?: string[] }` | `{ all?: "together" }` | `{ noTogether?: true }` | `{ some?: "corrected" }`
  - 답 고르기:
    - mixup 질문이면 `byMisc[id] ?? mixup`을 씁니다.
    - 그 밖이면 `answers`를 차례로 씁니다.
    - 답이 떨어지면 `finishNow`입니다.

- [ ] **Step 1: 사례 쓰기** (약 18건, 세 교과서 고루, 3-1·3-2 섞기, 설계 7.2 목록 + 단원 마무리 1건. 학생 이름 없음)
- [ ] **Step 2: 모양 테스트** (`live-friend-cases.test.js`)
  - 건수가 맞을 것
  - 교과서마다 5건 이상일 것
  - 차시 key가 `Cat.resolve`로 그대로 풀릴 것(엘렌코스 테스트와 같은 방식)
  - `byMisc`의 id가 그 교과서 범위 안에 있을 것
  - 이름 칸이 없을 것
  - Run → PASS.
- [ ] **Step 3: `live-friend.html`**: `live.html`을 본뜹니다.
  - 표 칸: #, 경우, 설명, 질문(종류·반응·글자 수), 답, 표시, 기대, 일치, 한마디, 다음 시간, 대체, 호출, 시간
  - "같음"으로 세는 조건: 기대 충족 + 대체 0 + 퀴즈형 0(`SokLiveCases.QUIZ`, 모든 질문) + 질문 2가 mixup(범위에 오개념이 있으면)
  - [Markdown 복사]
- [ ] **Step 4: 돌리기**
  - 키는 사용자님이 [설정]에 넣은 것을 씁니다. 있는지만 확인합니다.
  - 하이쿠로 돌리고, 45초 단위로 나누어 기다립니다.
  - Expected: 대체 0, 퀴즈 0.
  - 반응·한마디에 정답이 흘렀는지는 표를 사람이 읽어 확인합니다.
- [ ] **Step 5: "하면 안 되는 것" 위반이면 고치고 다시 돌리기**
  - 위반: 정답 흘림, 퀴즈, 반말, 대체가 잦음
  - 고친 뒤 이전 결과와 비교합니다.
  - 표시 판단이 다른 것은 고치지 않고 기록합니다.
- [ ] **Step 6:** 결과 표와 요약을 `docs/live-check-friend-2026-11-24.md`에 남깁니다.

### Task 9: 학생 예시와 정리 문서

**Files:**
- Create: `docs/friend-handoff.md`

- [ ] **Step 1: 테스트용 설명 예시 5명분** (3단원 한 차시, 고른 교과서 명시, 채팅으로 드림)
  - 잘 설명하는 학생
  - 오개념을 섞은 학생
  - 학습 수준이 낮아 짧게 쓴 학생
  - "몰라요"라고 하는 학생
  - 장난치거나 되묻는 학생
  - 학생마다 친구 질문에 어떻게 답해 보면 좋은지도 한두 줄 붙입니다.
- [ ] **Step 2: `docs/friend-handoff.md`** (`elenchus-handoff.md`처럼)
  - 0장: 이번에 사용자님이 정한 것
  - 공통 틀 사용법: 방법 등록, kit, 부품, 세션 약속, 하네스로 회귀 확인하는 법(3~6번이 따라 할 차례)
  - 모르는 친구가 하는 일, 질문 종류, 표시, 검사, 비용
  - 점검 결과, 배운 것, 남은 문제와 보완 후보(사용자님 판단 대기)
- [ ] **Step 3: 마지막 확인**
  - 전체 단위 테스트를 돌리고 숫자를 적습니다.
  - `git status`로 원문 파일(`app/local/`, `work/`)이 바뀐 목록에 없는지 봅니다.

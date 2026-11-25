# 오답 탐정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 소크라테스 앱에 세 번째 방법 "오답 탐정"(친구의 정리 4문장 중 숨은 틀린 생각을 찾고 까닭을 말하기)을 검증한 문제 데이터 56개와 함께 붙입니다.

**Architecture:** 공통 틀(`SokMethods` 등록, `SokParts`, `views`)에 방법 파일 두 개(`methods/detective.js` 흐름, `methods/detective-views.js` 화면)를 더합니다. 문제는 새 데이터 파일(`data/detective-3-*.js`)에 미리 만들어 두고, AI는 숨은 문장에 대한 학생의 까닭만 판단하고 이어 묻는 질문 하나를 냅니다. 흐름·횟수·검사 실패 처리는 코드가 정합니다.

**Tech Stack:** 빌드 없는 일반 스크립트(`(function (root) { … })(this)`, 브라우저 전역 + `module.exports`), `node --test`, Claude API(`llm.call({ system, messages, schema })` → JSON), 기본 모델 `claude-haiku-5-5`.

**Spec:** `docs/superpowers/specs/2026-11-25-detective-method-design.md` (먼저 읽을 것: `docs/elenchus-handoff.md`, `docs/friend-handoff.md`, 본보기 `app/methods/friend.js`, `friend-views.js`)

## Global Constraints

- 이 브랜치(`claude/method-wrong-detective-f5a3c6`)에만 커밋. 푸시·main 합치기 안 함.
- 새 파일은 오답 탐정 것만. `data/topic-*.js`, `data/units.js`, `methods/friend*.js`, `methods/elenchus*.js`는 고치지 않음.
- 공통 파일(`core/*`, `index.html`, `tests/views.html`, `core/style.css`, `review.html`)은 **줄 더하기만**. 기존 줄을 바꾸거나 지우지 않음. `core/style.css`, `index.html`, `tests/views.html`, `core/app.js`는 CRLF 줄끝 — Edit 도구로 고침.
- AI 출력과 학생에게 보이는 글: "틀렸", "정답은", "오답" 금지(방법 이름 "오답 탐정"은 예외). 고정 문구는 "틀린 곳" 대신 "이상한 곳". 빨간색·X·점수 금지. 학생에게 하는 말은 존댓말.
- 질문: 40자 이내, 한 문장, "요?"로 끝, 퀴즈형(이름·연도·장소·숫자 맞히기) 금지, "~요, ~요?" 고르기 꼴 금지.
- 데이터에 교과서 문장 25자 이상 그대로 옮기지 않음. 교과서 원문(`work/`, `app/local/`)은 커밋하지 않음(gitignore).
- API 키 값을 읽거나 출력하지 않음. 키는 사용자님이 `http://localhost:8773`의 [설정]에 직접 넣음.
- 개발 서버 `.claude/launch.json`의 `sokrates-detective`(포트 8773) — 이 파일 변경은 커밋하지 않음.
- 고정 문구(스펙 6·8장 그대로):
  - 시작 제목 "친구의 정리에서 이상한 곳을 찾아볼까요?", 문제 안내 "친구가 배운 것을 이렇게 정리했어요. 한 곳이 이상해요.", 까닭 묻기 "이 문장이 왜 이상한가요?"
  - 맞는 문장 1번째 "생각을 말해 줘서 고마워요. 다른 문장도 다시 읽어 볼까요?" / 2번째 "이 문제는 선생님과 함께 알아봐요. 다음 문제로 가 볼까요?"
  - 까닭까지 "까닭까지 찾아냈어요! 다음 문제로 가 볼까요?" / 찾았지만 막힘 "이상한 곳을 찾았어요. 까닭은 선생님과 함께 더 알아봐요."
  - 표시 `solved` "까닭까지 밝혔어요", `found` "이상한 곳을 찾았어요", `together` "함께 더 알아봐요"
  - 기본 질문 "그 부분이 실제로는 어땠는지 말해 줄래요?", "왜 그렇게 생각했는지 더 말해 줄래요?"
  - 말하는 이 "오답 탐정", startHint "문제는 고른 교과서에서 오늘까지 배운 내용으로만 나와요."

## Review Focus

1. 숨은 문장을 누른 뒤 보내기 전에 다른 카드로 바꿈 → 선택만 바뀌고, 어느 카드를 눌러도 화면(까닭 칸·문구)이 같아 정답이 드러나지 않아야 함. (Task 3 `select changes before send, same prompt for any card`)
2. AI를 기다리는 중에 [다음 학생] → 늦게 온 응답을 버리고 새 세션이 깨끗해야 함. (Task 3 `cancel drops a late judge response`)
3. 같은 차시에서 학생이 문제 수보다 많아짐 → 기억을 비우고 다시 돌며, 한 학생에게 같은 오개념 두 번은 없어야 함. (Task 2 `rotation wraps when every candidate was served`)
4. 까닭 칸이 비었거나 공백만 → 보내지지 않고 상태가 그대로. (Task 3 `blank reason is ignored`)
5. 학생이 먼저 말한 정답 낱말을 AI 질문이 되받음 → 막지 않아야 함(띄어쓰기 무시). 반대로 학생이 말하지 않은 정답 낱말은 막음. (Task 2 `leak check allows words the student said`)

---

### Task 1: 문제 데이터 56개와 데이터 테스트·목록 화면

**Files:**
- Create: `app/tests/detective-data.test.js`, `app/data/detective-3-1.js`, `app/data/detective-3-2.js`, `app/tests/detective-data.html`

**Interfaces:**
- Produces: 데이터 파일 모양(스펙 9.1). 브라우저: `(root.SokDetectiveData = root.SokDetectiveData || {})["3-1"] = DATA;` Node: `module.exports = DATA`. `DATA = { topic: "3-1", problems: [{ id, misconception, textbooks, sentences[4], hidden, key, hints, leakWords, reviewed }] }`. id 꼴 `"3-1.m08.a"` / `".b"`.

이 Task의 초안·검증은 에이전트가 맡으므로 **배경에서 시작해 두고 Task 2~4를 먼저 진행**해도 됩니다(Task 2~4의 테스트는 직접 만든 작은 문제 묶음을 씀).

- [ ] **Step 1: 데이터 테스트 쓰기** — `detective-data.test.js`. 묶음 데이터(`data/topic-3-1.js`, `topic-3-2.js`)와 문제 파일을 require 해 스펙 9.4를 그대로 검사:
  - `each misconception has exactly 2 problems` (28개 × 2 = 56, id 겹침 없음, `misconception`이 묶음에 있음, id가 `${misconception}.a|b`)
  - `textbooks are a non-empty subset of the misconception sources`
  - `four sentences within 40 chars, hidden in 0..3` (문장마다 `Array.from(s).length <= 40`, "요."로 끝)
  - `hidden positions are spread` (0~3 각각 8개 이상)
  - `key within 40 chars; hints are short non-quiz questions` (hints 2개 이상, "?"로 끝, 40자 이내, `data.test.js`의 `QUIZ` 정규식에 안 걸림)
  - `leakWords present and absent from every sentence` (띄어쓰기 무시 비교)
  - `all reviewed`
  - `no long verbatim` (`data.test.js`와 같은 방법·같은 `norm`, 대상 문장: sentences·key·hints. `work/` 없으면 skip)
- [ ] **Step 2: 실패 확인** — `cd app && node --test tests/detective-data.test.js` → 파일 없음으로 FAIL.
- [ ] **Step 3: 초안 에이전트** (묶음별 2개, 배경). 프롬프트에 넣을 것: 스펙 9.1~9.2 규칙 전문, 그 묶음의 오개념 전체(틀린/바른 생각·sources·counterHints·concepts), 관련 개념, 원문 경로(`work/3/{교과서}/{차시}.txt`, 오개념 sources의 차시와 그 앞 차시), "출력은 데이터 파일 JS 하나 + 문제마다 맞는 문장의 원문 근거 메모(교과서·차시·쪽)를 따로 `C:\Users\User\AppData\Local\Temp\claude\…\scratchpad\detective-draft-notes-3-x.md`", `reviewed: false`.
- [ ] **Step 4: 새 맥락의 검증 에이전트** (묶음별, 초안을 쓰지 않은 에이전트). 스펙 9.3의 3번 목록을 문제마다 원문과 대조, 고친 안과 까닭을 표로. 고친 것을 반영하고 `reviewed: true`.
- [ ] **Step 5: 테스트 통과** — `node --test tests/detective-data.test.js` PASS, 그리고 `node --test "tests/*.test.js"` 전부 PASS.
- [ ] **Step 6: 목록 화면** `tests/detective-data.html` — 데이터·묶음 스크립트를 불러 교과서(천재·아이스크림·비상) → 차시 순으로 문제 카드(문장 4개, 숨은 문장은 호박색 배경 + "숨은 문장" 꼬리표, 핵심 생각, 실마리, 정답 낱말)를 보여 줌. 키 필요 없음. 8773에서 열어 스크린샷.
- [ ] **Step 7: Commit** — `git add app/data/detective-3-*.js app/tests/detective-data.test.js app/tests/detective-data.html` → `feat: 오답 탐정 문제 데이터 56개(원문 대조 검증)`

### Task 2: 흐름 파일의 순수 부분 — 형식·검사·문제 고르기

**Files:**
- Create: `app/methods/detective.js`, `app/tests/detective.test.js`, `app/tests/fixtures/detective-problems.js`

**Interfaces:**
- Consumes: `G = core/guard.js`(`checkQuestion`, `charLen`, `FORBIDDEN`), `T = core/topic.js`(`scopeFor`, `buildContext`), `U = core/ui.js`(`helpFor`)
- Produces (`SokDetective`, Node `module.exports`):
  - 상수 `id: "detective"`, `name: "오답 탐정"`, `MARK_TEXT`, `LINES = { wrongFirst, wrongLast, solved, found }`, `DEFAULT_QUESTIONS: string[2]`, `MAX_FOLLOW = 2`, `MAX_WRONG = 2`, `PROBLEM_COUNT = 2`, `ERROR_MESSAGE`(친구와 같은 문구)
  - `schemaFor(stage: "judge"|"final"|"question") → JSON schema` — judge `{result: enum[solved,ask], question}`, final `{result: enum[solved,found]}`, question `{result: enum[ask], question}`; 모두 `additionalProperties:false`, 칸 모두 required
  - `validateDetectiveStep(out, { stage, asked: string[], leakWords: string[], said: string }) → { ok: true } | { ok: false, reason }`
  - `isChoice(q) → boolean` (friend.js의 `CHOICE_TWO`·`CHOICE_ILKKA`와 같은 정규식을 이 파일에 둠)
  - `leakIn(question, leakWords, said) → string | null` (띄어쓰기 지운 비교. `said`에 있는 낱말은 통과)
  - `pickProblems({ problems, topic, textbookId, lessonId, served: Set<string>, random: () => number }) → problem[]` (길이 0~2)
- `tests/fixtures/detective-problems.js`: 작은 문제 묶음(Node·브라우저 겸용, 브라우저 전역 `SOK_DETECTIVE_FIXTURE`). 천재 기준으로 오늘 차시 3-12의 `3-2.m06.a/.b`, `3-2.m08.a`, 앞 차시 3-11의 `3-2.m02.a`, 단원 첫 차시 3-2의 `3-1.m01.a`. 문장은 만든 사람이 지어도 됨(검증 데이터 아님), `leakWords` 포함.

- [ ] **Step 1: 실패하는 테스트 쓰기** (`detective.test.js`, 묶음은 `load("data/topic-3-1.js")`·`topic-3-2.js`를 `T.mergeTopics`로 합침)
  - `schemaFor narrows result per stage` — judge enum `["solved","ask"]`, final `["solved","found"]`, question `["ask"]`, required 정렬 비교
  - `validate: good judge, good final` / `validate: result outside the stage enum` (/허용/)
  - `validate: ask needs a polite one-sentence question` (반말 → /존댓말/, 41자 → /40자/)
  - `validate: choice question is rejected` ("정부가 세웠을까요, 학생들이 시작했을까요?" → /고르/)
  - `validate: repeated question (spacing ignored)` (/앞에서 한 질문/)
  - `leak check blocks truth words the student has not said` — leakWords `["도쿄","윤봉길"]`, said `"이봉창이 아니에요"`, question `"도쿄에서는 무슨 일이 있었을까요?"` → `leakIn` = `"도쿄"`, validate reason /도쿄/
  - `leak check allows words the student said` — said `"도 쿄에서 던졌어요"` → `leakIn` null
  - `solved needs no question` — `{result:"solved", question:""}` ok
  - `pick: first from today, second from an earlier lesson` — 천재 3-12, random `() => 0` → 첫 문제 misconception ∈ {3-2.m06, 3-2.m08}, 둘째 = `3-2.m02`(3-11)
  - `pick: unit's first lesson with one misconception gives one problem` — 천재 3-2 → 길이 1, `3-1.m01`
  - `pick: unit wrap-up gives two different misconceptions` — lessonId null
  - `pick: unserved problems first, then unserved misconceptions` — served = {3-2.m06.a} → 첫 문제 id ≠ 3-2.m06.a 이고 오개념도 3-2.m06이 아님(3-2.m08.a)
  - `rotation wraps when every candidate was served` — 오늘 차시 후보를 모두 served에 넣고 고름 → 길이 2, 두 오개념 다름, served가 비워진 뒤 다시 채워짐
  - `pick: textbook outside problem.textbooks is skipped` — 아이스크림이 빠진 문제는 아이스크림에서 안 나옴
- [ ] **Step 2: 실패 확인** — `node --test tests/detective.test.js` → 모듈 없음 FAIL
- [ ] **Step 3: 구현** — 위 Produces 그대로. `pickProblems`: 후보 = `problem.textbooks.includes(textbookId)` 이고 `T.scopeFor(topic, textbookId, lessonId).misconceptions`에 오개념이 있는 것. 오늘/앞 차시 구분은 오개념 `sources[textbookId].lesson === lessonId`. 고르는 차례: (served에 없는 문제 → served에 있는 문제 중 오개념이 아직 안 나온 것 → 나머지), 같은 급에서는 `random`. 후보 전부가 served면 served를 비우고 다시. 둘째 문제는 첫 문제와 다른 오개념. 고른 문제 id를 served에 넣음. 검사 실패 까닭은 다시 받을 때 고칠 수 있게 구체적으로("질문에 '도쿄'가 있음 — 학생이 아직 말하지 않은 바른 생각의 낱말은 쓰지 말 것").
- [ ] **Step 4: 통과 확인** — `node --test tests/detective.test.js` PASS
- [ ] **Step 5: Commit** — `feat: 오답 탐정 응답 형식·검사·문제 고르기`

### Task 3: 세션 흐름·프롬프트·결과 글·도움말

**Files:**
- Modify: `app/methods/detective.js`, `app/tests/detective.test.js`

**Interfaces:**
- Produces:
  - `createSession({ topic, textbookId, lessonId = null, llm, sourceText = null, problems = allProblems(), problemIds = null, random = Math.random, served = SERVED.get(key) }) → session` — `allProblems()`는 브라우저에서 `Object.values(root.SokDetectiveData || {}).flatMap(d => d.problems)`, Node에서 `[]`. `SERVED`는 모듈의 `Map("교과서|차시" → Set)`. `problemIds`가 있으면 고르기 없이 그 차례로.
  - 세션: `getState()`, `start()`, `select(i)`, `submitReason(text)`, `submitAnswer(text)`, `next()`, `finishNow()`, `retry()`, `cancel()` — 동작은 모두 Promise<state>를 돌려줌(`kit.act`로 감쌈)
  - 상태: `{ phase: "input"|"asking"|"waiting"|"error"|"done", problems: problem[], index, step: "pick"|"follow"|"between", selected: number|null, line: string|null, question: string|null, records: [{ problemId, wrongTaps: [{ index, reason }], reason: string|null, turns: [{ q, a }], mark: null|"solved"|"found"|"together" }], error, fallbacks }`
  - `resultText({ topicTitle, textbookName, dateStr, state }) → string` (머리 `[오답 탐정 학습정리] …`)
  - `detectiveHelp(topic, textbookId, state, lessonId) → { sections: [{ ...U.helpFor(...), itemLabel: "숨은 문장", item: 숨은 문장, wrongTaps: [{ sentence, reason }] }] } | null` — `solved`가 아니거나 wrongTaps가 있는 문제마다
  - `SYSTEM_PROMPT` (스펙 7.2·7.3 규칙, 이봉창 "안 됨" 예, 출력 형식 설명)

흐름(스펙 6.2·7): `start` → asking/pick, records[0] 생성. `select(i)` → pick 단계에서만, wrongTaps에 있는 카드는 무시, `line`을 지움. `submitReason` → 선택이 숨은 문장이 아니면 AI 없이 wrongTaps에 넣고 1번째면 `line = wrongFirst`, 2번째면 `mark together, step between, line = wrongLast`. 숨은 문장이면 `reason` 저장 → judge 호출 → solved면 `mark solved, between, line solved`; ask면 `step follow, question`. `submitAnswer` → turns에 넣고 turns < 2면 judge, =2면 final(solved/found, found면 `line found`). `next` → 다음 문제(records 추가, pick) 또는 done. `finishNow` → 하던 문제 mark 없으면 reason 있으면 found 아니면 together, done.
검사 실패 처리(스펙 7.4): judge는 2번까지, ask인데 질문이 걸렸으면 다음 시도는 schema "question"; 끝내 실패 → ask + 기본 질문(이미 한 것 제외), `fallbacks++`. final은 3번까지, 실패 → found, `fallbacks++`.
메시지(스펙 7.5): `[{ text: T.buildContext(...), cache_control }, { text: 학생마다 바뀌는 글 }]`, system은 friend.js `systemFor`와 같은 모양. 맞는 문장 누른 기록은 보내지 않음.

- [ ] **Step 1: 실패하는 테스트 쓰기** — 가짜 llm(`calls` 배열에 요청을 쌓고 큐에서 응답을 꺼냄, friend.test.js의 방식)으로:
  - `start shows problem 1 without calling AI` (calls 0, phase asking, step pick, records 1)
  - `select changes before send, same prompt for any card` (select(0) → select(hidden) → 상태의 `line` null, selected = hidden; 숨은 카드와 맞는 카드 선택 뒤 상태에서 `question`·`line`이 같음)
  - `blank reason is ignored` (`"  "` → 상태 그대로, calls 0)
  - `wrong card once: thanks line, card disabled; twice: together and between` (calls 0, wrongTaps 2개, select(첫 맞는 카드) 무시)
  - `hidden card solved at once` (judge solved → mark solved, line solved, calls 1)
  - `follow-ups: ask, ask, then final found` (3 calls, 마지막 schema enum `["solved","found"]`, mark found)
  - `follow-up answered well becomes solved`
  - `leaked question is re-asked with the question-only schema` (첫 응답 질문에 leakWord → 둘째 요청 schema enum `["ask"]`, 둘째 요청 글에 "검사에 걸렸어요")
  - `two bad questions fall back to a default question and count it` (fallbacks 1, 기본 질문 1번째)
  - `final keeps failing → found and fallback`
  - `finishNow: reason sent → found; only tapped → together; unstarted problems omitted`
  - `next goes to problem 2, then done after the last`
  - `one-problem session ends after the first` (천재 3-2)
  - `cancel drops a late judge response` (응답을 잡아 두었다가 cancel 뒤 풀어 줌 → 상태 input, records 비어 있음)
  - `error then retry repeats the judge call`
  - `message keeps two blocks, first cached; wrong taps are not sent` (둘째 블록에 숨은 문장 번호·핵심 생각·정답 낱말이 있고 wrongTaps의 생각 글은 없음)
  - `system prompt carries the rules` (SYSTEM_PROMPT에 "정답", "퀴즈", "몰라요", "안 됨"이 있고 "틀렸" 없음; 원문이 있으면 system 블록 2개 + cache_control)
  - `resultText shows found sentence only for found/solved problems`
  - `detectiveHelp: none when all solved without wrong taps; sections carry hidden sentence and wrong taps`
- [ ] **Step 2: 실패 확인** — `node --test tests/detective.test.js` FAIL(새 테스트)
- [ ] **Step 3: 구현** — 위 Interfaces 그대로, friend.js의 `callChecked`·`run`·세대 번호 뼈대를 따름
- [ ] **Step 4: 통과 확인** — `node --test "tests/*.test.js"` 전부 PASS
- [ ] **Step 5: Commit** — `feat: 오답 탐정 문답 흐름과 결과 글`

### Task 4: 화면·등록·스타일과 화면 비교

**Files:**
- Create: `app/methods/detective-views.js`
- Modify (줄 더하기만): `app/index.html`(데이터 2줄은 `topic-3-2.js` 다음, 방법 2줄은 `friend-views.js` 다음, `?v=1`), `app/core/style.css`(끝에 `/* 오답 탐정 */` 구역), `app/tests/views.html`(데이터·픽스처·방법 스크립트 줄, `SCENES.detective`, ADJUST를 감싸는 새 줄)

**Interfaces:**
- Consumes: Task 3의 세션·`MARK_TEXT`·`resultText`·`detectiveHelp`, `SokParts`(`goal`, `dots`, `thinkingCard`, `questionCard`, `answerArea`, `errorArea`, `helpLines`, `recordBox`, `resultActions`)
- Produces: `SokMethods`에 `{ id:"detective", name:"오답 탐정", startHint, createSession, views }` 등록

- [ ] **Step 1: 화면 비교 장면 쓰기** (`views.html`, 천재 12차시, 장면 시작 전에 `window.SokDetectiveData = { fixture: { problems: SOK_DETECTIVE_FIXTURE } }`로 바꾸고 `Math.random = () => 0`, `SokDetective` 기억 비우기). 장면: `start`, `input`(시작 안내), `pick`, `picked`(카드 누름), `wrong-1`(맞는 카드 보낸 뒤), `waiting`, `follow`(이어 묻는 질문), `between-solved`, `between-wrong`(맞는 카드 두 번), `result`(solved·found·together가 섞인 결과, 도움말 펼침 전), `error`. ADJUST 새 줄: 엘렌코스 `start`에서 `"모르는 친구</option></select>"` 뒤에 `<option value="detective">오답 탐정</option>`을 더하도록 기존 함수를 감쌈.
- [ ] **Step 2: 실패 확인** — `http://localhost:8773/tests/views.html?run=detective` → "실패: …"(방법 없음)
- [ ] **Step 3: 화면 구현** — input: 학습문제·제목·안내 2줄·[시작]. talk: 문제 안내, 문장 카드(`button.dt-card`, 누른 카드 `.picked`, 살펴본 카드 `.looked` + `disabled`), pick 단계에서 선택이 있으면 "이 문장이 왜 이상한가요?" + 까닭 칸 + [바로 정리하기][보내기](Enter 보내기), `line`이 있으면 그 문구 카드, follow 단계는 `P.questionCard("오답 탐정", dots, question)` + `P.answerArea`, between은 문구 + [다음 문제]/[결과 보기] + 진행 점 `P.dots(index+1, problems.length)`. result: 스펙 8.2 배치, 찾은 문장만 `.found` 표시, 표시 꼬리표 `span.mark.dt-{mark}`, 도움말은 `P.helpLines` + 학생이 본 문장 줄, `P.recordBox`, `P.resultActions`. 스타일: 초록(solved)·청록(found)·호박(together)은 기존 변수(`--ok`, `--accent`, `--amber` 와 `-soft`) 사용, 빨간색 없음.
- [ ] **Step 4: 확인**
  - `views.html?run=detective` → "장면 11개"
  - `views.html?run=elenchus&compare=1` → "같음 10/10"
  - `views.html?run=friend` 장면 해시가 `scratchpad/friend-baseline-hashes.json`과 같음(`start`는 오답 탐정 선택지를 지운 뒤 비교)
  - 시작 화면에서 오답 탐정 선택 → [시작하기] → 문제 화면을 가짜 AI 없이 스크린샷(`&stop=pick`, `&stop=result`)
  - `node --test "tests/*.test.js"` 전부 PASS
- [ ] **Step 5: Commit** — `feat: 오답 탐정 화면과 등록`

### Task 5: 실제 AI 점검 페이지와 하이쿠 점검

**Files:**
- Create: `app/tests/live-detective.html`, `app/tests/live-detective-cases.js`, `app/tests/live-detective-cases.test.js`

**Interfaces:**
- Consumes: `createSession({ problemIds, ... })`, 실제 데이터(Task 1), `SokLLM.createClaudeLLM(settings)`(live-friend.html과 같은 방식, `?model=` 덮어쓰기)
- 사례 모양: `{ name, textbookId, lessonId, problemIds: [id], taps: [카드 번호…](마지막이 숨은 문장이 아니면 찾지 못함), wrongReasons: [..], reason, answers: [..], expect: { mark: "solved"|"found"|"together" | [..] } }` — 학생 이름 없음

- [ ] **Step 1: 사례 모양 테스트** — `live-detective-cases.test.js`: 사례 14~18개, problemIds가 데이터에 있고 그 교과서에서 낼 수 있음, 이름 칸 없음, expect.mark가 MARK_TEXT 키. 실행 → FAIL(파일 없음)
- [ ] **Step 2: 사례 쓰기** — 스펙 11장 목록(바로 까닭, 부정만→이어 물어 까닭, "몰라요" 3번, 맞는 카드 한 번 뒤 찾음, 맞는 카드 두 번, 다른 부분을 이상하다고 함, 되물음, 장난, 낮은 수준 맞춤법, 단원 마무리, 교과서 세 가지 고루) → 테스트 PASS
- [ ] **Step 3: 점검 페이지** — live-friend.html을 본떠 [실행], 사례마다 표 한 줄(기대/결과 표시, 같음, 대체 횟수, 퀴즈형 질문 수, 모든 질문 글, 시간), 맨 위 합계. 키는 있는지만 봄.
- [ ] **Step 4: 사용자님께 키 부탁** — "`http://localhost:8773`의 [설정]에 키를 넣어 주세요" 말씀드리고 기다림
- [ ] **Step 5: 하이쿠로 실행** — `tests/live-detective.html?model=claude-haiku-5-5`, 45초 안으로 나누어 기다림. 결과 질문을 한 줄씩 읽어 정답 새기·퀴즈·반말·고르기 꼴을 찾고 `docs/live-check-detective-2026-11-25.md`에 기록
- [ ] **Step 6: Commit** — `test: 오답 탐정 실제 점검 페이지와 하이쿠 점검 기록`

### Task 6: 예시 학생·보완 목록·정리 문서

**Files:**
- Create: `docs/detective-handoff.md`

- [ ] **Step 1: 예시 학생 5명분** — 사용자님이 화면에서 해 볼 수 있게 교과서·차시와 누를 카드·쓸 까닭을 정리(낮은 수준, "몰라요" 포함). 채팅으로 드림.
- [ ] **Step 2: 보완 후보 목록** — 점검에서 본 것을 정리만(고칠지는 사용자님이 정함)
- [ ] **Step 3: 정리 문서** — friend-handoff.md 틀(정한 것, 한눈에, 흐름, 데이터와 공정, 검사, 점검, 배운 것, 남은 문제, 다음 세션에게)
- [ ] **Step 4: 최종 확인** — `node --test "tests/*.test.js"` 전부 PASS, `views.html?run=elenchus&compare=1` 같음 10/10, friend 해시 같음
- [ ] **Step 5: Commit** — `docs: 오답 탐정 정리 문서` (푸시 안 함)

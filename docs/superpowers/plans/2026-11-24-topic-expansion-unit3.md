# 주제 확장 1차(공통 틀 + 3단원) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시작 화면에서 교과서 → 단원 → 차시를 고르면 엘렌코스가 그 단원 전체로 판단하고, 오늘 차시와 이미 배운 차시로 반례를 냅니다. 3단원 두 묶음(3-1, 3-2)의 데이터를 검증해 넣습니다.

**Architecture:**
- 데이터는 소단원 묶음마다 파일 하나(`app/data/topic-3-1.js`, `topic-3-2.js`)이고, 단원 정보는 `app/data/units.js`에 있습니다.
- 앱은 단원의 묶음을 `mergeTopics`로 합칩니다. 그다음 `buildContext`·`scopeFor`에 `lessonId`를 넘겨, 반례 범위를 진도표 순서상 오늘까지 배운 차시로 거릅니다.
- 시작 화면의 선택 계산은 DOM 없는 새 파일 `app/core/catalog.js`에 두어 Node로 테스트합니다.

**Tech Stack:**
- 앱: 바닐라 HTML·CSS·JS(file://, 빌드 없음)
- 테스트: Node 24 `node --test`
- 데이터 추출: Python + PyMuPDF(`python -I -X utf8`)

**Spec:** `docs/superpowers/specs/2026-11-24-topic-expansion-design.md` (먼저 읽으세요). 앞선 설계 `docs/superpowers/specs/2026-11-24-elenchus-mvp-design.md`의 제약도 모두 그대로입니다.

## Global Constraints

- **file:// 제약:** `app/index.html`을 file://로 엽니다. 로컬 파일에 fetch나 ES 모듈 import를 쓰지 않습니다.
- **파일 패턴:** 새 JS 파일은 `(function (root) { … module.exports 또는 root.SokXxx … })(this)` 패턴을 따릅니다.
- **데이터 파일 등록:** `root.SOKRATES_TOPICS[id] = topic`(묶음)과 `root.SOKRATES_UNITS = units`(단원)로 등록합니다.
- **테스트 명령:** 작업 폴더 `app/`에서 `node --test "tests/*.test.js"`. 지금 89개 통과 상태에서 시작합니다.
- **id 규칙:** 묶음 id는 `"3-1"`, `"3-2"`입니다. 개념·오개념 id는 묶음 id를 앞에 붙여 `"3-2.c01"`, `"3-2.m01"`처럼 씁니다. 교과서 id는 `chunjae`, `icecream`, `visang`입니다.
- **차시 객체:** `{ id: "3-8", no: "8~9", title, pages: "142~146" }` 형식입니다.
  - `id`는 진도표 시작 차시입니다.
  - `no`는 화면에 보이는 차시 번호입니다.
  - 설계 5.2는 "(8~9차시)"를 제목에 붙이라고 했지만, 이 계획은 따로 `no` 칸을 둡니다. 화면과 도움말에서 번호를 제목과 따로 쓰기 위해서입니다.
- **데이터 원칙:**
  - 교과서 내용만 담고, 문장은 요약합니다. 원문과 25자 이상 연속으로 같으면 안 됩니다.
  - 모든 오개념은 설계자 검증 뒤 `reviewed: true`입니다.
  - 교과서 원문(`work/`)과 교과서 폴더는 커밋하지 않습니다.
- **화면 문구 금지:** 빨간색, X, 점수, "틀렸습니다"를 쓰지 않습니다. 질문은 40자 이내입니다. 금지어는 `["틀렸", "정답은", "오답"]`입니다.
- **작업 위치:** main이 아닌 작업 브랜치(`topic-expansion`)에서 합니다. main에 합치는 것은 Task 9의 실제 점검이 통과한 뒤 사용자님이 정합니다.

## Review Focus

1. **저장된 선택이 더는 없는 경우:** localStorage에 저장된 차시나 단원이 지금 목록에 없으면(다른 교과서의 차시 id, 데이터에서 빠진 단원) 첫 항목으로 돌아가야 하고 화면이 멈추면 안 됩니다. → Task 5 테스트
2. **같은 차시 id, 다른 교과서:** 교과서를 바꾸면 같은 차시 id(예: `3-3`)라도 그 교과서의 차시 목록으로 다시 풀어야 합니다. 천재 3-3과 비상 3-3은 내용이 다릅니다. → Task 5 테스트
3. **AI가 범위 밖 오개념 id를 돌려주는 경우:** 아직 배우지 않은 차시의 id나 옛 형식 `"m01"`이면 `state.misconception`은 `null`입니다. 이때 도움말은 오늘 차시를 가리킵니다. → Task 2·4 테스트
4. **배운 차시에 오개념이 하나도 없는 경우:** 단원 첫 차시처럼 이미 배운 차시까지 오개념이 0개인 날입니다. 맥락에 빈 머리줄을 남기지 말고 `흔한 오개념: 없음`이라고 써야 합니다. 그러면 프롬프트 규칙 1에 따라 "왜" 질문이 나옵니다. → Task 1 테스트
5. **데이터 오타로 출처 차시가 목록에 없는 경우:** 출처 차시가 그 교과서 `lessons`에 없으면 `validateTopic`이 잡아야 합니다. 조용히 범위에서 빠지면 안 됩니다. → Task 1 테스트

---

### Task 1: 차시 객체 검사, 묶음 합치기, 차시 범위 맥락 (`core/topic.js`)

**Files:**
- Modify: `app/core/topic.js`
- Modify: `app/tests/fixtures/topic-mini.js`
  - `lessons`를 객체로 바꿉니다: a → `[{ id: "3-1", no: "1", title: "차시 하나", pages: "10~11" }]`, b → `[{ id: "3-2", no: "2", title: "차시 둘", pages: "20~21" }]`
- Create: `app/tests/fixtures/unit-mini.js`
- Test: `app/tests/topic.test.js`

**Interfaces:**
- Produces:
  - `validateTopic(topic) → string[]`
    - 추가로 검사하는 것: `textbooks[].lessons`가 `{id, no, title, pages}` 문자열 칸을 가진 객체 배열인지
    - 출처 `sources[tb].lesson`이 그 교과서 `lessons[].id` 안에 있는지
    - 어긋나면 오류 문구에 항목 id와 차시 id가 모두 들어갑니다.
  - `mergeTopics(topics: Topic[], title: string) → Topic`
    - `id`는 묶음 id를 `"+"`로 이은 것이고, `title`은 인자로 받습니다.
    - `textbooks`는 첫 묶음의 교과서 순서를 따르고, `lessons`는 묶음 순서대로 이어 붙입니다.
    - `concepts`·`misconceptions`·`synonyms`는 이어 붙입니다.
  - `scopeFor(topic, textbookId, lessonId?) → { concepts, misconceptions }`
    - `lessonId`가 있으면 그 교과서 `lessons`에서 순서가 `lessonId` 이하인 차시의 항목만 돌려줍니다.
    - 없는 `lessonId`면 throw합니다.
  - `buildContext(topic, textbookId, lessonId?) → string`
    - `lessonId`가 없으면 지금 출력과 같습니다.
    - 있으면 설계 5.3대로 냅니다. 머리줄 문구는 아래 테스트에 고정합니다.
  - 모듈 내보내기: `SokTopic = { validateTopic, scopeFor, unreviewedCount, buildContext, mergeTopics }`

`unit-mini.js` 내용(교과서 `a` 하나, 묶음 둘)은 `module.exports = [t1, t2]`입니다.
- **t1:** `id "u-1"`, lessons `[{id:"3-1",no:"1",title:"첫 차시",pages:"1"}, {id:"3-2",no:"2",title:"둘째 차시",pages:"2"}]`
  - 개념: `u-1.c1`(3-1), `u-1.c2`(3-2)
  - 오개념: `u-1.m1`(3-1, wrong "첫 차시 오개념"), `u-1.m2`(3-2, wrong "둘째 차시 오개념")
- **t2:** `id "u-2"`, lessons `[{id:"3-3",no:"3~4",title:"셋째 차시",pages:"3"}, {id:"3-5",no:"5",title:"다섯째 차시",pages:"5"}]`
  - 개념: `u-2.c1`(3-3), `u-2.c2`(3-5)
  - 오개념: `u-2.m1`(3-3, wrong "셋째 차시 오개념"), `u-2.m2`(3-5, wrong "다섯째 차시 오개념")
- 두 묶음 모두 교과서 `a`의 이름은 `"교과서A"`이고, `synonyms`는 `[]`입니다.
- **교과서 `b`는 t1에만 있습니다.** 이름 `"교과서B"`, lessons `[{id:"3-1",no:"1",title:"B 첫 차시",pages:"1"}]`입니다.
  - `u-1.c1`, `u-1.m1`, `u-1.m2`에 b 출처 `{lesson:"3-1", page:"1"}`을 붙입니다.
  - Task 5에서 "같은 차시 id, 다른 교과서"를 시험할 때 씁니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다** (`tests/topic.test.js`에 추가)

```js
const unit = require("./fixtures/unit-mini.js");
const U = () => T.mergeTopics(structuredClone(unit), "작은 단원");

test("lesson objects required", () => { const t = clone(); t.textbooks[0].lessons = ["3단원 1차시"]; assert.match(T.validateTopic(t).join(), /lessons/); });
test("source lesson must be listed", () => { const t = clone(); t.concepts[0].sources.a.lesson = "3-9"; const e = T.validateTopic(t).join(); assert.match(e, /c1/); assert.match(e, /3-9/); });
test("merge keeps lesson order and all items", () => {
  const m = U();
  assert.equal(m.title, "작은 단원");
  assert.deepEqual(m.textbooks[0].lessons.map((l) => l.id), ["3-1", "3-2", "3-3", "3-5"]);
  assert.equal(m.misconceptions.length, 4);
  assert.deepEqual(T.validateTopic(m), []);
});
test("scope by lesson keeps taught lessons only", () => {
  assert.deepEqual(T.scopeFor(U(), "a", "3-3").misconceptions.map((m) => m.id), ["u-1.m1", "u-1.m2", "u-2.m1"]);
  assert.throws(() => T.scopeFor(U(), "a", "9-9"));
});
test("context: today first, earlier lessons next, later lessons out, all concepts for judging", () => {
  const c = T.buildContext(U(), "a", "3-3");
  assert.ok(c.includes("[오늘 차시: 교과서A 3단원 3~4차시 셋째 차시]"));
  assert.ok(c.includes("흔한 오개념(오늘 차시):"));
  assert.ok(c.includes("흔한 오개념(앞 차시):"));
  assert.ok(c.indexOf("셋째 차시 오개념") < c.indexOf("첫 차시 오개념"));
  assert.ok(!c.includes("다섯째 차시 오개념"));
  assert.ok(c.includes("u-2.c2"), "전체 개념에는 아직 안 배운 개념도 들어감");
});
test("context: no misconception today → all taught at one rank", () => {
  const m = U(); m.misconceptions = m.misconceptions.filter((x) => x.id !== "u-2.m1");
  const c = T.buildContext(m, "a", "3-3");
  assert.ok(!c.includes("(오늘 차시):") && c.includes("흔한 오개념:"));
  assert.ok(c.includes("첫 차시 오개념"));
});
test("context: nothing taught → 없음", () => {
  const m = U(); m.misconceptions = [];
  assert.ok(T.buildContext(m, "a", "3-1").includes("흔한 오개념: 없음"));
});
test("context without lesson keeps old shape", () => assert.ok(!T.buildContext(U(), "a").includes("[오늘 차시")));
```

- [ ] **Step 2: 테스트가 실패하는지 확인합니다**

Run: `node --test tests/topic.test.js`
Expected: 새 테스트가 FAIL합니다(`mergeTopics is not a function` 등). 기존 테스트는 픽스처를 바꿨어도 통과합니다.

- [ ] **Step 3: `core/topic.js`를 구현합니다** — Interfaces 그대로 만듭니다.
  - 차시 순서는 `tb.lessons.findIndex`로 정합니다.
  - `buildContext`의 오개념 한 줄 형식은 지금 것을 그대로 씁니다.
  - 오늘 차시 개념 줄은 `개념: id, id` 형식입니다.

- [ ] **Step 4: 전체 테스트가 통과하는지 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: 전부 PASS. 다만 `data.test.js`·`ui.test.js`가 6·25 데이터의 문자열 `lessons` 때문에 실패하면, 그 실패는 Task 3에서 고칩니다. 그 경우 이 단계에서는 `tests/topic.test.js`만 PASS인지 확인합니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add app/core/topic.js app/tests/topic.test.js app/tests/fixtures/
git commit -m "feat: 차시 객체 검사, 묶음 합치기, 오늘까지 배운 차시로 반례 범위 거르기"
```

### Task 2: 세션이 차시를 받고 프롬프트를 일반화 (`methods/elenchus.js`)

**Files:**
- Modify: `app/methods/elenchus.js`
- Test: `app/tests/elenchus.test.js`

**Interfaces:**
- Consumes: Task 1 `buildContext(topic, tb, lessonId?)`, `scopeFor(topic, tb, lessonId?)`
- Produces: `createSession({ topic, textbookId, lessonId = null, llm })`. 나머지 세션 API는 그대로입니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다**

```js
const unit = require("./fixtures/unit-mini.js");
const T = load("core/topic.js");
const merged = () => T.mergeTopics(structuredClone(unit), "작은 단원");
const makeL = (responses, lessonId) => { const fake = fakeLLM(responses); return { fake, s: E.createSession({ topic: merged(), textbookId: "a", lessonId, llm: fake }) }; };

test("prompt is not tied to 6·25", () => {
  assert.ok(!E.SYSTEM_PROMPT.includes("6·25와 관계없는"));
  assert.ok(!E.SYSTEM_PROMPT.includes("6·25와 관계있는"));
  assert.ok(E.SYSTEM_PROMPT.includes("오늘 주제와 관계없는"));
  assert.ok(E.SYSTEM_PROMPT.includes('"3-2.m01"'));
  assert.ok(!/misconception "m01"/.test(E.SYSTEM_PROMPT));
});
test("lesson goes into the message", async () => {
  const { fake, s } = makeL([{ ...CHECK, misconception: "u-2.m1" }, V("revisit")], "3-3");
  await s.submitItems(three);
  assert.ok(fake.calls[0].messages[0].content.includes("[오늘 차시: 교과서A 3단원 3~4차시 셋째 차시]"));
  assert.equal(s.getState().misconception, "u-2.m1");
});
test("misconception from a later lesson or old id form is dropped", async () => {
  for (const id of ["u-2.m2", "m01"]) {
    const { s } = makeL([{ ...CHECK, misconception: id }], "3-3");
    await s.submitItems(three);
    assert.equal(s.getState().misconception, null, id);
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인합니다**

Run: `node --test tests/elenchus.test.js`
Expected: 새 테스트 3개가 FAIL합니다.

- [ ] **Step 3: `methods/elenchus.js`를 구현합니다**
  - `createSession`이 `lessonId`를 `buildContext`와 `scopeFor`에 넘깁니다.
  - `SYSTEM_PROMPT`를 고칩니다.
    - "6·25와 관계없는" → "오늘 주제와 관계없는"(규칙 6, 우선순위 2)
    - hold 정의의 "6·25와 관계있는 내용" → "오늘 주제와 관계있는 내용"
    - 규칙 1 끝에 붙일 문장: `반례는 [흔한 오개념(오늘 차시)]에서 먼저 고르고, [흔한 오개념(앞 차시)]는 학생이 그 내용을 말했을 때만 씁니다.`
    - 우선순위 1) 끝에 붙일 문장: `(여럿이면 [오늘 차시] 개념과 관계있는 항목)`
    - 예시의 `misconception "m01"` → `misconception "3-2.m01"`

- [ ] **Step 4: 테스트가 통과하는지 확인합니다**

Run: `node --test tests/elenchus.test.js`
Expected: PASS(기존 테스트 포함)

- [ ] **Step 5: 커밋합니다**

```bash
git add app/methods/elenchus.js app/tests/elenchus.test.js
git commit -m "feat: 세션이 오늘 차시를 받고 프롬프트를 주제 일반으로 바꿈"
```

### Task 3: 6·25 데이터를 3-2 묶음으로 옮기고 단원 정보 추가

**Files:**
- Create: `app/data/topic-3-2.js`
  - `topic-625.js`를 `git mv`로 옮긴 뒤 고칩니다. 그래야 내용 이력이 남습니다.
- Create: `app/data/units.js`
- Modify: `app/tests/data.test.js`, `app/index.html`, `app/tests/live.html`, `app/review.html`
  - 이 세 HTML은 스크립트 경로만 바꿉니다.
- Test: `app/tests/data.test.js`

**Interfaces:**
- Produces:
  - `topic-3-2.js`
    - `id "3-2"`, `title "8·15 광복과 6·25 전쟁"`, `unit 3`
    - 차시 목록(교과서별)은 아래 "3단원 차시 표"의 3-2 행 가운데 이번에는 6·25 차시만 넣습니다.
      - 천재 3-11, 3-12
      - 아이스크림 3-10, 3-12
      - 비상 3-11
    - 8~10차시는 Task 7에서 더합니다.
    - 모든 `c01`~`c25`, `m01`~`m10` id 앞에 `"3-2."`를 붙입니다. 오개념의 `concepts` 참조도 함께 바꿉니다.
    - 내용, 쪽, 힌트, 같은 뜻 말은 바꾸지 않습니다.
  - `units.js`: `root.SOKRATES_UNITS = [{ id: 3, title: "식민 통치와 저항, 전쟁이 바꾼 사회와 생활", topics: ["3-1", "3-2"], wrap: { chunjae: { no: "14", title: "단원 마무리" }, icecream: { no: "14", title: "생각 그물을 완성해요" }, visang: { no: "13", title: "단원 마무리" } } }]`
    - Node에서는 `module.exports`로 같은 배열을 내보냅니다.

**3단원 차시 표** (진도표 2026-11-24 확인, `id / no / title / pages`)

| 묶음 | 천재 | 아이스크림 | 비상 |
|---|---|---|---|
| 3-1 | 3-2/2/나라를 지키기 위한 사람들의 노력 알아보기/122~125 · 3-3/3/나라를 빼앗긴 뒤 사람들의 생활 모습 살펴보기/126~127 · 3-4/4/3·1 운동에 참여한 사람들 살펴보기/128~131 · 3-5/5/3·1 운동 이후 나라를 되찾기 위한 사람들의 노력 알아보기/132~134 · 3-6/6/일제의 침략 전쟁에 맞서 사람들이 저항한 모습 살펴보기/135~137 · 3-7/7/일제의 식민 통치 시기에 달라진 사람들의 생활 모습 살펴보기/138~141 | 3-2/2/일제에 맞서 나라를 지키려고 저항한 사람들의 노력을 알아볼까요/122~124 · 3-3/3/일제 통치 시기 우리 민족의 고통과 저항을 알아볼까요/125~127 · 3-4/4/3·1 운동과 대한민국 임시 정부의 노력을 알아볼까요/128~130 · 3-5/5/3·1 운동 이후 일어난 다양한 민족 운동을 알아볼까요/131~133 · 3-6/6~7/일제 통치 시기 달라진 사회와 사람들의 생활 모습을 알아볼까요/134~139 | 3-2/2/일제의 침략에 맞서 나라를 지키고자 어떤 노력을 하였을까요/114~116 · 3-3/3~4/일제 식민 통치 시기에 우리나라 사람들은 어떤 일을 겪었을까요/117~121 · 3-5/5/3·1 운동과 대한민국 임시 정부의 활동을 알아볼까요/122~125 · 3-6/6~7/나라를 되찾으려는 노력에는 어떤 것들이 있었을까요/126~131 |
| 3-2 | 3-8/8~9/8·15 광복 이후 달라진 사람들의 생활 모습 살펴보기/142~146 · 3-10/10/대한민국 정부 수립 과정 알아보기/147~149 · 3-11/11/6·25 전쟁으로 사람들이 겪은 어려움 살펴보기/150~152 · 3-12/12/6·25 전쟁이 사람들에게 끼친 피해와 영향 알아보기/153~155 | 3-8/8~9/8·15 광복 이후 달라진 사회와 사람들의 생활 모습을 살펴볼까요/140~145 · 3-10/10~11/6·25 전쟁과 사람들의 생활 모습을 알아볼까요/146~150 · 3-12/12/6·25 전쟁 이후 달라진 사회와 사람들의 생활 모습을 알아볼까요/151~153 | 3-8/8~9/8·15 광복 이후 우리나라의 모습을 살펴볼까요/132~137 · 3-10/10/대한민국 정부의 수립 과정을 알아볼까요/138~140 · 3-11/11~12/6·25 전쟁의 과정과 영향을 알아볼까요/141~147 |

- [ ] **Step 1: `data.test.js`를 모든 묶음 파일에 대한 검사로 바꿉니다** (실패하는 상태로)

```js
const DATA = path.join(__dirname, "..", "data");
const files = fs.readdirSync(DATA).filter((f) => /^topic-\d+-\d+\.js$/.test(f));
const topics = files.map((f) => require(path.join(DATA, f)));
const units = require(path.join(DATA, "units.js"));
const byId = (id) => topics.find((t) => t.id === id);

test("topic files exist", () => assert.ok(files.includes("topic-3-2.js") && !fs.existsSync(path.join(DATA, "topic-625.js"))));
for (const t of topics) {
  test(`${t.id}: valid`, () => assert.deepEqual(T.validateTopic(t), []));
  test(`${t.id}: ids carry topic prefix`, () => assert.ok([...t.concepts, ...t.misconceptions].every((x) => x.id.startsWith(`${t.id}.`))));
  test(`${t.id}: all reviewed`, () => assert.equal(T.unreviewedCount(t), 0));
  test(`${t.id}: every lesson has a concept`, () => {
    for (const tb of t.textbooks) for (const l of tb.lessons)
      assert.ok(t.concepts.some((c) => c.sources[tb.id] && c.sources[tb.id].lesson === l.id), `${tb.id} ${l.id}`);
  });
}
test("units list topics in order", () => assert.deepEqual(units.find((u) => u.id === 3).topics, ["3-1", "3-2"]));
test("6·25 kept as verified", () => {
  const D = byId("3-2"); const m = (id) => D.misconceptions.find((x) => x.id === `3-2.${id}`); const c = (id) => D.concepts.find((x) => x.id === `3-2.${id}`);
  assert.ok(/1953/.test(m("m01").wrong) && /정전/.test(m("m01").truth));
  assert.equal(c("c12").sources.chunjae.page, "151·152");
  assert.equal(m("m03").sources.visang.page, "141");
  assert.ok(!D.synonyms.some((g) => g.includes("연합군")));
});
```

같은 뜻 말 검사(`북한군` 묶음에 `북한` 없음)도 `byId("3-2")`로 옮겨 남깁니다. 원문 대조 검사(`no long verbatim`)는 Task 6이 고칩니다. 그때까지는 `work/625`를 보던 그대로 두되, 대상만 모든 `topics`로 넓힙니다.

- [ ] **Step 2: 테스트가 실패하는지 확인합니다**

Run: `node --test tests/data.test.js`
Expected: FAIL(`topic-3-2.js` 없음)

- [ ] **Step 3: 데이터를 옮깁니다**
  - `git mv app/data/topic-625.js app/data/topic-3-2.js` 후 Interfaces대로 고칩니다.
  - `units.js`를 만듭니다.
  - 세 HTML의 `data/topic-625.js` 스크립트를 `data/units.js`와 `data/topic-3-2.js` 두 줄로 바꿉니다.
  - `ui.test.js`의 `topic-625.js` 경로와 `"m01"` → `"3-2.m01"`도 맞춥니다. 기대 문자열은 Task 4가 바꿉니다.
  - `live-cases.test.js`의 경로도 맞춥니다.
  - `review.html`과 `live.html` 안의 `SOKRATES_TOPICS["625"]`는 `["3-2"]`로 임시로 바꿉니다. Task 8이 제대로 고칩니다.

- [ ] **Step 4: 테스트를 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: `data.test.js`는 전부 PASS입니다. `units.js`는 3-1이 아직 없어도 `["3-1", "3-2"]`를 적어 두므로 순서 테스트도 통과합니다. 남는 실패는 `ui.test.js`의 `where` 기대 문자열뿐이고, Task 4에서 고칩니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add -A app/data app/tests app/index.html app/review.html
git commit -m "refactor: 6·25 데이터를 3-2 묶음으로 옮기고 단원 정보 추가"
```

### Task 4: 선생님 도움말이 차시 객체와 오늘 차시를 읽음 (`core/ui.js`)

**Files:**
- Modify: `app/core/ui.js`
- Test: `app/tests/ui.test.js`

**Interfaces:**
- Consumes: Task 3 데이터(`lessons` 객체)
- Produces: `teacherHelp(topic, textbookId, state, lessonId = null) → { item, truth, where, hints } | null`
  - 오개념이 있을 때 `where`는 `"{교과서} {단원}단원 {no}차시 {title} {page}쪽"`입니다.
  - 오개념이 없으면:
    - `lessonId`가 있을 때: `"{교과서} {단원}단원 {no}차시 {title}"`
    - `lessonId`가 없을 때(단원 마무리): `"{교과서} " + lessons를 "{단원}단원 {no}차시"로 ", " 이은 것`

- [ ] **Step 1: `ui.test.js`의 도움말 테스트를 고치고 새로 더합니다**

```js
const D = require("./load").load("data/topic-3-2.js");
// doneState의 misconception 기본값은 "3-2.m01"
assert.equal(h.where, "천재교과서 3단원 11차시 6·25 전쟁으로 사람들이 겪은 어려움 살펴보기 151쪽");
assert.equal(U.teacherHelp(D, "visang", doneState({ verdict: "revisit" })).where, "비상교육 3단원 11~12차시 6·25 전쟁의 과정과 영향을 알아볼까요 142쪽");
test("teacher help: no misconception points to today's lesson", () => {
  const h = U.teacherHelp(D, "icecream", doneState({ misconception: null }), "3-12");
  assert.equal(h.where, "아이스크림미디어 3단원 12차시 6·25 전쟁 이후 달라진 사회와 사람들의 생활 모습을 알아볼까요");
});
```

`m01`의 천재 출처가 `3-11`/`151`인지 데이터에서 확인한 뒤 기대값을 확정합니다. 다르면 데이터가 맞고, 테스트 기대값을 데이터에 맞춥니다.

- [ ] **Step 2: 테스트가 실패하는지 확인합니다**

Run: `node --test tests/ui.test.js`
Expected: FAIL(`where` 문자열 다름)

- [ ] **Step 3: `teacherHelp`를 구현합니다.** 차시는 `tb.lessons.find((l) => l.id === src.lesson)`로 찾습니다.

- [ ] **Step 4: 전체 테스트를 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: 전부 PASS

- [ ] **Step 5: 커밋합니다**

```bash
git add app/core/ui.js app/tests/ui.test.js
git commit -m "feat: 선생님 도움말이 차시 제목과 오늘 차시를 보여 줌"
```

### Task 5: 시작 화면 선택 계산 (`core/catalog.js`) + 시작 화면

**Files:**
- Create: `app/core/catalog.js`
- Modify: `app/core/app.js`(시작 화면, 위 막대, 결과 메타, `newStudent`), `app/index.html`
  - `index.html`에는 `core/topic.js` 다음에 `core/catalog.js` 스크립트를 넣습니다.
- Test: `app/tests/catalog.test.js`

**Interfaces:**
- Consumes: Task 1 `mergeTopics`, Task 3 `SOKRATES_UNITS` 형식
- Produces (`SokCatalog`):
  - `availableUnits(units, topics) → Unit[]`: 묶음이 하나라도 불러와진 단원만 냅니다. 각 단원의 `topics`는 불러온 것만 남깁니다.
  - `lessonChoices(unit, topics, textbookId) → Choice[]`
    - `Choice = { key, label, lessonId, topicId }`
    - 내용 차시는 묶음 순서·차시 순서대로 나열합니다. 각 차시는 `key = lessonId = l.id`, `label = "{no}차시 {title}"`, `topicId`는 그 묶음입니다.
    - 마지막 항목은 `{ key: "wrap", label: "단원 마무리 ({no}차시)", lessonId: null, topicId: null }`입니다.
  - `resolve(units, topics, { textbookId, unitId, key }) → { textbookId, unit, choice, topic, contextTitle, lessonLabel }`
    - 없는 교과서·단원·key는 각 목록의 첫 항목으로 대신합니다.
    - `topic`은 `mergeTopics(단원의 묶음들, unit.title)`입니다.
    - `contextTitle`은 내용 차시면 그 묶음 `title`, 마무리면 `unit.title`입니다.
    - `lessonLabel`은 `"{no}차시"` 또는 `"단원 마무리"`입니다.
- 화면 쪽(app.js)
  - 시작 화면의 [주제] 선택을 없애고, [우리 반 교과서] → [단원] → [오늘 차시] 세 선택으로 바꿉니다.
  - 저장 키는 `sok.textbook`(지금 것), `sok.unit`, `sok.lesson`입니다.
  - `newStudent`는 `createSession({ topic: r.topic, textbookId, lessonId: r.choice.lessonId, llm })`을 부릅니다.
  - 위 막대·결과·복사 글의 주제 표시는 `"{contextTitle} · {교과서 이름} {lessonLabel}"`입니다.
  - 도움말은 `teacherHelp(r.topic, textbookId, st, r.choice.lessonId)`로 부릅니다.
  - "검토하지 않은 오개념" 안내는 불러온 모든 묶음의 합으로 셉니다.

- [ ] **Step 1: 실패하는 테스트를 씁니다** (`tests/catalog.test.js`)
  - 픽스처: `unit-mini.js`의 두 묶음, 그리고 단원 `[{ id: 3, title: "작은 단원", topics: ["u-1", "u-2", "u-9"], wrap: { a: { no: "6", title: "단원 마무리" } } }]`

```js
test("only loaded topics", () => assert.deepEqual(C.availableUnits(units, topics)[0].topics, ["u-1", "u-2"]));
test("choices in order with wrap last", () => {
  const ch = C.lessonChoices(C.availableUnits(units, topics)[0], topics, "a");
  assert.deepEqual(ch.map((c) => c.key), ["3-1", "3-2", "3-3", "3-5", "wrap"]);
  assert.equal(ch[2].label, "3~4차시 셋째 차시");
  assert.equal(ch[2].topicId, "u-2");
  assert.deepEqual(ch[4], { key: "wrap", label: "단원 마무리 (6차시)", lessonId: null, topicId: null });
});
test("resolve lesson", () => {
  const r = C.resolve(units, topics, { textbookId: "a", unitId: 3, key: "3-3" });
  assert.equal(r.contextTitle, t2Title); assert.equal(r.lessonLabel, "3~4차시"); assert.equal(r.choice.lessonId, "3-3");
  assert.equal(r.topic.misconceptions.length, 4);
});
test("resolve wrap", () => { const r = C.resolve(units, topics, { textbookId: "a", unitId: 3, key: "wrap" }); assert.equal(r.contextTitle, "작은 단원"); assert.equal(r.lessonLabel, "단원 마무리"); assert.equal(r.choice.lessonId, null); });
test("stale saved values fall back to first", () => {   // Review Focus 1
  const r = C.resolve(units, topics, { textbookId: "zzz", unitId: 9, key: "7-7" });
  assert.equal(r.textbookId, "a"); assert.equal(r.unit.id, 3); assert.equal(r.choice.key, "3-1");
});
```

  - `t2Title`은 픽스처 `u-2`의 `title`입니다.
  - 이 테스트의 단원 `wrap`에는 `b: { no: "2", title: "단원 마무리" }`도 넣습니다.
  - Review Focus 2(같은 차시 id, 다른 교과서)는 다음처럼 확인합니다.
    - `resolve({ textbookId: "b", unitId: 3, key: "3-3" })`의 `choice.key`가 `"3-1"`인지 봅니다. b에는 3-3 차시가 없으므로 b 목록의 첫 차시로 돌아가야 합니다.
    - `lessonChoices`를 b로 불렀을 때 a의 차시가 섞이지 않는지 봅니다.

- [ ] **Step 2: 테스트가 실패하는지 확인합니다**

Run: `node --test tests/catalog.test.js`
Expected: FAIL(`catalog.js` 없음)

- [ ] **Step 3: `core/catalog.js`를 구현하고, `app.js` 시작 화면과 세션 생성을 Interfaces대로 바꿉니다.**
  - 단원 선택 글자는 `"{id}. {title}"`입니다.
  - 교과서나 단원을 바꾸면 차시 목록을 다시 그리고, 저장된 차시가 없으면 첫 차시를 씁니다.
  - 배운 3가지 입력 칸의 예시 문구 `"예) 북한이 38도선을 넘어 쳐들어왔어요"`는 `"예) 오늘 배운 것 한 가지"`로 바꿉니다. 이제 주제가 여럿이기 때문입니다.

- [ ] **Step 4: 테스트와 화면을 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: 전부 PASS

그다음 file://로 `app/index.html`을 엽니다. 스크래치패드의 Playwright 스크립트처럼 `api.anthropic.com`을 가짜 응답으로 막고 확인합니다.
- 교과서 → 단원 → 차시를 고른 뒤 첫 요청 본문에 `[오늘 차시:`가 들어가는지
- 새로고침 뒤 고른 값이 남는지
- 비상 → 천재로 바꿨을 때 차시 목록이 바뀌는지
- 콘솔 오류가 없는지

Expected: 위 네 가지가 모두 그렇습니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add app/core/catalog.js app/core/app.js app/index.html app/tests/catalog.test.js app/tests/fixtures/unit-mini.js
git commit -m "feat: 시작 화면에서 교과서·단원·오늘 차시를 고름"
```

### Task 6: 차시 텍스트 추출 도구 (`tools/extract_lessons.py`)

**Files:**
- Create: `tools/extract_lessons.py`
  - `extract_625.py`의 `printed_page`와 쪽 채우기를 가져와 일반화합니다. 그다음 `extract_625.py`는 지웁니다.
- Modify: `app/tests/data.test.js`의 원문 대조 검사
  - `work/625` 대신 `work/{단원}/**/*.txt` 전부와 대조합니다.
  - 그 폴더가 없으면 skip합니다.

**Interfaces:**
- Produces: `python -I -X utf8 tools/extract_lessons.py --unit 3`
  - 세 교과서의 `차시/3단원_*차시_*.pdf`를 모두 읽습니다.
  - `work/3/{교과서id}/3-{차시}.txt`에 장마다 `=== p.{인쇄 쪽} ===` 머리줄과 본문을 씁니다.
  - 한 장의 한글 글자가 30자 미만이거나 깨진 글자(U+FFFD, 사적 영역 문자)가 10% 넘으면 `work/3/png/{교과서id}_3-{차시}_p{쪽}.png`도 만듭니다.
  - 끝에 교과서별 파일 수와 그림으로 만든 쪽 수를 찍습니다.

- [ ] **Step 1: 도구를 쓰고 실행합니다**

Run: `python -I -X utf8 tools/extract_lessons.py --unit 3`
Expected:
- 천재 13개, 아이스크림 11개, 비상 9개 파일을 씁니다. 3단원 차시 PDF 수와 같습니다.
- 각 파일 첫 머리줄의 쪽 번호가 위 "3단원 차시 표"의 시작 쪽과 맞습니다. 파일 3개를 뽑아 눈으로 확인합니다.

- [ ] **Step 2: 원문 대조 검사를 바꾸고 확인합니다**

Run: `node --test tests/data.test.js`
Expected: PASS(`no long verbatim`가 skip이 아니라 실제로 돎)

- [ ] **Step 3: 커밋합니다**(work/는 커밋하지 않습니다)

```bash
git add tools/ app/tests/data.test.js
git commit -m "tools: 단원 단위 차시 텍스트 추출 도구"
```

### Task 7: 3-2 묶음에 광복·정부 수립 차시 더하기

**Files:**
- Modify: `app/data/topic-3-2.js`
- Test: `app/tests/data.test.js`(Task 3의 검사로 충분합니다. 6·25 보존 검사가 그대로 통과해야 합니다)

**Interfaces:**
- Consumes: Task 6의 `work/3/*` 텍스트
- Produces:
  - 3-2 `lessons`에 8~10차시를 더합니다(천재 3-8, 3-10 / 아이스크림 3-8 / 비상 3-8, 3-10). 순서는 진도표 순서입니다.
  - 새 개념 `3-2.c26`부터, 새 오개념 `3-2.m11`부터 이어서 씁니다.

- [ ] **Step 1: 데이터 초안을 씁니다**
  - 개념은 차시당 4~8개입니다.
  - 새 오개념은 교과서마다 2개 이상이고, 차시당 0~2개입니다.
    - 5학년이 실제로 흔히 하는 착각만 씁니다(예: 광복 뒤 곧바로 정부가 세워졌다).
    - `counterHints`는 교과서 문장에서 바로 찾을 수 있는 것만 씁니다.
  - 같은 뜻 말을 더합니다(예: 광복 = 해방).
  - 모든 출처에 차시와 인쇄 쪽을 붙입니다.

- [ ] **Step 2: 새 맥락 검토자로 검증합니다**
  - 검토자에게 넘길 것: 새 항목 목록, `work/3`의 해당 차시 텍스트 경로, 검증 항목(내용이 교과서에 있는가, 출처 차시·쪽이 맞는가, 실마리가 교과서 문장에 근거하는가, 흔한 오개념인가, 같은 뜻 말이 과하지 않은가)
  - 6·25 때와 같은 방식이고, 일반 에이전트를 씁니다.
  - 지적을 모두 고치거나, 고치지 않는 까닭을 장부에 `Ruling:`으로 남긴 뒤 `reviewed: true`로 둡니다.

Expected: 검토자가 "고칠 것 없음"이라고 하거나, 남은 지적이 모두 고쳐지거나 Ruling으로 처리됩니다.

- [ ] **Step 3: 테스트를 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: 전부 PASS(`every lesson has a concept`, `no long verbatim`, `6·25 kept as verified` 포함)

- [ ] **Step 4: 커밋합니다**
  - 커밋 메시지 본문에 검토자가 고친 점을 요약합니다.

```bash
git add app/data/topic-3-2.js
git commit -m "data: 3-2 묶음에 8·15 광복과 정부 수립 차시 추가(교과서 대조 검증)"
```

### Task 8: 3-1 묶음 데이터, 검토·점검 페이지 일반화, 새 실제 점검 사례

**Files:**
- Create: `app/data/topic-3-1.js`
- Modify: `app/index.html`, `app/review.html`, `app/tests/live.html`
  - 세 HTML에 `data/topic-3-1.js`를 `topic-3-2.js` 앞에 넣습니다.
- Modify: `app/tests/live-cases.js`, `app/tests/live-cases.test.js`

**Interfaces:**
- Consumes: Task 1 `mergeTopics`, Task 5 `SokCatalog.resolve`
- Produces:
  - `topic-3-1.js`: `id "3-1"`, `title "일제의 식민 통치와 저항"`, 차시 표의 3-1 행, id `3-1.c01…`, `3-1.m01…`
  - `review.html`: 맨 위에 묶음 선택 상자를 둡니다. 저장 키는 `sok.review.{묶음 id}`입니다.
  - live 사례 형식: `{ name, textbookId, unitId: 3, key, items, answers, expect, expectMode?, expectChecks?, expectOk? }`
    - `key`는 Task 5의 Choice key입니다.
    - `expectOk`는 `ok`여야 하는 항목 번호 배열입니다.
  - `live.html`은 사례마다 `SokCatalog.resolve`로 `topic`·`lessonId`를 얻어 세션을 만듭니다. `expectOk`가 있으면 일치 판단에 넣습니다.
  - 기존 6·25 사례 10개에는 `unitId: 3`과 `key`를 붙입니다. key는 천재 `"3-12"`, 아이스크림 `"3-12"`, 비상 `"3-11"`입니다. 6·25 오개념이 모두 "이미 배운" 범위에 들도록 그 교과서의 마지막 6·25 차시를 씁니다.
  - 새 사례 12개(교과서마다 4개)는 아래와 같습니다. 문장은 데이터 확정 뒤 그 교과서 내용으로 씁니다.
    - 3-1 차시 "하나 틀림" (`expect "revisit"`, `expectMode "counter"`)
    - 3-1 차시 "모두 맞음" (`expect "strong"`, `expectMode "reason"`)
    - 3-2 첫 차시(`3-8`)에서 3-1 내용을 섞은 "모두 맞음" (`expectOk`에 섞은 항목 번호)
    - 단원 마무리 `"wrap"` "하나 틀림" (`expect "revisit"`)

- [ ] **Step 1: `live-cases.test.js`를 새 형식으로 고칩니다**
  - 22건인지 확인합니다(6·25 10 + 새 12).
  - 모든 사례의 `resolve` 결과 `choice.key`가 사례의 `key`와 같은지 확인합니다. 그래야 없는 차시로 조용히 대체되지 않습니다.
  - 섞음 사례 3건에 `expectOk`가 있는지 확인합니다.
  - 기존 입력·이름 검사는 그대로 둡니다.

Run: `node --test tests/live-cases.test.js`
Expected: FAIL(사례 10건, 3-1 없음)

- [ ] **Step 2: Task 7의 Step 1~2 공정으로 `topic-3-1.js`를 쓰고 검증합니다**
  - 검토자에게 넘길 것: 3-1 차시 텍스트와 Task 7 Step 2의 검증 항목
  - 오개념은 교과서마다 2개 이상입니다(예: 3·1 운동은 서울에서만 일어났다, 임시 정부는 우리나라 안에 있었다). 각각 교과서 근거가 있어야 합니다.

Expected: 검토자 지적이 모두 처리됩니다.

- [ ] **Step 3: 새 사례 12개, `live.html`, `review.html`을 구현합니다.**

- [ ] **Step 4: 전체 테스트와 화면을 확인합니다**

Run: `node --test "tests/*.test.js"`
Expected: 전부 PASS

그다음 file://로 확인합니다.
- `review.html`에서 묶음을 바꾸면 목록이 바뀌는지
- `index.html` 단원 목록에 3단원이 있고, 차시 목록이 천재 기준 2~12차시와 "단원 마무리 (14차시)"인지

Expected: 둘 다 그렇습니다.

- [ ] **Step 5: 커밋합니다**

```bash
git add app/data/topic-3-1.js app/index.html app/review.html app/tests/
git commit -m "data: 3-1 일제의 식민 통치와 저항 묶음, 검토·점검 페이지를 묶음 단위로"
```

### Task 9: 실제 AI 점검(사용자님이 실행)과 결과 기록

**Files:**
- Create: `docs/live-check-unit3-YYYY-MM-DD.md`

- [ ] **Step 1: 사용자님께 점검을 부탁드립니다**
  - 미리보기 서버(`.claude/launch.json`의 `sokrates-app`)의 `tests/live.html` 주소를 드립니다.
  - 사용자님이 키가 저장된 브라우저에서 [실행]을 누르고 Markdown 결과를 붙여 주시면 됩니다.
  - 키는 대화에 붙이지 않습니다.

- [ ] **Step 2: 결과를 기준과 비교해 기록합니다**
  - 기준:
    - 6·25 사례 10개 중 9개 이상 "같음"
    - 새 사례 12개 중 11개 이상 "같음"
    - 섞음 사례 3개 모두 섞은 항목이 `ok`
  - 기준에 못 미치면 원인을 프롬프트나 데이터에서 찾습니다. 고친 뒤 해당 테스트를 더하거나 고치고 다시 점검을 부탁드립니다.
  - 통과하기 전에는 main에 합치지 않습니다.

Expected: 기준을 통과하고, 점검 기록 문서에 실행 회차별 결과와 고친 점이 남습니다.

- [ ] **Step 3: 커밋합니다**

```bash
git add docs/live-check-unit3-*.md
git commit -m "test: 3단원 실제 AI 점검 결과"
```

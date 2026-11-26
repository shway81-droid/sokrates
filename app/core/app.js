// 공통 틀: 설정 → 시작(방법·교과서·단원·차시) → 방법의 화면(입력 → 문답 → 결과)
// 방법은 methods/*-views.js 가 root.SokMethods 에 등록합니다: { id, name, startHint, createSession, views: { input, talk, result } }
// 세션 약속: getState().phase 는 input | waiting | asking | error | done, 그리고 cancel(), retry()
(function (root) {
  const { el, formatElapsed } = root.SokUI;
  const L = root.SokLLM;
  const T = root.SokTopic;
  const Cat = root.SokCatalog;
  const KEYS = { method: "sok.method", textbook: "sok.textbook", unit: "sok.unit", lesson: "sok.lesson" };

  // 방법 목록: 스크립트 차례대로(엘렌코스 → 모르는 친구 …). 새 방법은 methods/ 에 파일을 더하고 index.html 에 줄을 더합니다.
  const methods = root.SokMethods = root.SokMethods || [];
  function registerMethod(m) { methods.push(m); }

  const $ = (id) => document.getElementById(id);
  const screen = $("screen");
  const topics = root.SOKRATES_TOPICS || {};
  const units = root.SOKRATES_UNITS || [];

  const storeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };

  const savedMethod = storeGet(KEYS.method);
  const app = {
    view: "start",
    // 마지막으로 고른 정리 방법. 지금 목록에 없으면 첫 방법을 씁니다.
    methodId: methods.some((m) => m.id === savedMethod) ? savedMethod : methods[0].id,
    // 마지막으로 고른 교과서·단원·차시. 지금 목록에 없으면 Cat.resolve 가 첫 항목으로 대신합니다.
    textbookId: storeGet(KEYS.textbook),
    unitId: storeGet(KEYS.unit),
    lessonKey: storeGet(KEYS.lesson),
    scope: null, // 지금 학생의 세션을 만들 때 쓴 선택(Cat.resolve 결과)
    session: null,
    startedAt: null,
    stoppedAt: null,
    timerId: null,
  };

  const current = () => Cat.resolve(units, topics, { textbookId: app.textbookId, unitId: app.unitId, key: app.lessonKey });
  const scopeLabel = (sc) => `${sc.contextTitle} · ${sc.textbookName} ${sc.lessonLabel}`;
  const method = () => methods.find((m) => m.id === app.methodId);

  // ---------- 타이머 ----------
  function startTimer() {
    stopTimer();
    app.startedAt = Date.now();
    app.stoppedAt = null;
    app.timerId = setInterval(paintTimer, 1000);
    paintTimer();
  }
  function stopTimer() {
    if (app.timerId) clearInterval(app.timerId);
    app.timerId = null;
    if (app.startedAt && !app.stoppedAt) app.stoppedAt = Date.now();
    paintTimer();
  }
  const elapsedText = () => formatElapsed((app.stoppedAt || Date.now()) - app.startedAt);
  function paintTimer() {
    const t = $("bar-timer");
    if (!app.startedAt) { t.hidden = true; return; }
    t.hidden = false;
    t.textContent = elapsedText();
  }

  // ---------- 위 막대 ----------
  function paintBar() {
    $("bar-method").textContent = app.view === "settings" || app.view === "start" ? "" : `· ${method().name}`;
    const ctx = $("bar-context");
    const inLesson = app.view === "input" || app.view === "talk";
    ctx.hidden = !inLesson;
    if (inLesson) ctx.textContent = scopeLabel(app.scope);
    $("bar-home").hidden = app.view === "start" || app.view === "settings";
    paintTimer();
  }

  // settings·start 는 공통 화면, input·talk·result 는 지금 방법의 화면입니다.
  function show(view) {
    app.view = view;
    screen.replaceChildren(COMMON[view] ? COMMON[view]() : method().views[view](kit()));
    paintBar();
    const first = screen.querySelector("[data-autofocus]");
    if (first) first.focus();
  }

  // 세션의 phase 로 보일 화면을 고릅니다.
  const viewFor = (phase) => (phase === "input" ? "input" : phase === "done" ? "result" : "talk");

  // 세션 동작(promise)을 부른 직후: '생각하는 중' 화면 → 끝나면 결과나 문답 화면
  async function act(p) {
    const s = app.session;
    show("talk");
    await p;
    if (s !== app.session) return; // 그사이 [다음 학생]을 눌렀으면 무시
    if (s.getState().phase === "done") { stopTimer(); show("result"); } else show("talk");
  }

  // 방법의 화면에 건네는 도구
  function kit() {
    return {
      session: app.session, scope: app.scope, show, act, toast, onEnter, copy, elapsedText, today,
      nextStudent: () => newStudent(), openSettings: () => show("settings"),
    };
  }

  // Enter로 보내기 (Shift+Enter는 줄바꿈, 한글 조합 중 Enter는 무시)
  function onEnter(handler) {
    return (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      handler(e);
    };
  }

  // Ctrl+P로 인쇄해도 문답 기록이 펼쳐진 채 나오게 합니다.
  if (typeof window !== "undefined") window.addEventListener("beforeprint", () => {
    const d = document.querySelector("details.record"); if (d) d.open = true;
  });

  function toast(msg) {
    const t = el("div", { class: "toast", role: "status", text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------- 공통 화면 ----------
  const COMMON = {
    settings() {
      const s = L.loadSettings();
      // 아티팩트판(KEYLESS)은 화면을 연 사람의 Claude 계정으로 부르므로 키 칸이 없습니다.
      const keyless = !!L.KEYLESS;
      const key = el("input", { type: "password", id: "api-key", autocomplete: "off", "data-autofocus": true,
        placeholder: s.apiKey ? "저장된 키가 있어요 (바꿀 때만 입력)" : "sk-ant-로 시작하는 키" });
      const model = el("select", { id: "model" }, L.MODELS.map((m) =>
        el("option", { value: m, selected: m === s.model, text: MODEL_LABEL[m] || m })));
      const effort = el("select", { id: "effort" }, L.EFFORTS.map((v) =>
        el("option", { value: v, selected: v === s.effort, text: EFFORT_LABEL[v] })));

      function save() {
        const typed = key.value.trim();
        if (!keyless && !typed && !s.apiKey) { key.focus(); toast("API 키를 넣어 주세요"); return; }
        L.saveSettings({ apiKey: typed || null, model: model.value, effort: effort.value });
        toast("저장했어요");
        backFromSettings();
      }
      return el("section", { class: "stack" }, [
        el("h1", { text: "설정" }),
        el("div", { class: "card stack" }, [
          keyless
            ? el("div", { class: "hint", text: "이 화면은 지금 로그인한 Claude 계정으로 AI를 불러요. 처음 부를 때 허용 창이 한 번 떠요." })
            : el("label", { class: "field" }, [el("span", { text: "Claude API 키" }), key,
              el("div", { class: "hint", text: "키는 이 PC의 브라우저에만 저장돼요. 여러 사람이 쓰는 PC라면 수업 뒤에 [키 지우기]를 눌러 주세요." })]),
          el("label", { class: "field" }, [el("span", { text: "AI 모델" }), model]),
          el("label", { class: "field" }, [el("span", { text: "생각하는 정도" }), effort,
            el("div", { class: "hint", text: "낮을수록 답이 빨라요. 교실에서는 '낮음'을 권해요." })]),
          el("div", { class: "row end" }, [
            !keyless && s.apiKey && el("button", { class: "btn quiet", type: "button", text: "키 지우기",
              onclick: () => { L.clearKey(); toast("키를 지웠어요"); show("settings"); } }),
            (keyless || s.apiKey) && el("button", { class: "btn secondary", type: "button", text: "닫기", onclick: backFromSettings }),
            el("button", { class: "btn", type: "button", text: "저장", onclick: save }),
          ]),
        ]),
      ]);
    },

    start() {
      const sc = current();
      Object.assign(app, { textbookId: sc.textbookId, unitId: String(sc.unit.id), lessonKey: sc.choice.key });
      const pick = (field, key) => (e) => { app[field] = e.target.value; storeSet(key, e.target.value); show("start"); };

      // 방법을 바꾸면 안내 글이 방법마다 달라 화면을 다시 그립니다.
      const methodSel = el("select", { id: "method", onchange: pick("methodId", KEYS.method) },
        methods.map((m) => el("option", { value: m.id, selected: m.id === app.methodId, text: m.name })));
      const tbSel = el("select", { id: "textbook", onchange: pick("textbookId", KEYS.textbook) },
        Cat.textbooksOf(sc.unit, topics).map((b) => el("option", { value: b.id, selected: b.id === sc.textbookId, text: b.name })));
      const unitSel = el("select", { id: "unit", onchange: pick("unitId", KEYS.unit) },
        Cat.availableUnits(units, topics).map((u) => el("option", { value: String(u.id), selected: u.id === sc.unit.id, text: `${u.id}. ${u.title}` })));
      const lessonSel = el("select", { id: "lesson", "data-autofocus": true, onchange: pick("lessonKey", KEYS.lesson) },
        sc.choices.map((c) => el("option", { value: c.key, selected: c.key === sc.choice.key, text: c.label })));
      const n = Object.values(topics).reduce((sum, t) => sum + T.unreviewedCount(t), 0);

      return el("section", { class: "stack" }, [
        el("h1", { text: "오늘 배운 것을 함께 정리해 봐요" }),
        el("div", { class: "card stack" }, [
          el("label", { class: "field" }, [el("span", { text: "정리 방법" }), methodSel]),
          el("label", { class: "field" }, [el("span", { text: "우리 반 교과서" }), tbSel]),
          el("label", { class: "field" }, [el("span", { text: "단원" }), unitSel]),
          el("label", { class: "field" }, [el("span", { text: "오늘 차시" }), lessonSel,
            el("div", { class: "hint", text: method().startHint })]),
          n > 0 && el("div", { class: "note", text: `검토하지 않은 오개념이 ${n}개 있어요. review.html 에서 확인해 주세요.` }),
          el("div", { class: "row end" }, [el("button", { class: "btn", type: "button", text: "시작하기", onclick: () => newStudent() })]),
        ]),
      ]);
    },
  };

  const MODEL_LABEL = { "claude-haiku-5-5": "Claude Haiku 5.5 (기본 · 빠름 · 가장 저렴)", "claude-sonnet-5-5": "Claude Sonnet 5.5 (더 꼼꼼함)", "claude-opus-5-5": "Claude Opus 5.5 (가장 깊게)" };
  const EFFORT_LABEL = { low: "낮음 (빠름)", medium: "보통", high: "높음 (느림)" };

  // AI 호출은 부를 때마다 최신 설정을 읽습니다. 수업 중에 키·모델을 바꿔도 학생이 쓴 내용이 남습니다.
  let cachedLLM = null;
  let cachedFor = "";
  const liveLLM = {
    call(req) {
      const s = L.loadSettings();
      const sig = JSON.stringify(s);
      if (sig !== cachedFor) { cachedLLM = L.createClaudeLLM(s); cachedFor = sig; }
      return cachedLLM.call(req);
    },
  };

  // 설정을 닫으면 하던 화면으로 돌아갑니다.
  function backFromSettings() {
    if (!app.session) return show("start");
    show(viewFor(app.session.getState().phase));
  }

  function newStudent() {
    if (app.session) app.session.cancel();
    const settings = L.loadSettings();
    if (!L.KEYLESS && !settings.apiKey) { show("settings"); return; }
    const sc = current();
    app.scope = sc;
    app.session = method().createSession({ topic: sc.topic, textbookId: sc.textbookId, lessonId: sc.choice.lessonId, llm: liveLLM,
      sourceText: Cat.sourceText(root.SOKRATES_TEXTS, sc.textbookId, sc.choice.lessonId) });
    startTimer();
    show("input");
  }

  function goHome() {
    if (app.session) app.session.cancel();
    app.session = null;
    stopTimer();
    app.startedAt = null;
    show("start");
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el("textarea", { style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    toast("결과를 복사했어요");
  }

  $("bar-settings").addEventListener("click", () => show("settings"));
  $("bar-home").addEventListener("click", goHome);

  root.SokApp = { registerMethod, methods, show };
  show(L.KEYLESS || L.loadSettings().apiKey ? "start" : "settings");
})(window);

// 교사 화면 제어: 설정 → 시작(방법·주제·교과서) → 배운 3가지 → 확인과 반례 문답 → 판정과 정리
(function (root) {
  const { el, VERDICT_TEXT, CHECK_TEXT, SUMMARY_LABELS, formatElapsed, rethink, resultText, teacherHelp } = root.SokUI;
  const L = root.SokLLM;
  const T = root.SokTopic;
  const Cat = root.SokCatalog;
  const KEYS = { textbook: "sok.textbook", unit: "sok.unit", lesson: "sok.lesson" };

  // 방법 등록: 다음 방법(모르는 친구, 오답 탐정 …)은 여기에 하나씩 더합니다.
  const methods = [];
  function registerMethod(m) { methods.push(m); }
  registerMethod({ id: root.SokElenchus.id, name: root.SokElenchus.name, createSession: root.SokElenchus.createSession });

  const $ = (id) => document.getElementById(id);
  const screen = $("screen");
  const topics = root.SOKRATES_TOPICS || {};
  const units = root.SOKRATES_UNITS || [];

  const storeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };

  const app = {
    view: "start",
    methodId: methods[0].id,
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
  function paintTimer() {
    const t = $("bar-timer");
    if (!app.startedAt) { t.hidden = true; return; }
    t.hidden = false;
    t.textContent = formatElapsed((app.stoppedAt || Date.now()) - app.startedAt);
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

  function show(view) {
    app.view = view;
    screen.replaceChildren(VIEWS[view]());
    paintBar();
    const first = screen.querySelector("[data-autofocus]");
    if (first) first.focus();
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

  // 판정 보류·다시 볼 생각일 때만 보이는 접힌 상자. TV에서 학생에게 답이 바로 보이지 않게 접어 둡니다.
  function helperBox(help) {
    if (!help) return null;
    const line = (k, v) => el("p", {}, [el("span", { class: "k", text: k }), el("span", { text: v })]);
    return el("details", { class: "helper card no-print" }, [
      el("summary", { text: "선생님 도움말" }),
      help.item && line("살펴볼 생각", help.item),
      help.truth && line("교과서 내용", help.truth),
      line("펼쳐 볼 곳", help.where),
      help.notes && help.notes.length > 0 && el("div", { class: "notes" }, [
        el("span", { class: "k", text: "바로 설명할 내용" }),
        el("ul", {}, help.notes.map((n) => el("li", {}, [el("span", { text: n.text }), el("span", { class: "page", text: ` (${n.page}쪽)` })]))),
      ]),
      help.hints.length > 0 && line("이어서 물어볼 것", help.hints.join(" · ")),
    ]);
  }

  // 다시 볼 생각일 때 무엇이 바뀌었는지 두 줄로 보여 줍니다.
  function rethinkBox(r) {
    if (!r) return null;
    const row = (k, v) => el("p", {}, [el("span", { class: "k", text: k }), el("span", { text: v })]);
    return el("div", { class: "rethink" }, [row("처음 생각", r.before), row("고친 생각", r.after)]);
  }

  function toast(msg) {
    const t = el("div", { class: "toast", role: "status", text: msg });
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------- 화면들 ----------
  const VIEWS = {
    settings() {
      const s = L.loadSettings();
      const key = el("input", { type: "password", id: "api-key", autocomplete: "off", "data-autofocus": true,
        placeholder: s.apiKey ? "저장된 키가 있어요 (바꿀 때만 입력)" : "sk-ant-로 시작하는 키" });
      const model = el("select", { id: "model" }, L.MODELS.map((m) =>
        el("option", { value: m, selected: m === s.model, text: MODEL_LABEL[m] || m })));
      const effort = el("select", { id: "effort" }, L.EFFORTS.map((v) =>
        el("option", { value: v, selected: v === s.effort, text: EFFORT_LABEL[v] })));

      function save() {
        const typed = key.value.trim();
        if (!typed && !s.apiKey) { key.focus(); toast("API 키를 넣어 주세요"); return; }
        L.saveSettings({ apiKey: typed || null, model: model.value, effort: effort.value });
        toast("저장했어요");
        backFromSettings();
      }
      return el("section", { class: "stack" }, [
        el("h1", { text: "설정" }),
        el("div", { class: "card stack" }, [
          el("label", { class: "field" }, [el("span", { text: "Claude API 키" }), key,
            el("div", { class: "hint", text: "키는 이 PC의 브라우저에만 저장돼요. 여러 사람이 쓰는 PC라면 수업 뒤에 [키 지우기]를 눌러 주세요." })]),
          el("label", { class: "field" }, [el("span", { text: "AI 모델" }), model]),
          el("label", { class: "field" }, [el("span", { text: "생각하는 정도" }), effort,
            el("div", { class: "hint", text: "낮을수록 답이 빨라요. 교실에서는 '낮음'을 권해요." })]),
          el("div", { class: "row end" }, [
            s.apiKey && el("button", { class: "btn quiet", type: "button", text: "키 지우기",
              onclick: () => { L.clearKey(); toast("키를 지웠어요"); show("settings"); } }),
            s.apiKey && el("button", { class: "btn secondary", type: "button", text: "닫기", onclick: backFromSettings }),
            el("button", { class: "btn", type: "button", text: "저장", onclick: save }),
          ]),
        ]),
      ]);
    },

    start() {
      const sc = current();
      Object.assign(app, { textbookId: sc.textbookId, unitId: String(sc.unit.id), lessonKey: sc.choice.key });
      const pick = (field, key) => (e) => { app[field] = e.target.value; storeSet(key, e.target.value); show("start"); };

      const methodSel = el("select", { id: "method", onchange: (e) => { app.methodId = e.target.value; } },
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
            el("div", { class: "hint", text: "반례 질문은 고른 교과서에서 오늘까지 배운 내용으로만 나와요." })]),
          n > 0 && el("div", { class: "note", text: `검토하지 않은 오개념이 ${n}개 있어요. review.html 에서 확인해 주세요.` }),
          el("div", { class: "row end" }, [el("button", { class: "btn", type: "button", text: "시작하기", onclick: () => newStudent() })]),
        ]),
      ]);
    },

    input() {
      const boxes = [0, 1, 2].map((i) => el("textarea", { rows: 1, id: `item-${i}`, "aria-label": `배운 것 ${i + 1}`,
        "data-autofocus": i === 0 || null, placeholder: i === 0 ? "예) 오늘 배운 것 한 가지" : "" }));
      const go = el("button", { class: "btn", type: "button", text: "확인하기" });
      boxes.forEach((b, i) => b.addEventListener("keydown", onEnter(() => (i < 2 ? boxes[i + 1].focus() : go.click()))));
      go.addEventListener("click", async () => {
        const items = boxes.map((b) => b.value);
        const empty = items.findIndex((v) => !v.trim());
        if (empty >= 0) { boxes[empty].focus(); toast("세 칸을 모두 채워 주세요"); return; }
        const s = app.session;
        const p = s.submitItems(items);
        show("talk"); // 바로 '생각하는 중' 화면으로
        await p;
        after(s);
      });
      const sc = current();
      return el("section", { class: "stack" }, [
        el("div", { class: "goal" }, [el("span", { class: "k", text: "학습문제" }), el("p", { text: sc.lessonTitle })]),
        el("h1", { text: "오늘 배운 3가지를 말해 볼까요?" }),
        el("div", { class: "card items-input" }, boxes.map((b, i) =>
          el("div", { class: "item-line" }, [el("span", { class: "num", text: String(i + 1) }), b]))),
        el("div", { class: "row end" }, [go]),
      ]);
    },

    talk() {
      const s = app.session;
      const st = s.getState();
      const parts = [];

      parts.push(el("ol", { class: "checks card", "aria-label": "배운 3가지" }, st.items.map((it, i) => {
        const c = st.checks && st.checks[i];
        return el("li", { class: st.checks && i === st.target ? "target" : null }, [
          el("span", { class: "num", text: String(i + 1) }),
          el("span", { text: it }),
          c ? el("span", { class: `badge ${c}`, text: CHECK_TEXT[c] }) : null,
        ]);
      })));

      if (st.turns.length) {
        parts.push(el("div", { class: "history" }, st.turns.flatMap((t, i) => [
          el("p", { text: `질문 ${i + 1}. ${t.q}` }), el("p", { class: "a", text: `→ ${t.a}` }),
        ])));
      }

      const dots = el("span", { class: "dots", "aria-label": `질문 ${Math.min(st.turns.length + 1, st.maxQuestions)} / ${st.maxQuestions}` },
        Array.from({ length: st.maxQuestions }, (_, i) => el("i", { class: i <= st.turns.length ? "on" : null })));

      if (st.phase === "waiting") {
        parts.push(el("div", { class: "qcard" }, [
          el("div", { class: "who" }, [el("span", { text: "소크라테스" }), st.mode ? dots : null]),
          el("div", { class: "thinking" }, [el("span", { text: "생각하는 중이에요" }),
            el("span", { class: "pulse", "aria-hidden": "true" }, [el("i"), el("i"), el("i")])]),
        ]));
      }

      if (st.phase === "asking") {
        parts.push(el("div", { class: "qcard" }, [
          el("div", { class: "who" }, [el("span", { text: "소크라테스" }), dots]),
          el("div", { class: "q", text: st.question }),
        ]));
        const answer = el("textarea", { rows: 2, id: "answer", "data-autofocus": true, "aria-label": "학생의 답", placeholder: "학생의 답을 적어 주세요" });
        const send = el("button", { class: "btn", type: "button", text: "보내기" });
        const submit = async () => {
          if (!answer.value.trim()) { answer.focus(); return; }
          const p = s.submitAnswer(answer.value);
          show("talk");
          await p;
          after(s);
        };
        send.addEventListener("click", submit);
        answer.addEventListener("keydown", onEnter(submit));
        parts.push(answer);
        parts.push(el("div", { class: "row end" }, [
          el("button", { class: "btn quiet", type: "button", text: "바로 정리하기",
            onclick: async () => { const p = s.finishNow(); show("talk"); await p; after(s); } }),
          send,
        ]));
      }

      if (st.phase === "error") {
        parts.push(el("div", { class: "error-box", role: "alert", text: st.error }));
        parts.push(el("div", { class: "row end" }, [
          el("button", { class: "btn secondary", type: "button", text: "설정 확인", onclick: () => show("settings") }),
          el("button", { class: "btn", type: "button", text: "다시 시도", "data-autofocus": true,
            onclick: async () => { const p = s.retry(); show("talk"); await p; after(s); } }),
        ]));
      }

      return el("section", { class: "stack" }, parts);
    },

    result() {
      const st = app.session.getState();
      const v = VERDICT_TEXT[st.verdict];
      const sc = app.scope;
      const meta = { topicTitle: sc.contextTitle, textbookName: `${sc.textbookName} ${sc.lessonLabel}`, dateStr: today(), state: st };
      return el("section", { class: "stack" }, [
        el("div", { class: `verdict ${st.verdict}` }, [
          el("div", { class: "label", text: v.label }), el("div", { class: "msg", text: v.message }),
          rethinkBox(rethink(st)),
        ]),
        el("div", { class: "card" }, [el("ul", { class: "summary" }, st.summary.map((line, i) =>
          el("li", {}, [el("span", { class: "k", text: SUMMARY_LABELS[i] }), el("span", { text: line })])))]),
        helperBox(teacherHelp(sc.topic, sc.textbookId, st, sc.choice.lessonId)),
        el("details", { class: "record card" }, [
          el("summary", { text: "문답 기록 보기" }),
          el("p", { text: `${meta.topicTitle} · ${meta.textbookName} · ${meta.dateStr} · ${formatElapsed((app.stoppedAt || Date.now()) - app.startedAt)}` }),
          ...st.items.map((it, i) => el("p", { text: `${i + 1}. ${it}${st.checks ? ` (${CHECK_TEXT[st.checks[i]]})` : ""}` })),
          ...st.turns.flatMap((t, i) => [el("p", { text: `질문 ${i + 1}. ${t.q}` }), el("p", { text: `→ ${t.a}` })]),
        ]),
        el("div", { class: "row end no-print" }, [
          el("button", { class: "btn secondary", type: "button", text: "복사", onclick: () => copy(resultText(meta)) }),
          el("button", { class: "btn secondary", type: "button", text: "인쇄", onclick: () => {
            const d = screen.querySelector("details.record"); if (d) d.open = true; window.print(); } }),
          el("button", { class: "btn", type: "button", text: "다음 학생", "data-autofocus": true, onclick: () => newStudent() }),
        ]),
      ]);
    },
  };

  const MODEL_LABEL = { "claude-haiku-5-5": "Claude Haiku 5.5 (빠름 · 기본)", "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-opus-5-5": "Claude Opus 5.5 (가장 깊게)" };
  const EFFORT_LABEL = { low: "낮음 (빠름)", medium: "보통", high: "높음 (느림)" };

  function after(s) {
    if (s !== app.session) return; // 그사이 [다음 학생]을 눌렀으면 무시
    const st = s.getState();
    if (st.phase === "done") { stopTimer(); show("result"); } else show("talk");
  }

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
    const phase = app.session.getState().phase;
    show(phase === "input" ? "input" : phase === "done" ? "result" : "talk");
  }

  function newStudent() {
    if (app.session) app.session.cancel();
    const settings = L.loadSettings();
    if (!settings.apiKey) { show("settings"); return; }
    const sc = current();
    app.scope = sc;
    app.session = method().createSession({ topic: sc.topic, textbookId: sc.textbookId, lessonId: sc.choice.lessonId, llm: liveLLM });
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
  show(L.loadSettings().apiKey ? "start" : "settings");
})(window);

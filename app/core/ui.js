// 화면 공통 부품: 판정 문구, 확인 표시, 타이머 글자, 복사용 결과 글, 작은 DOM 도우미
(function (root) {
  const VERDICT_TEXT = {
    strong: { label: "튼튼한 생각", message: "반례에도 무너지지 않았어요. 근거가 있는 생각이에요." },
    revisit: { label: "다시 볼 생각", message: "모르는 것을 알게 되었어요. 다음 시간에 확인해 봐요." },
    hold: { label: "판정 보류", message: "선생님과 더 이야기해 봐요." },
  };
  const CHECK_TEXT = { ok: "✓", think: "더 생각해 볼 것", unsure: "교과서에서 함께 찾아봐요", outside: "오늘 주제와 다른 이야기예요" };
  const SUMMARY_LABELS = ["알게 된 것", "다시 생각한 것", "다음 시간 확인할 것"];

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  // 다시 볼 생각일 때 무엇이 바뀌었는지: 학생이 처음 적은 대상 항목 → 세 줄 정리의 "다시 생각한 것"
  function rethink(state) {
    if (!state || state.verdict !== "revisit" || state.target == null || !state.items) return null;
    const before = state.items[state.target];
    const after = state.summary && typeof state.summary[1] === "string" ? state.summary[1].trim() : "";
    return before && after ? { before, after } : null;
  }
  const rethinkText = (r) => `처음 생각: ${r.before} → 고친 생각: ${r.after}`;

  function resultText({ topicTitle, textbookName, dateStr, state }) {
    const lines = [`[엘렌코스 학습정리] ${topicTitle} · ${textbookName} · ${dateStr}`, "", "배운 3가지"];
    state.items.forEach((it, i) => {
      const mark = state.checks ? ` (${CHECK_TEXT[state.checks[i]]})` : "";
      lines.push(`${i + 1}. ${it}${mark}`);
    });
    if (state.turns.length) {
      lines.push("", "문답");
      state.turns.forEach((t, i) => lines.push(`질문${i + 1}: ${t.q}`, `답${i + 1}: ${t.a}`));
    }
    if (state.verdict) {
      const v = VERDICT_TEXT[state.verdict];
      lines.push("", `판정: ${v.label} — ${v.message}`);
      const r = rethink(state);
      if (r) lines.push(rethinkText(r));
    }
    if (state.summary) {
      lines.push("", "세 줄 정리");
      state.summary.forEach((s, i) => lines.push(`- ${SUMMARY_LABELS[i]}: ${s}`));
    }
    return lines.join("\n");
  }

  const unitOf = (lessonId) => String(lessonId).split("-")[0];
  const lessonText = (l) => `${unitOf(l.id)}단원 ${l.no}차시`; // { id: "3-10", no: "10~11" } → "3단원 10~11차시"

  // 판정 보류·다시 볼 생각일 때 선생님이 이어서 짚어 줄 것: 교과서 내용, 펼쳐 볼 곳, 이어서 물어볼 것
  // lessonId: 오늘 차시(단원 마무리면 null). 오개념을 못 찾으면 오늘 차시나 차시 목록을 가리킵니다.
  function teacherHelp(topic, textbookId, state, lessonId = null) {
    if (!state || (state.verdict !== "hold" && state.verdict !== "revisit")) return null;
    const tb = topic.textbooks.find((t) => t.id === textbookId);
    if (!tb) return null;
    const findLesson = (id) => tb.lessons.find((l) => l.id === id);
    const item = state.target != null && state.items ? state.items[state.target] || null : null;
    const m = state.misconception && topic.misconceptions.find((x) => x.id === state.misconception);
    const src = m && m.sources[textbookId];
    const lesson = src && findLesson(src.lesson);
    // 바로 설명할 내용: 고른 교과서에 실린 개념 문장과 그 쪽(교과서 대조 검증을 마친 문장)
    const note = (c) => ({ text: c.text, page: c.sources[textbookId].page });
    const inBook = (c) => c && c.sources && c.sources[textbookId];
    if (m && lesson) {
      const notes = (m.concepts || []).map((id) => topic.concepts.find((c) => c.id === id)).filter(inBook).map(note);
      return { item, truth: m.truth, where: `${tb.name} ${lessonText(lesson)} ${lesson.title} ${src.page}쪽`, hints: m.counterHints.slice(), notes };
    }
    const today = lessonId != null && findLesson(lessonId);
    const where = today ? `${tb.name} ${lessonText(today)} ${today.title}` : `${tb.name} ${tb.lessons.map(lessonText).join(", ")}`;
    // 단원 마무리처럼 오늘 차시가 없으면 범위가 너무 넓어 비워 둡니다.
    const notes = today ? topic.concepts.filter((c) => inBook(c) && c.sources[textbookId].lesson === today.id).map(note) : [];
    return { item, truth: null, where, hints: [], notes };
  }

  // el("div", {class: "x", onclick: fn}, [자식...]) — 글자는 textContent로만 넣어 HTML 주입을 막습니다.
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) if (c != null && c !== false) node.append(c);
    return node;
  }

  const SokUI = { VERDICT_TEXT, CHECK_TEXT, SUMMARY_LABELS, formatElapsed, rethink, resultText, teacherHelp, el };
  if (typeof module !== "undefined" && module.exports) module.exports = SokUI;
  else root.SokUI = SokUI;
})(this);

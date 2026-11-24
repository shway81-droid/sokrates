// 화면 공통 부품: 판정 문구, 확인 표시, 타이머 글자, 복사용 결과 글, 작은 DOM 도우미
(function (root) {
  const VERDICT_TEXT = {
    strong: { label: "튼튼한 생각", message: "반례에도 무너지지 않았어요. 근거가 있는 생각이에요." },
    revisit: { label: "다시 볼 생각", message: "스스로 허점을 찾았어요. 다음 시간에 확인해 봐요." },
    hold: { label: "판정 보류", message: "선생님과 더 이야기해 봐요." },
  };
  const CHECK_TEXT = { ok: "✓", think: "더 생각해 볼 것", outside: "교과서 밖 이야기예요" };
  const SUMMARY_LABELS = ["알게 된 것", "다시 생각한 것", "다음 시간 확인할 것"];

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

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
    }
    if (state.summary) {
      lines.push("", "세 줄 정리");
      state.summary.forEach((s, i) => lines.push(`- ${SUMMARY_LABELS[i]}: ${s}`));
    }
    return lines.join("\n");
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

  const SokUI = { VERDICT_TEXT, CHECK_TEXT, SUMMARY_LABELS, formatElapsed, resultText, el };
  if (typeof module !== "undefined" && module.exports) module.exports = SokUI;
  else root.SokUI = SokUI;
})(this);

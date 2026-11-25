// 엘렌코스 화면: 배운 3가지 → 확인과 반례 문답 → 판정과 세 줄 정리. 문답 흐름은 methods/elenchus.js 에 있습니다.
(function (root) {
  const { el, verdictText, CHECK_TEXT, SUMMARY_LABELS, rethink, resultText, teacherHelp } = root.SokUI;
  const P = root.SokParts;
  const E = root.SokElenchus;
  const WHO = "소크라테스";

  // 다시 볼 생각일 때 무엇이 바뀌었는지 두 줄로 보여 줍니다.
  function rethinkBox(r) {
    if (!r) return null;
    const row = (k, v) => el("p", {}, [el("span", { class: "k", text: k }), el("span", { text: v })]);
    return el("div", { class: "rethink" }, [row("처음 생각", r.before), row("고친 생각", r.after)]);
  }

  const views = {
    input(kit) {
      const boxes = [0, 1, 2].map((i) => el("textarea", { rows: 1, id: `item-${i}`, "aria-label": `배운 것 ${i + 1}`,
        "data-autofocus": i === 0 || null, placeholder: i === 0 ? "예) 오늘 배운 것 한 가지" : "" }));
      const go = el("button", { class: "btn", type: "button", text: "확인하기" });
      boxes.forEach((b, i) => b.addEventListener("keydown", kit.onEnter(() => (i < 2 ? boxes[i + 1].focus() : go.click()))));
      go.addEventListener("click", () => {
        const items = boxes.map((b) => b.value);
        const empty = items.findIndex((v) => !v.trim());
        if (empty >= 0) { boxes[empty].focus(); kit.toast("세 칸을 모두 채워 주세요"); return; }
        kit.act(kit.session.submitItems(items));
      });
      return el("section", { class: "stack" }, [
        P.goal(kit.scope.lessonTitle),
        el("h1", { text: "오늘 배운 3가지를 말해 볼까요?" }),
        el("div", { class: "card items-input" }, boxes.map((b, i) =>
          el("div", { class: "item-line" }, [el("span", { class: "num", text: String(i + 1) }), b]))),
        el("div", { class: "row end" }, [go]),
      ]);
    },

    talk(kit) {
      const s = kit.session;
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

      parts.push(P.thread(WHO, st.turns));

      const dots = () => P.dots(st.turns.length + 1, st.maxQuestions);
      if (st.phase === "waiting") parts.push(P.thinkingCard(WHO, st.mode ? dots() : null));
      if (st.phase === "asking") {
        parts.push(P.questionCard(WHO, dots(), st.question));
        parts.push(...P.answerArea(kit, { send: (a) => s.submitAnswer(a), finish: () => s.finishNow() }));
      }
      if (st.phase === "error") parts.push(...P.errorArea(kit));

      return el("section", { class: "stack" }, parts);
    },

    result(kit) {
      const st = kit.session.getState();
      const v = verdictText(st);
      const sc = kit.scope;
      const meta = { topicTitle: sc.contextTitle, textbookName: `${sc.textbookName} ${sc.lessonLabel}`, dateStr: kit.today(), state: st };
      return el("section", { class: "stack" }, [
        el("div", { class: `verdict ${st.verdict}` }, [
          el("div", { class: "label", text: v.label }), el("div", { class: "msg", text: v.message }),
          rethinkBox(rethink(st)),
        ]),
        el("div", { class: "card" }, [el("ul", { class: "summary" }, st.summary.map((line, i) =>
          el("li", {}, [el("span", { class: "k", text: SUMMARY_LABELS[i] }), el("span", { text: line })])))]),
        P.helperBox(teacherHelp(sc.topic, sc.textbookId, st, sc.choice.lessonId)),
        P.recordBox([
          `${meta.topicTitle} · ${meta.textbookName} · ${meta.dateStr} · ${kit.elapsedText()}`,
          ...st.items.map((it, i) => `${i + 1}. ${it}${st.checks ? ` (${CHECK_TEXT[st.checks[i]]})` : ""}`),
          ...st.turns.flatMap((t, i) => [`질문 ${i + 1}. ${t.q}`, `→ ${t.a}`]),
        ]),
        P.resultActions(kit, resultText(meta)),
      ]);
    },
  };

  (root.SokMethods = root.SokMethods || []).push({
    id: E.id,
    name: E.name,
    startHint: "반례 질문은 고른 교과서에서 오늘까지 배운 내용으로만 나와요.",
    createSession: E.createSession,
    views,
  });
})(this);

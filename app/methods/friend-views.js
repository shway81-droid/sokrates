// 모르는 친구 화면: 한 칸 설명 → 친구의 엉뚱한 질문 문답 → 질문마다 표시와 친구의 한마디. 문답 흐름은 methods/friend.js 에 있습니다.
(function (root) {
  const { el } = root.SokUI;
  const P = root.SokParts;
  const F = root.SokFriend;
  const WHO = "모르는 친구";

  // 학생의 설명을 작게 보여 주는 상자
  const explainBox = (text) => el("div", { class: "explain-box" }, [el("span", { class: "k", text: "나의 설명" }), el("p", { text: text })]);

  const views = {
    input(kit) {
      const box = el("textarea", { rows: 3, id: "explain", "data-autofocus": true, "aria-label": "친구에게 하는 설명",
        placeholder: "예) 오늘은 ~을 배웠어요. ~해서 ~가 되었어요." });
      // 여러 문장을 쓰는 칸이라 Enter는 줄바꿈입니다. 보내기는 버튼으로만 합니다(반쪽 설명이 가지 않게).
      const go = el("button", { class: "btn", type: "button", text: "보내기" });
      go.addEventListener("click", () => {
        if (!box.value.trim()) { box.focus(); kit.toast("설명을 적어 주세요"); return; }
        kit.act(kit.session.submitExplanation(box.value));
      });
      return el("section", { class: "stack" }, [
        P.goal(kit.scope.lessonTitle),
        el("h1", { text: "친구에게 오늘 배운 것을 설명해 볼까요?" }),
        el("div", { class: "card" }, [box]),
        el("div", { class: "row end" }, [go]),
      ]);
    },

    talk(kit) {
      const s = kit.session;
      const st = s.getState();
      // 문답 화면에서는 학생의 설명을 첫 말풍선(오른쪽)으로 보여 줍니다.
      const parts = [el("div", { class: "bubble-row me" }, [el("div", { class: "bubble a" }, [el("span", { class: "k", text: "나의 설명" }), el("span", { text: st.explanation })])])];

      parts.push(P.thread(WHO, st.turns));

      const dots = () => P.dots(st.turns.length + 1, st.maxQuestions);
      if (st.phase === "waiting") parts.push(P.thinkingCard(WHO, dots()));
      if (st.phase === "asking") {
        parts.push(P.questionCard(WHO, dots(), st.question, st.reaction || null));
        parts.push(...P.answerArea(kit, { send: (a) => s.submitAnswer(a), finish: () => s.finishNow() }));
      }
      if (st.phase === "error") parts.push(...P.errorArea(kit));

      return el("section", { class: "stack" }, parts);
    },

    result(kit) {
      const st = kit.session.getState();
      const sc = kit.scope;
      const meta = { topicTitle: sc.contextTitle, textbookName: `${sc.textbookName} ${sc.lessonLabel}`, dateStr: kit.today(), state: st };
      const help = F.friendHelp(sc.topic, sc.textbookId, st, sc.choice.lessonId);
      return el("section", { class: "stack" }, [
        P.goal(sc.lessonTitle),
        explainBox(st.explanation),
        st.turns.length > 0 && el("ol", { class: "marks card", "aria-label": "친구의 질문" }, st.turns.map((t, i) =>
          el("li", {}, [
            el("span", { class: "num", text: String(i + 1) }),
            el("div", { class: "qa" }, [el("p", { class: "q", text: t.q }), el("p", { class: "a", text: `→ ${t.a}` })]),
            t.mark ? el("span", { class: `mark ${t.mark}`, text: F.MARK_TEXT[t.mark] }) : null,
          ]))),
        el("div", { class: "card" }, [el("ul", { class: "summary" }, [
          el("li", {}, [el("span", { class: "k", text: "친구의 한마디" }), el("span", { text: st.thanks })]),
          el("li", {}, [el("span", { class: "k", text: "다음 시간 확인할 것" }), el("span", { text: st.nextQuestion })]),
        ])]),
        help && el("details", { class: "helper card no-print" }, [
          el("summary", { text: "선생님 도움말" }),
          ...help.sections.map((h) => el("div", { class: "section" }, P.helpLines(h))),
        ]),
        P.recordBox([
          `${meta.topicTitle} · ${meta.textbookName} · ${meta.dateStr} · ${kit.elapsedText()}`,
          `설명: ${st.explanation}`,
          ...st.turns.flatMap((t, i) => [`질문 ${i + 1}. ${t.q}`, `→ ${t.a}${t.mark ? ` (${F.MARK_TEXT[t.mark]})` : ""}`]),
        ]),
        P.resultActions(kit, F.resultText(meta)),
      ]);
    },
  };

  (root.SokMethods = root.SokMethods || []).push({
    id: F.id,
    name: F.name,
    startHint: "친구의 질문은 고른 교과서에서 오늘까지 배운 내용으로만 나와요.",
    createSession: F.createSession,
    views,
  });
})(this);

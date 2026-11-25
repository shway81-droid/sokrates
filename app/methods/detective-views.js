// 오답 탐정 화면: 시작 안내 → 친구의 정리 4문장에서 이상한 문장 누르고 까닭 말하기 → 문제마다 표시.
// 문답 흐름은 methods/detective.js 에 있습니다.
(function (root) {
  const { el } = root.SokUI;
  const P = root.SokParts;
  const D = root.SokDetective;
  const WHO = "오답 탐정";
  const NUM = ["①", "②", "③", "④"];

  // 학생이 찾은 문제(까닭을 보낸 뒤)만 숨은 문장을 표시합니다. 못 찾은 문제는 TV에 답이 보이지 않게 둡니다.
  const found = (r) => !!r && (r.reason != null || r.mark === "solved" || r.mark === "found");

  // 문장 카드. onPick이 있으면 누를 수 있는 버튼, 없으면 읽기만 합니다.
  function cards(p, r, { selected = null, onPick = null } = {}) {
    const looked = new Set((r ? r.wrongTaps : []).map((w) => w.index));
    return el("ol", { class: "dt-cards", "aria-label": "친구의 정리" }, p.sentences.map((s, i) => {
      const cls = ["dt-card", selected === i && "picked", looked.has(i) && "looked", found(r) && i === p.hidden && "found"].filter(Boolean).join(" ");
      const body = [el("span", { class: "num", text: NUM[i] }), el("span", { class: "t", text: s })];
      return el("li", {}, [onPick
        ? el("button", { class: cls, type: "button", "data-i": String(i), disabled: looked.has(i), "aria-pressed": selected === i ? "true" : "false",
          onclick: () => onPick(i) }, body)
        : el("div", { class: cls, "data-i": String(i) }, body)]);
    }));
  }

  // 카드를 누를 때마다 화면을 새로 그리므로, 까닭 칸에 쓰던 글을 세션·문제마다 기억해 두었다가 다시 넣습니다.
  // 보내면 지웁니다(맞는 문장을 보낸 뒤 다른 카드를 누르면 빈 칸).
  const drafts = new WeakMap();
  const draftOf = (s, index) => { const d = drafts.get(s); return d && d.index === index ? d.text : ""; };

  const isReview = (kit, p) => D.fromEarlierLesson(p, kit.scope.topic, kit.scope.textbookId, kit.scope.choice.lessonId);

  const finishBtn = (kit) => el("button", { class: "btn quiet", type: "button", text: "바로 정리하기", onclick: () => kit.act(kit.session.finishNow()) });

  const views = {
    input(kit) {
      return el("section", { class: "stack" }, [
        P.goal(kit.scope.lessonTitle),
        el("h1", { text: "친구의 정리에서 이상한 곳을 찾아볼까요?" }),
        el("div", { class: "card dt-guide" }, [
          el("p", { text: "친구가 정리한 문장 가운데 한 곳에 이상한 생각이 숨어 있어요." }),
          el("p", { text: "이상한 문장을 누르고, 왜 이상한지 말해 주세요." }),
        ]),
        el("div", { class: "row end" }, [
          el("button", { class: "btn", type: "button", text: "시작", "data-autofocus": true, onclick: () => kit.act(kit.session.start()) }),
        ]),
      ]);
    },

    talk(kit) {
      const s = kit.session;
      const st = s.getState();
      const p = st.problems[st.index];
      const r = st.records[st.index];
      const dots = () => P.dots(st.index + 1, st.problems.length);
      const canPick = st.phase === "asking" && st.step === "pick";
      // 오늘 차시에 오개념이 하나뿐이라 둘째 문제가 앞 차시에서 나왔으면 '복습'이라고 알려 줍니다.
      const review = isReview(kit, p);
      const parts = [
        P.goal(kit.scope.lessonTitle),
        el("div", { class: "dt-head" }, [
          el("div", { class: "bubble-row ai" }, [P.avatar(WHO), el("div", { class: "bubble past" }, [
            review ? el("span", { class: "dt-review", text: "앞에서 배운 내용 복습" }) : null,
            el("p", { class: "dt-lead", text: "친구가 배운 것을 이렇게 정리했어요. 한 곳이 이상해요." }),
          ])]),
          dots(),
        ]),
        cards(p, st.step === "pick" ? { ...r, reason: null } : r, { selected: st.selected, onPick: canPick ? (i) => kit.act(s.select(i)) : null }),
      ];

      // 숨은 문장을 찾은 뒤에는 학생이 쓴 까닭과 앞의 문답을 작게 보여 줍니다.
      if (r && r.reason != null && st.step !== "pick") {
        parts.push(el("div", { class: "dt-mine" }, [
          el("div", { class: "bubble-row me" }, [el("div", { class: "bubble a" }, [el("span", { class: "k", text: "나의 까닭" }), el("span", { text: r.reason })])]),
          P.thread(WHO, r.turns),
        ]));
      }

      if (st.phase === "waiting") parts.push(P.thinkingCard(WHO, dots()));
      // 오류 화면에서도 그때까지 한 것을 결과로 남기고 끝낼 수 있게 합니다.
      if (st.phase === "error") parts.push(...P.errorArea(kit), el("div", { class: "row end" }, [finishBtn(kit)]));
      if (st.phase === "asking" && st.step === "pick") {
        if (st.line) parts.push(el("div", { class: "dt-line card", text: st.line }));
        if (st.selected != null) {
          // 어느 문장을 눌러도 같은 질문과 칸이 나옵니다(보내기 전에는 맞는 문장인지 알려 주지 않음).
          const box = el("textarea", { rows: 2, id: "reason", "data-autofocus": true, "aria-label": "왜 이상한지", placeholder: "왜 이상한지 적어 주세요" });
          box.value = draftOf(s, st.index);
          box.addEventListener("input", () => drafts.set(s, { index: st.index, text: box.value }));
          const send = () => {
            if (!box.value.trim()) { box.focus(); return; }
            drafts.delete(s);
            kit.act(s.submitReason(box.value));
          };
          box.addEventListener("keydown", kit.onEnter(send));
          parts.push(
            el("div", { class: "bubble-row ai" }, [P.avatar(WHO), el("div", { class: "bubble ask" }, [el("h2", { class: "dt-ask", text: "이 문장이 왜 이상한가요?" })])]),
            el("div", { class: "composer" }, [box, el("button", { class: "btn send", type: "button", text: "보내기", onclick: send })]),
            el("div", { class: "row end" }, [finishBtn(kit)]));
        } else {
          parts.push(el("div", { class: "row end" }, [finishBtn(kit)]));
        }
      }
      if (st.phase === "asking" && st.step === "follow") {
        parts.push(P.questionCard(WHO, dots(), st.question));
        parts.push(...P.answerArea(kit, { send: (a) => s.submitAnswer(a), finish: () => s.finishNow() }));
      }
      if (st.phase === "asking" && st.step === "between") {
        const last = st.index + 1 >= st.problems.length;
        parts.push(el("div", { class: `dt-line card ${r.mark}`, text: st.line }));
        parts.push(el("div", { class: "row end" }, [
          !last && finishBtn(kit), // 마지막 문제의 [결과 보기]가 곧 정리하기라서 그때는 두지 않습니다
          el("button", { class: "btn", type: "button", text: last ? "결과 보기" : "다음 문제", "data-autofocus": true, onclick: () => kit.act(s.next()) }),
        ]));
      }
      return el("section", { class: "stack" }, parts);
    },

    result(kit) {
      const st = kit.session.getState();
      const sc = kit.scope;
      const meta = { topicTitle: sc.contextTitle, textbookName: `${sc.textbookName} ${sc.lessonLabel}`, dateStr: kit.today(), state: st };
      const help = D.detectiveHelp(sc.topic, sc.textbookId, st, sc.choice.lessonId);
      const helpLine = (k, v) => el("p", {}, [el("span", { class: "k", text: k }), el("span", { text: v })]);
      return el("section", { class: "stack" }, [
        P.goal(sc.lessonTitle),
        st.records.length === 0 && el("div", { class: "card", text: "오늘 차시에 낼 문제가 없어요." }),
        ...st.records.map((r, i) => {
          const p = st.problems[i];
          return el("div", { class: "card dt-result" }, [
            el("div", { class: "dt-head" }, [el("h2", { text: `문제 ${i + 1}${isReview(kit, p) ? " · 앞에서 배운 내용 복습" : ""}` }), r.mark ? el("span", { class: `mark dt-${r.mark}`, text: D.MARK_TEXT[r.mark] }) : null]),
            cards(p, r),
            r.reason ? el("p", { class: "dt-reason" }, [el("span", { class: "k", text: "나의 까닭" }), el("span", { text: r.reason })]) : null,
          ]);
        }),
        help && el("details", { class: "helper card no-print" }, [
          el("summary", { text: "선생님 도움말" }),
          ...help.sections.map((h) => el("div", { class: "section" }, [
            ...P.helpLines(h),
            ...h.wrongTaps.map((w) => helpLine("학생이 이상하다고 본 문장", `${w.sentence} — 학생의 생각: ${w.reason}`)),
          ])),
        ]),
        P.recordBox([
          `${meta.topicTitle} · ${meta.textbookName} · ${meta.dateStr} · ${kit.elapsedText()}`,
          ...st.records.flatMap((r, i) => {
            const p = st.problems[i];
            return [
              `문제 ${i + 1}${r.mark ? ` (${D.MARK_TEXT[r.mark]})` : ""}`,
              ...r.wrongTaps.map((w) => `누른 문장 ${NUM[w.index]} → ${w.reason}`),
              ...(r.reason != null ? [`누른 문장 ${NUM[p.hidden]} → ${r.reason}`] : []),
              ...r.turns.flatMap((t) => [`질문. ${t.q}`, `→ ${t.a}`]),
            ];
          }),
        ]),
        P.resultActions(kit, D.resultText(meta)),
      ]);
    },
  };

  (root.SokMethods = root.SokMethods || []).push({
    id: D.id,
    name: D.name,
    startHint: "문제는 고른 교과서에서 오늘까지 배운 내용으로만 나와요.",
    createSession: D.createSession,
    views,
  });
})(this);

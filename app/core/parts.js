// 공통 화면 부품: 여러 방법의 화면이 함께 쓰는 조각들입니다(브라우저 전용).
// 각 함수는 DOM 요소(또는 요소 배열)를 돌려주고, kit(app.js가 건네는 도구)으로 화면을 옮깁니다.
(function (root) {
  const { el } = root.SokUI;

  // 맨 위 학습문제 상자
  function goal(title) {
    return el("div", { class: "goal" }, [el("span", { class: "k", text: "학습문제" }), el("p", { text: title })]);
  }

  // 진행 점 ●○○: done개(지금 묻는 질문까지) 켜짐
  function dots(done, max) {
    return el("span", { class: "dots", "aria-label": `질문 ${Math.min(done, max)} / ${max}` },
      Array.from({ length: max }, (_, i) => el("i", { class: i < done ? "on" : null })));
  }

  function thinkingCard(who, dotsEl) {
    return el("div", { class: "qcard" }, [
      el("div", { class: "who" }, [el("span", { text: who }), dotsEl || null]),
      el("div", { class: "thinking" }, [el("span", { text: "생각하는 중이에요" }),
        el("span", { class: "pulse", "aria-hidden": "true" }, [el("i"), el("i"), el("i")])]),
    ]);
  }

  // extra: 질문 위에 붙는 작은 글(모르는 친구의 반응). 없으면 넣지 않습니다.
  function questionCard(who, dotsEl, question, extra = null) {
    return el("div", { class: "qcard" }, [
      el("div", { class: "who" }, [el("span", { text: who }), dotsEl]),
      extra ? el("div", { class: "reaction", text: extra }) : null,
      el("div", { class: "q", text: question }),
    ]);
  }

  // 답 칸과 [바로 정리하기] [보내기]. send(text)·finish()는 세션 동작의 promise를 돌려줍니다.
  function answerArea(kit, { send, finish }) {
    const answer = el("textarea", { rows: 2, id: "answer", "data-autofocus": true, "aria-label": "학생의 답", placeholder: "학생의 답을 적어 주세요" });
    const sendBtn = el("button", { class: "btn", type: "button", text: "보내기" });
    const submit = () => {
      if (!answer.value.trim()) { answer.focus(); return; }
      kit.act(send(answer.value));
    };
    sendBtn.addEventListener("click", submit);
    answer.addEventListener("keydown", kit.onEnter(submit));
    return [answer, el("div", { class: "row end" }, [
      el("button", { class: "btn quiet", type: "button", text: "바로 정리하기", onclick: () => kit.act(finish()) }),
      sendBtn,
    ])];
  }

  function errorArea(kit) {
    return [
      el("div", { class: "error-box", role: "alert", text: kit.session.getState().error }),
      el("div", { class: "row end" }, [
        el("button", { class: "btn secondary", type: "button", text: "설정 확인", onclick: kit.openSettings }),
        el("button", { class: "btn", type: "button", text: "다시 시도", "data-autofocus": true, onclick: () => kit.act(kit.session.retry()) }),
      ]),
    ];
  }

  // 판정 보류·다시 볼 생각(또는 함께 더 알아봐요)일 때만 보이는 접힌 상자. TV에서 학생에게 답이 바로 보이지 않게 접어 둡니다.
  // help: { item, truth, where, notes, hints } (ui.js helpFor 결과). where가 없으면 그 줄을 넣지 않습니다.
  function helperBox(help, title = "선생님 도움말") {
    if (!help) return null;
    return el("details", { class: "helper card no-print" }, [el("summary", { text: title }), ...helpLines(help)]);
  }
  function helpLines(help) {
    const line = (k, v) => el("p", {}, [el("span", { class: "k", text: k }), el("span", { text: v })]);
    return [
      help.item && line(help.itemLabel || "살펴볼 생각", help.item), // 모르는 친구는 itemLabel "살펴볼 질문"
      help.truth && line("교과서 내용", help.truth),
      help.where && line("펼쳐 볼 곳", help.where),
      help.notes && help.notes.length > 0 && el("div", { class: "notes" }, [
        el("span", { class: "k", text: "바로 설명할 내용" }),
        el("ul", {}, help.notes.map((n) => el("li", {}, [el("span", { text: n.text }), el("span", { class: "page", text: ` (${n.page}쪽)` })]))),
      ]),
      help.hints && help.hints.length > 0 && line("이어서 물어볼 것", help.hints.join(" · ")),
    ].filter(Boolean);
  }

  // 접힌 문답 기록. 인쇄할 때 펼쳐집니다(app.js의 beforeprint).
  function recordBox(lines) {
    return el("details", { class: "record card" }, [el("summary", { text: "문답 기록 보기" }), ...lines.map((t) => el("p", { text: t }))]);
  }

  function resultActions(kit, text) {
    return el("div", { class: "row end no-print" }, [
      el("button", { class: "btn secondary", type: "button", text: "복사", onclick: () => kit.copy(text) }),
      el("button", { class: "btn secondary", type: "button", text: "인쇄", onclick: () => {
        const d = document.querySelector("#screen details.record"); if (d) d.open = true; window.print(); } }),
      el("button", { class: "btn", type: "button", text: "다음 학생", "data-autofocus": true, onclick: kit.nextStudent }),
    ]);
  }

  root.SokParts = { goal, dots, thinkingCard, questionCard, answerArea, errorArea, helperBox, helpLines, recordBox, resultActions };
})(this);

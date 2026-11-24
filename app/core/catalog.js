// 시작 화면 선택 계산: 교과서 → 단원 → 오늘 차시를 고르면 세션에 넘길 주제와 차시를 정합니다.
// topics 는 SOKRATES_TOPICS 같은 { 묶음 id: 묶음 } 맵, units 는 SOKRATES_UNITS 배열입니다.
(function (root) {
  const T = typeof module !== "undefined" && module.exports ? require("./topic.js") : root.SokTopic;

  // 묶음이 하나라도 불러와진 단원만, 불러온 묶음만 남겨서 돌려줍니다.
  function availableUnits(units, topics) {
    return (units || [])
      .map((u) => ({ ...u, topics: u.topics.filter((id) => topics[id]) }))
      .filter((u) => u.topics.length);
  }

  // 단원에 나오는 교과서(첫 묶음부터 나온 순서)
  function textbooksOf(unit, topics) {
    const out = [];
    for (const id of unit.topics) for (const tb of topics[id].textbooks)
      if (!out.some((x) => x.id === tb.id)) out.push({ id: tb.id, name: tb.name });
    return out;
  }

  // 그 교과서의 내용 차시(진도표 순서)와 마지막 "단원 마무리"
  function lessonChoices(unit, topics, textbookId) {
    const choices = [];
    for (const id of unit.topics) {
      const tb = topics[id].textbooks.find((t) => t.id === textbookId);
      if (!tb) continue;
      for (const l of tb.lessons) choices.push({ key: l.id, label: `${l.no}차시 ${l.title}`, lessonId: l.id, topicId: id });
    }
    const wrap = unit.wrap && unit.wrap[textbookId];
    if (wrap) choices.push({ key: "wrap", label: `단원 마무리 (${wrap.no}차시)`, lessonId: null, topicId: null });
    return choices;
  }

  // 저장된 값이 지금 목록에 없으면 각 목록의 첫 항목으로 대신합니다.
  function resolve(units, topics, { textbookId, unitId, key } = {}) {
    const avail = availableUnits(units, topics);
    if (!avail.length) throw new Error("불러온 단원이 없습니다");
    const unit = avail.find((u) => u.id === Number(unitId)) || avail[0];
    const tbs = textbooksOf(unit, topics);
    const tb = tbs.find((t) => t.id === textbookId) || tbs[0];
    const choices = lessonChoices(unit, topics, tb.id);
    const choice = choices.find((c) => c.key === key) || choices[0];
    const topic = T.mergeTopics(unit.topics.map((id) => topics[id]), unit.title);
    const lesson = choice.lessonId && topic.textbooks.find((t) => t.id === tb.id).lessons.find((l) => l.id === choice.lessonId);
    return {
      textbookId: tb.id,
      textbookName: tb.name,
      unit,
      choice,
      choices,
      topic,
      contextTitle: choice.topicId ? topics[choice.topicId].title : unit.title,
      lessonLabel: lesson ? `${lesson.no}차시` : "단원 마무리",
      // 입력 화면 맨 위에 보여 줄 학습문제: 차시 제목, 단원 마무리면 그 교과서의 마무리 제목
      lessonTitle: lesson ? lesson.title : (unit.wrap && unit.wrap[tb.id] && unit.wrap[tb.id].title) || "단원 마무리",
    };
  }

  // 선생님 PC에만 있는 교과서 원문(app/local/texts.js)에서 오늘 차시 글을 꺼냅니다. 없으면 null.
  function sourceText(texts, textbookId, lessonId) {
    const t = lessonId != null && texts && texts[textbookId] && texts[textbookId][lessonId];
    return typeof t === "string" && t.trim() ? t : null;
  }

  const SokCatalog = { availableUnits, textbooksOf, lessonChoices, resolve, sourceText };
  if (typeof module !== "undefined" && module.exports) module.exports = SokCatalog;
  else root.SokCatalog = SokCatalog;
})(this);

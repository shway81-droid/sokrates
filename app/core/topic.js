// 주제 데이터 도우미: 데이터 오류 찾기, 고른 교과서 범위 거르기, 프롬프트용 맥락 만들기
(function (root) {
  function checkSources(errors, item, tbIds) {
    const src = item.sources;
    if (!src || typeof src !== "object" || !Object.keys(src).length) {
      errors.push(`${item.id}: sources가 비어 있음`);
      return;
    }
    for (const [key, val] of Object.entries(src)) {
      if (!tbIds.has(key)) errors.push(`${item.id}: 없는 교과서 키 ${key}`);
      if (!val || typeof val.lesson !== "string" || typeof val.page !== "string")
        errors.push(`${item.id}: ${key} 출처에 lesson·page가 없음`);
    }
  }

  function validateTopic(topic) {
    const errors = [];
    if (!topic || typeof topic !== "object") return ["주제 데이터가 없음"];
    for (const f of ["id", "title"]) if (typeof topic[f] !== "string") errors.push(`${f}가 없음`);
    const textbooks = topic.textbooks || [];
    const concepts = topic.concepts || [];
    const miscs = topic.misconceptions || [];
    if (!textbooks.length) errors.push("textbooks가 비어 있음");

    const tbIds = new Set();
    for (const tb of textbooks) {
      if (tbIds.has(tb.id)) errors.push(`교과서 id 중복: ${tb.id}`);
      tbIds.add(tb.id);
    }

    const seen = new Set();
    for (const item of [...concepts, ...miscs]) {
      if (seen.has(item.id)) errors.push(`id 중복: ${item.id}`);
      seen.add(item.id);
    }

    const conceptIds = new Set(concepts.map((c) => c.id));
    for (const c of concepts) {
      if (typeof c.text !== "string" || !c.text.trim()) errors.push(`${c.id}: text가 없음`);
      checkSources(errors, c, tbIds);
    }
    for (const m of miscs) {
      for (const f of ["wrong", "truth"]) if (typeof m[f] !== "string" || !m[f].trim()) errors.push(`${m.id}: ${f}가 없음`);
      if (!Array.isArray(m.counterHints)) errors.push(`${m.id}: counterHints가 배열이 아님`);
      if (typeof m.reviewed !== "boolean") errors.push(`${m.id}: reviewed가 true/false가 아님`);
      for (const ref of m.concepts || []) if (!conceptIds.has(ref)) errors.push(`${m.id}: 없는 개념 ${ref}`);
      checkSources(errors, m, tbIds);
    }

    for (const id of tbIds) {
      const n = miscs.filter((m) => m.sources && m.sources[id]).length;
      if (n < 2) errors.push(`교과서 ${id}: 반례에 쓸 오개념이 ${n}개뿐(2개 이상 필요)`);
    }

    if (!Array.isArray(topic.synonyms) || !topic.synonyms.every(Array.isArray))
      errors.push("synonyms는 배열의 배열이어야 함");
    return errors;
  }

  function inScope(item, textbookId) {
    return !!(item.sources && item.sources[textbookId]);
  }

  function scopeFor(topic, textbookId) {
    return {
      concepts: topic.concepts.filter((c) => inScope(c, textbookId)),
      misconceptions: topic.misconceptions.filter((m) => inScope(m, textbookId)),
    };
  }

  function unreviewedCount(topic) {
    return topic.misconceptions.filter((m) => !m.reviewed).length;
  }

  function buildContext(topic, textbookId) {
    const tb = topic.textbooks.find((t) => t.id === textbookId);
    if (!tb) throw new Error(`알 수 없는 교과서: ${textbookId}`);
    const scope = scopeFor(topic, textbookId);
    const lines = [`주제: ${topic.title}`, "", "[전체 개념]"];
    for (const c of topic.concepts) lines.push(`- ${c.id}: ${c.text}`);
    lines.push("", `[반례에 쓸 수 있는 범위: ${tb.name}]`);
    lines.push(`개념: ${scope.concepts.map((c) => c.id).join(", ")}`);
    lines.push("흔한 오개념:");
    for (const m of scope.misconceptions) {
      lines.push(`- ${m.id}: 잘못된 생각 "${m.wrong}" / 바른 생각 "${m.truth}" / 반례 실마리: ${m.counterHints.join(", ")}`);
    }
    lines.push("", "[같은 뜻으로 인정할 말]");
    for (const g of topic.synonyms) lines.push(`- ${g.join(" = ")}`);
    return lines.join("\n");
  }

  const SokTopic = { validateTopic, scopeFor, unreviewedCount, buildContext };
  if (typeof module !== "undefined" && module.exports) module.exports = SokTopic;
  else root.SokTopic = SokTopic;
})(this);

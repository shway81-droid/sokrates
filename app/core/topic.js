// 주제 데이터 도우미: 데이터 오류 찾기, 묶음 합치기, 오늘까지 배운 차시로 범위 거르기, 프롬프트용 맥락 만들기
(function (root) {
  const LESSON_FIELDS = ["id", "no", "title", "pages"];

  function checkSources(errors, item, lessonIds) {
    const src = item.sources;
    if (!src || typeof src !== "object" || !Object.keys(src).length) {
      errors.push(`${item.id}: sources가 비어 있음`);
      return;
    }
    for (const [key, val] of Object.entries(src)) {
      if (!lessonIds.has(key)) { errors.push(`${item.id}: 없는 교과서 키 ${key}`); continue; }
      if (!val || typeof val.lesson !== "string" || typeof val.page !== "string") {
        errors.push(`${item.id}: ${key} 출처에 lesson·page가 없음`);
        continue;
      }
      if (!lessonIds.get(key).has(val.lesson)) errors.push(`${item.id}: ${key} 출처 차시 ${val.lesson}가 lessons에 없음`);
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

    const lessonIds = new Map(); // 교과서 id → 차시 id 집합
    for (const tb of textbooks) {
      if (lessonIds.has(tb.id)) errors.push(`교과서 id 중복: ${tb.id}`);
      const ids = new Set();
      const lessons = Array.isArray(tb.lessons) ? tb.lessons : [];
      if (!lessons.length) errors.push(`교과서 ${tb.id}: lessons가 비어 있음`);
      for (const l of lessons) {
        if (!l || typeof l !== "object" || !LESSON_FIELDS.every((f) => typeof l[f] === "string")) {
          errors.push(`교과서 ${tb.id}: lessons 항목은 {id, no, title, pages} 객체여야 함`);
          continue;
        }
        if (ids.has(l.id)) errors.push(`교과서 ${tb.id}: 차시 id 중복 ${l.id}`);
        ids.add(l.id);
      }
      lessonIds.set(tb.id, ids);
    }

    const seen = new Set();
    for (const item of [...concepts, ...miscs]) {
      if (seen.has(item.id)) errors.push(`id 중복: ${item.id}`);
      seen.add(item.id);
    }

    const conceptIds = new Set(concepts.map((c) => c.id));
    for (const c of concepts) {
      if (typeof c.text !== "string" || !c.text.trim()) errors.push(`${c.id}: text가 없음`);
      checkSources(errors, c, lessonIds);
    }
    for (const m of miscs) {
      for (const f of ["wrong", "truth"]) if (typeof m[f] !== "string" || !m[f].trim()) errors.push(`${m.id}: ${f}가 없음`);
      if (!Array.isArray(m.counterHints)) errors.push(`${m.id}: counterHints가 배열이 아님`);
      if (typeof m.reviewed !== "boolean") errors.push(`${m.id}: reviewed가 true/false가 아님`);
      for (const ref of m.concepts || []) if (!conceptIds.has(ref)) errors.push(`${m.id}: 없는 개념 ${ref}`);
      checkSources(errors, m, lessonIds);
    }

    for (const id of lessonIds.keys()) {
      const n = miscs.filter((m) => m.sources && m.sources[id]).length;
      if (n < 2) errors.push(`교과서 ${id}: 반례에 쓸 오개념이 ${n}개뿐(2개 이상 필요)`);
    }

    if (!Array.isArray(topic.synonyms) || !topic.synonyms.every(Array.isArray))
      errors.push("synonyms는 배열의 배열이어야 함");
    return errors;
  }

  // 단원의 묶음들을 하나로 합칩니다. 차시는 묶음 순서대로 이어 붙여 진도표 순서가 됩니다.
  function mergeTopics(topics, title) {
    const textbooks = [];
    for (const t of topics) {
      for (const tb of t.textbooks) {
        let out = textbooks.find((x) => x.id === tb.id);
        if (!out) { out = { id: tb.id, name: tb.name, lessons: [] }; textbooks.push(out); }
        out.lessons.push(...tb.lessons);
      }
    }
    const first = topics[0] || {};
    return {
      id: topics.map((t) => t.id).join("+"),
      title,
      grade: first.grade,
      subject: first.subject,
      textbooks,
      concepts: topics.flatMap((t) => t.concepts),
      misconceptions: topics.flatMap((t) => t.misconceptions),
      synonyms: topics.flatMap((t) => t.synonyms),
    };
  }

  function findTextbook(topic, textbookId) {
    const tb = topic.textbooks.find((t) => t.id === textbookId);
    if (!tb) throw new Error(`알 수 없는 교과서: ${textbookId}`);
    return tb;
  }

  // 오늘 차시의 순번(진도표 순서). 없는 차시면 throw 합니다.
  function lessonIndex(tb, lessonId) {
    const i = tb.lessons.findIndex((l) => l.id === lessonId);
    if (i < 0) throw new Error(`알 수 없는 차시: ${tb.id} ${lessonId}`);
    return i;
  }

  function inScope(item, textbookId) {
    return !!(item.sources && item.sources[textbookId]);
  }

  // 반례에 쓸 수 있는 범위: 그 교과서 출처가 있고, lessonId가 있으면 오늘까지 배운 차시의 것만.
  function scopeFor(topic, textbookId, lessonId) {
    let taught = () => true;
    if (lessonId != null) {
      const tb = findTextbook(topic, textbookId);
      const today = lessonIndex(tb, lessonId);
      const order = new Map(tb.lessons.map((l, i) => [l.id, i]));
      taught = (item) => order.get(item.sources[textbookId].lesson) <= today;
    }
    const keep = (item) => inScope(item, textbookId) && taught(item);
    return {
      concepts: topic.concepts.filter(keep),
      misconceptions: topic.misconceptions.filter(keep),
    };
  }

  function unreviewedCount(topic) {
    return topic.misconceptions.filter((m) => !m.reviewed).length;
  }

  const unitOf = (lessonId) => String(lessonId).split("-")[0];
  const miscLine = (m) => `- ${m.id}: 잘못된 생각 "${m.wrong}" / 바른 생각 "${m.truth}" / 반례 실마리: ${m.counterHints.join(", ")}`;

  function buildContext(topic, textbookId, lessonId) {
    const tb = findTextbook(topic, textbookId);
    const scope = scopeFor(topic, textbookId, lessonId);
    const lines = [`주제: ${topic.title}`, "", "[전체 개념]"];
    for (const c of topic.concepts) lines.push(`- ${c.id}: ${c.text}`);

    let today = [];
    if (lessonId != null) {
      const lesson = tb.lessons[lessonIndex(tb, lessonId)];
      const isToday = (item) => item.sources[textbookId].lesson === lessonId;
      lines.push("", `[오늘 차시: ${tb.name} ${unitOf(lesson.id)}단원 ${lesson.no}차시 ${lesson.title}]`);
      lines.push(`개념: ${scope.concepts.filter(isToday).map((c) => c.id).join(", ")}`);
      today = scope.misconceptions.filter(isToday);
    }

    lines.push("", `[반례에 쓸 수 있는 범위: ${tb.name}]`);
    lines.push(`개념: ${scope.concepts.map((c) => c.id).join(", ")}`);
    if (!scope.misconceptions.length) {
      lines.push("흔한 오개념: 없음");
    } else if (today.length) {
      lines.push("흔한 오개념(오늘 차시):");
      for (const m of today) lines.push(miscLine(m));
      const earlier = scope.misconceptions.filter((m) => !today.includes(m));
      if (earlier.length) {
        lines.push("흔한 오개념(앞 차시):");
        for (const m of earlier) lines.push(miscLine(m));
      }
    } else {
      lines.push("흔한 오개념:");
      for (const m of scope.misconceptions) lines.push(miscLine(m));
    }

    lines.push("", "[같은 뜻으로 인정할 말]");
    for (const g of topic.synonyms) lines.push(`- ${g.join(" = ")}`);
    return lines.join("\n");
  }

  const SokTopic = { validateTopic, scopeFor, unreviewedCount, buildContext, mergeTopics };
  if (typeof module !== "undefined" && module.exports) module.exports = SokTopic;
  else root.SokTopic = SokTopic;
})(this);

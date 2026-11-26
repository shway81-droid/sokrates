// 아티팩트판 AI 호출. core/llm.js 와 같은 모양(SokLLM)을 내지만, API 키 대신
// 아티팩트의 sample 기능으로 화면을 연 사람의 Claude 계정에서 답을 받습니다.
// sample 에는 시스템 프롬프트와 JSON 스키마 칸이 없어서, 규칙과 스키마를 첫 user 턴에 넣고
// 받은 JSON 을 여기서 스키마로 한 번 검사합니다(어긋나면 그 점을 알려 한 번만 다시 받음).
(function (root) {
  const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
  const EFFORTS = ["low", "medium", "high"];
  const DEFAULTS = { model: "claude-haiku-5-5", effort: "low" };
  const KEYS = { model: "sok.model", effort: "sok.effort" };
  const TIER = { "claude-haiku-5-5": "quick", "claude-sonnet-5-5": "default", "claude-opus-5-5": "complex" };

  const defaultStorage = () => (typeof localStorage !== "undefined" ? localStorage : null);
  function safeGet(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch { return null; }
  }

  function loadSettings(storage = defaultStorage()) {
    const model = safeGet(storage, KEYS.model);
    const effort = safeGet(storage, KEYS.effort);
    return {
      apiKey: null,
      model: MODELS.includes(model) ? model : DEFAULTS.model,
      effort: EFFORTS.includes(effort) ? effort : DEFAULTS.effort,
    };
  }

  function saveSettings(s, storage = defaultStorage()) {
    if (!storage) return;
    try {
      if (s.model) storage.setItem(KEYS.model, s.model);
      if (s.effort) storage.setItem(KEYS.effort, s.effort);
    } catch { /* 저장이 막힌 브라우저: 이번 화면에서만 씁니다 */ }
  }

  function clearKey() { /* 아티팩트판에는 키가 없습니다 */ }

  const textOf = (c) => (typeof c === "string" ? c : (c || []).filter((b) => b.type === "text").map((b) => b.text).join("\n\n"));

  function buildInput({ system, messages, schema }) {
    const rules = textOf(system) +
      "\n\n[응답 형식]\n아래 JSON 스키마를 그대로 따르는 JSON 객체 하나만 내세요. 앞뒤에 다른 글이나 코드 울타리를 쓰지 마세요." +
      " required 칸은 모두 넣고, enum 이 있는 칸은 그 값 중 하나만 쓰고, 스키마에 없는 칸은 넣지 않습니다.\n" +
      JSON.stringify(schema);
    return [{ role: "user", content: rules }, ...messages.map((m) => ({ role: m.role, content: textOf(m.content) }))];
  }

  function optionsFor({ model, effort }) {
    return { model, modelTier: TIER[model] || "quick", effort, cache: false };
  }

  // 앱 스키마에 쓰는 만큼만 봅니다: type, enum, required, properties, additionalProperties:false, items.
  function validate(v, s, path = "응답") {
    if (!s || typeof s !== "object") return null;
    if (s.enum && !s.enum.includes(v)) return `${path} 값은 ${JSON.stringify(s.enum)} 중 하나여야 합니다`;
    const t = s.type;
    const typeOk = { object: v && typeof v === "object" && !Array.isArray(v), array: Array.isArray(v), string: typeof v === "string",
      boolean: typeof v === "boolean", integer: Number.isInteger(v), number: typeof v === "number", null: v === null };
    if (t && !(Array.isArray(t) ? t.some((x) => typeOk[x]) : typeOk[t])) return `${path} 는 ${JSON.stringify(t)} 이어야 합니다`;
    if (Array.isArray(v) && s.items) {
      for (let i = 0; i < v.length; i++) { const e = validate(v[i], s.items, `${path}[${i}]`); if (e) return e; }
    }
    if (typeOk.object && s.properties) {
      for (const k of s.required || []) if (!(k in v)) return `${path === "응답" ? "" : path + "."}${k} 칸이 빠졌습니다`;
      for (const k of Object.keys(v)) {
        const p = path === "응답" ? k : `${path}.${k}`;
        if (!(k in s.properties)) { if (s.additionalProperties === false) return `${p} 칸은 스키마에 없습니다`; continue; }
        const e = validate(v[k], s.properties[k], p); if (e) return e;
      }
    }
    return null;
  }

  const MESSAGES = {
    unavailable: "이 화면에서는 Claude를 부를 수 없어요. claude.ai에 로그인한 상태로 아티팩트를 열어 주세요.",
    not_granted: "Claude 사용을 허용해야 AI가 답할 수 있어요. 화면을 새로 열고 허용을 눌러 주세요.",
    rate_limited: "AI를 너무 자주 불렀어요. 잠시 뒤 다시 해 주세요.",
    sampling_disabled: "지금 이 계정에서는 AI를 쓸 수 없어요.",
    invalid_json: "AI 응답을 읽지 못했어요. 다시 해 주세요.",
    shape: "AI 응답 모양이 맞지 않았어요. 다시 해 주세요.",
  };
  const toError = (e) => new Error(MESSAGES[e && e.code] || `AI를 부르다 문제가 생겼어요${e && e.code ? ` (${e.code})` : ""}. 다시 해 주세요.`);

  const useSample = () => (root.claude && root.claude.use ? root.claude.use("sample") : Promise.resolve(null));

  function createClaudeLLM(settings, getSample = useSample) {
    return {
      async call(req) {
        const sample = await getSample();
        if (!sample) throw new Error(MESSAGES.unavailable);
        const opts = optionsFor(settings);
        const input = buildInput(req);
        let out;
        try { out = await sample.json(input, opts); } catch (e) { throw toError(e); }
        const problem = validate(out, req.schema);
        if (!problem) return out;
        const again = [...input, { role: "user", content: `[앞 응답이 형식 검사에 걸렸어요: ${problem}] 같은 내용으로 형식만 고쳐 JSON 하나만 다시 내세요.` }];
        try { out = await sample.json(again, opts); } catch (e) { throw toError(e); }
        if (validate(out, req.schema)) throw new Error(MESSAGES.shape);
        return out;
      },
    };
  }

  const SokLLM = { KEYLESS: true, MODELS, EFFORTS, DEFAULTS, KEYS, loadSettings, saveSettings, clearKey, buildInput, optionsFor, validate, createClaudeLLM };
  if (typeof module !== "undefined" && module.exports) module.exports = SokLLM;
  else root.SokLLM = SokLLM;
})(this);

// Claude 호출과 설정 저장. 나중에 서버(B안)로 옮길 때는 이 파일의 createClaudeLLM만 바꾸면 됩니다.
(function (root) {
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.13.0/+esm";
  const MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
  const EFFORTS = ["low", "medium", "high"];
  const DEFAULTS = { model: "claude-sonnet-5-5", effort: "low" };
  const KEYS = { apiKey: "sok.apiKey", model: "sok.model", effort: "sok.effort" };
  // 안전 문제로 답을 거절하면 다른 모델이 대신 답하는 서버 기능 (Haiku 5.5는 지원하지 않음)
  const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"];

  const defaultStorage = () => (typeof localStorage !== "undefined" ? localStorage : null);

  function safeGet(storage, key) {
    try { return storage ? storage.getItem(key) : null; } catch { return null; }
  }

  function loadSettings(storage = defaultStorage()) {
    const model = safeGet(storage, KEYS.model);
    const effort = safeGet(storage, KEYS.effort);
    return {
      apiKey: safeGet(storage, KEYS.apiKey) || null,
      model: MODELS.includes(model) ? model : DEFAULTS.model,
      effort: EFFORTS.includes(effort) ? effort : DEFAULTS.effort,
    };
  }

  function saveSettings(s, storage = defaultStorage()) {
    if (!storage) return;
    try {
      if (s.apiKey) storage.setItem(KEYS.apiKey, s.apiKey.trim());
      if (s.model) storage.setItem(KEYS.model, s.model);
      if (s.effort) storage.setItem(KEYS.effort, s.effort);
    } catch { /* 저장이 막힌 브라우저: 이번 화면에서만 씁니다 */ }
  }

  function clearKey(storage = defaultStorage()) {
    try { if (storage) storage.removeItem(KEYS.apiKey); } catch { /* 무시 */ }
  }

  function buildRequest({ model, effort, system, messages, schema }) {
    const req = {
      model,
      max_tokens: 8000,
      system,
      messages,
      output_config: { effort, format: { type: "json_schema", schema } },
    };
    if (FALLBACK_MODELS.includes(model)) {
      req.betas = ["server-side-fallback-2026-07-01"];
      req.fallbacks = "default";
    }
    return req;
  }

  function parseResponse(msg) {
    if (msg.stop_reason === "refusal") throw new Error("AI가 답을 거절했습니다");
    const block = (msg.content || []).find((b) => b.type === "text");
    if (!block) throw new Error("AI 응답에 글이 없습니다");
    return JSON.parse(block.text);
  }

  let sdkPromise = null;
  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = import(SDK_URL).catch((e) => {
        sdkPromise = null; // 다음 시도에서 다시 불러옵니다
        throw e;
      });
    }
    return sdkPromise;
  }

  // 학교망이 응답 없이 끊어도 오래 기다리지 않게 합니다(최악 약 90초 뒤 오류 화면).
  function clientOptions(apiKey) {
    return { apiKey, dangerouslyAllowBrowser: true, timeout: 45000, maxRetries: 1 };
  }

  function createClaudeLLM(settings) {
    let client = null;
    return {
      async call({ system, messages, schema }) {
        if (!client) {
          const mod = await loadSdk();
          const Anthropic = mod.default || mod.Anthropic;
          client = new Anthropic(clientOptions(settings.apiKey));
        }
        const msg = await client.beta.messages.create(
          buildRequest({ model: settings.model, effort: settings.effort, system, messages, schema }));
        return parseResponse(msg);
      },
    };
  }

  const SokLLM = { SDK_URL, MODELS, EFFORTS, DEFAULTS, KEYS, loadSettings, saveSettings, clearKey, buildRequest, parseResponse, clientOptions, createClaudeLLM };
  if (typeof module !== "undefined" && module.exports) module.exports = SokLLM;
  else root.SokLLM = SokLLM;
})(this);

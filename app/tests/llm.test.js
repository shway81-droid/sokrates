const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./load").load("core/llm.js");

// localStorage 흉내
function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const args = { model: "claude-haiku-5-5", effort: "low", system: "S", messages: [{ role: "user", content: "U" }], schema: { type: "object" } };

test("defaults when empty", () => assert.deepEqual(L.loadSettings(mem()), { apiKey: null, model: "claude-haiku-5-5", effort: "low" }));
test("save and load", () => { const m = mem(); L.saveSettings({ apiKey: "k", model: "claude-sonnet-5-5", effort: "medium" }, m); assert.deepEqual(L.loadSettings(m), { apiKey: "k", model: "claude-sonnet-5-5", effort: "medium" }); });
test("unknown model falls back to default", () => assert.equal(L.loadSettings(mem({ "sok.model": "gpt-x" })).model, "claude-haiku-5-5"));
test("clearKey removes only key", () => { const m = mem({ "sok.apiKey": "x", "sok.model": "claude-sonnet-5-5" }); L.clearKey(m); assert.equal(m.getItem("sok.apiKey"), null); assert.equal(m.getItem("sok.model"), "claude-sonnet-5-5"); });
test("storage that throws is tolerated", () => { const bad = { getItem() { throw new Error("blocked"); } }; assert.deepEqual(L.loadSettings(bad), { apiKey: null, model: "claude-haiku-5-5", effort: "low" }); });
test("request uses structured output", () => { const r = L.buildRequest(args); assert.deepEqual(r.output_config.format, { type: "json_schema", schema: args.schema }); assert.equal(r.output_config.effort, "low"); assert.equal(r.model, "claude-haiku-5-5"); assert.equal(r.system, "S"); assert.ok(r.max_tokens >= 4000); });
test("fallback on opus/sonnet only", () => {
  const o = L.buildRequest({ ...args, model: "claude-opus-5-5" });
  assert.equal(o.fallbacks, "default"); assert.deepEqual(o.betas, ["server-side-fallback-2026-07-01"]);
  const h = L.buildRequest({ ...args, model: "claude-haiku-5-5" });
  assert.equal(h.fallbacks, undefined); assert.equal(h.betas, undefined);
});
test("no thinking/temperature fields", () => { const r = L.buildRequest(args); assert.equal(r.thinking, undefined); assert.equal(r.temperature, undefined); });
test("parse response text block", () => assert.deepEqual(L.parseResponse({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"a":1}' }] }), { a: 1 }));
test("refusal throws", () => assert.throws(() => L.parseResponse({ stop_reason: "refusal", content: [] }), /거절/));
test("no text block throws", () => assert.throws(() => L.parseResponse({ stop_reason: "end_turn", content: [] })));
test("client gives up a hung request quickly", () => {
  const o = L.clientOptions("k");
  assert.equal(o.apiKey, "k"); assert.equal(o.dangerouslyAllowBrowser, true);
  assert.ok(o.timeout <= 45000, "timeout"); assert.ok(o.maxRetries <= 1, "maxRetries");
});

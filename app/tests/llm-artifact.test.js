const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./load").load("artifact/llm.js");

const schema = {
  type: "object",
  properties: { stage: { type: "string", enum: ["ask", "done"] }, question: { type: "string" }, checks: { type: "array", items: { type: "boolean" } } },
  required: ["stage", "question", "checks"],
  additionalProperties: false,
};

test("keyless and same settings shape", () => {
  assert.equal(A.KEYLESS, true);
  const s = A.loadSettings({ getItem: () => null });
  assert.equal(s.model, "claude-haiku-5-5");
  assert.equal(s.effort, "low");
});

test("system and messages become user turns, system first", () => {
  const turns = A.buildInput({ system: [{ type: "text", text: "규칙" }], messages: [{ role: "user", content: [{ type: "text", text: "학생 말" }] }], schema });
  assert.equal(turns.length, 2);
  assert.equal(turns[0].role, "user");
  assert.match(turns[0].content, /규칙/);
  assert.match(turns[0].content, /"enum":\["ask","done"\]/);
  assert.equal(turns[1].role, "user");
  assert.match(turns[1].content, /학생 말/);
  assert.equal(turns.at(-1).role, "user");
});

test("string system and string content work too", () => {
  const turns = A.buildInput({ system: "S", messages: [{ role: "user", content: "U" }], schema });
  assert.match(turns[0].content, /^S/);
  assert.equal(turns[1].content, "U");
});

test("tier follows model", () => {
  assert.deepEqual(A.optionsFor({ model: "claude-haiku-5-5", effort: "low" }), { model: "claude-haiku-5-5", modelTier: "quick", effort: "low", cache: false });
  assert.equal(A.optionsFor({ model: "claude-sonnet-5-5", effort: "low" }).modelTier, "default");
  assert.equal(A.optionsFor({ model: "claude-opus-5-5", effort: "high" }).modelTier, "complex");
});

test("validate accepts a matching value", () => {
  assert.equal(A.validate({ stage: "ask", question: "왜?", checks: [true] }, schema), null);
});

test("validate names a missing field, a wrong enum, a wrong type, an extra field", () => {
  assert.match(A.validate({ stage: "ask", checks: [] }, schema), /question/);
  assert.match(A.validate({ stage: "zzz", question: "", checks: [] }, schema), /stage/);
  assert.match(A.validate({ stage: "ask", question: 3, checks: [] }, schema), /question/);
  assert.match(A.validate({ stage: "ask", question: "", checks: [], more: 1 }, schema), /more/);
  assert.match(A.validate({ stage: "ask", question: "", checks: ["x"] }, schema), /checks/);
});

test("call retries once with the problem when shape is wrong", async () => {
  const seen = [];
  const answers = [{ stage: "ask", checks: [] }, { stage: "ask", question: "왜?", checks: [] }];
  const fake = { json: async (input) => { seen.push(input); return answers.shift(); } };
  const llm = A.createClaudeLLM({ model: "claude-haiku-5-5", effort: "low" }, async () => fake);
  const out = await llm.call({ system: "S", messages: [{ role: "user", content: "U" }], schema });
  assert.equal(out.question, "왜?");
  assert.equal(seen.length, 2);
  assert.match(seen[1].at(-1).content, /question/);
});

test("call gives a Korean message when sampling is unavailable or refused", async () => {
  const none = A.createClaudeLLM({ model: "claude-haiku-5-5", effort: "low" }, async () => null);
  await assert.rejects(none.call({ system: "S", messages: [{ role: "user", content: "U" }], schema }), /Claude/);
  const refused = A.createClaudeLLM({ model: "claude-haiku-5-5", effort: "low" },
    async () => ({ json: async () => { throw { code: "not_granted", message: "no" }; } }));
  await assert.rejects(refused.call({ system: "S", messages: [{ role: "user", content: "U" }], schema }), /허용/);
});

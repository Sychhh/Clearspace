import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../server.mjs";
const PASSWORD = "test-only-private-password";
const SECRET = "test-only-session-secret-at-least-32-characters";
const FAKE_KEY = "sk-test-fixture-never-sent-to-a-real-provider";
async function open(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "clearspace-test-"));
  const app = createApp({
    provider: "openai",
    password: PASSWORD,
    sessionSecret: SECRET,
    apiKey: "",
    publicOrigin: "",
    databasePath: join(directory, "test.sqlite"),
    ...options,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const base = "http://127.0.0.1:" + app.server.address().port;
  return {
    ...app,
    directory,
    base,
    async stop() {
      await new Promise((r) => app.server.close(r));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
async function call(app, path, body, cookie, extra = {}) {
  const headers = { ...extra };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(app.base + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}
async function login(app) {
  const r = await call(app, "/api/login", { password: PASSWORD });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  return cookie.split(";")[0];
}
const entry = (kind = "task") => ({
  id: crypto.randomUUID(),
  kind,
  title: "Prepare a small pudding sample",
  body: "Try an eggless recipe first.",
  created: new Date().toISOString(),
  date: "2026-11-10",
  messages: [],
});

test("password auth, signed sessions, CSRF, record CRUD, export and restart persistence", async () => {
  const a = await open();
  try {
    assert.equal((await call(a, "/api/data")).status, 401);
    assert.equal((await call(a, "/api/export")).status, 401);
    assert.equal(
      (await call(a, "/api/login", { password: "wrong" })).status,
      401,
    );
    const cookie = await login(a);
    assert.equal((await call(a, "/api/me", undefined, cookie)).status, 200);
    assert.equal(
      (await call(a, "/api/me", undefined, cookie + "tampered")).status,
      401,
    );
    const record = entry();
    assert.equal(
      (await call(a, "/api/data", { action: "save", record }, cookie)).status,
      200,
    );
    let data = await (await call(a, "/api/data", undefined, cookie)).json();
    assert.equal(data.records[0].title, record.title);
    assert.equal(
      (
        await call(
          a,
          "/api/data",
          { action: "save", record: { ...record, title: "blocked" } },
          cookie,
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          a,
          "/api/data",
          {
            action: "save",
            record: { ...record, title: "Updated task", done: true },
          },
          cookie,
        )
      ).status,
      200,
    );
    await call(
      a,
      "/api/data",
      { action: "profile", profile: "I am learning Python." },
      cookie,
    );
    const exported = await (
      await call(a, "/api/export", undefined, cookie)
    ).json();
    assert.equal(exported.records[0].title, "Updated task");
    assert.equal(exported.profile, "I am learning Python.");
    assert.equal(JSON.stringify(exported).includes("api_key"), false);
    // A second SQLite connection sees committed data, as a process after restart would.
    const { DatabaseSync } = await import("node:sqlite");
    const reopened = new DatabaseSync(a.databasePath);
    assert.equal(
      JSON.parse(
        reopened
          .prepare("SELECT payload FROM records WHERE id=?")
          .get(record.id).payload,
      ).done,
      true,
    );
    reopened.close();
    assert.equal(
      (await call(a, "/api/data", { action: "delete", record }, cookie)).status,
      200,
    );
    data = await (await call(a, "/api/data", undefined, cookie)).json();
    assert.equal(data.records.length, 0);
    assert.equal(
      (await call(a, "/api/connection", { action: "test" }, cookie)).status,
      428,
    );
    assert.equal((await call(a, "/logout", undefined, cookie)).status, 302);
  } finally {
    await a.stop();
  }
});

test("login limits stop repeated password guessing", async () => {
  const a = await open();
  try {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await call(a, "/api/login", { password: "wrong" })).status,
        401,
      );
    assert.equal(
      (await call(a, "/api/login", { password: PASSWORD })).status,
      429,
    );
  } finally {
    await a.stop();
  }
});

test("encrypted saved credentials, real request shapes, profile context, transient transcription, disconnect", async () => {
  const calls = [];
  const a = await open({
    localTranscribe: async () => "Call the restaurant owner tomorrow.",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("/models/"))
        return Response.json({ id: "gpt-4.1-mini" });
      if (url.endsWith("/audio/transcriptions"))
        return Response.json({ text: "Call the restaurant owner tomorrow." });
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  reply: "Test with a small batch before committing.",
                  steps: ["Make two sample cups"],
                }),
              },
            ],
          },
        ],
      });
    },
  });
  try {
    const cookie = await login(a);
    assert.equal(
      (
        await call(
          a,
          "/api/connection",
          { action: "connect", key: FAKE_KEY },
          cookie,
        )
      ).status,
      200,
    );
    const encrypted = a.db
      .prepare("SELECT api_key FROM settings WHERE id=1")
      .get().api_key;
    assert.ok(encrypted);
    assert.equal(encrypted.includes(FAKE_KEY), false);
    const data = await (await call(a, "/api/data", undefined, cookie)).json();
    assert.equal(data.connected, true);
    assert.equal(JSON.stringify(data).includes(FAKE_KEY), false);
    await call(
      a,
      "/api/data",
      {
        action: "profile",
        profile: "My budget is limited; this is a side project.",
      },
      cookie,
    );
    const record = entry("idea");
    await call(a, "/api/data", { action: "save", record }, cookie);
    const ai = await call(
      a,
      "/api/ai",
      { action: "discuss", id: record.id, message: "How should I test this?" },
      cookie,
    );
    assert.equal(ai.status, 200);
    assert.deepEqual((await ai.json()).steps, ["Make two sample cups"]);
    const upstream = calls.find((c) => c.url.endsWith("/responses"));
    const sent = JSON.parse(upstream.init.body);
    assert.equal(sent.store, false);
    assert.match(sent.input, /budget is limited/);
    assert.equal(
      upstream.init.headers.get("Authorization"),
      "Bearer " + FAKE_KEY,
    );
    const form = new FormData();
    form.set(
      "file",
      new Blob(["fake-audio-test"], { type: "audio/webm" }),
      "test.webm",
    );
    const transcript = await fetch(a.base + "/api/transcribe", {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    assert.equal(transcript.status, 200);
    assert.equal(
      (await transcript.json()).text,
      "Call the restaurant owner tomorrow.",
    );
    const tables = a.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((x) => x.name);
    assert.deepEqual(tables.sort(), ["records", "settings"]);
    assert.equal(a.db.prepare("SELECT COUNT(*) AS n FROM records").get().n, 1);

    assert.equal(
      (await call(a, "/api/connection", { action: "disconnect" }, cookie))
        .status,
      200,
    );
    assert.equal(
      a.db.prepare("SELECT api_key FROM settings WHERE id=1").get().api_key,
      null,
    );
  } finally {
    await a.stop();
  }
});

test("environment key stays server-side; provider errors never echo credentials", async () => {
  const a = await open({
    apiKey: FAKE_KEY,
    fetchImpl: async () =>
      Response.json(
        { error: { message: "bad key " + FAKE_KEY } },
        { status: 401 },
      ),
  });
  try {
    const cookie = await login(a);
    assert.equal(
      (await (await call(a, "/api/data", undefined, cookie)).json()).connected,
      true,
    );
    const r = await call(a, "/api/connection", { action: "test" }, cookie);
    assert.equal(r.status, 400);
    assert.equal((await r.text()).includes(FAKE_KEY), false);
    assert.equal(
      (await call(a, "/api/connection", { action: "disconnect" }, cookie))
        .status,
      400,
    );
  } finally {
    await a.stop();
  }
});

test("invalid model output keeps the original and no changes are committed by AI", async () => {
  const a = await open({
    apiKey: FAKE_KEY,
    fetchImpl: async () =>
      Response.json({
        output: [{ content: [{ type: "output_text", text: "not JSON" }] }],
      }),
  });
  try {
    const cookie = await login(a);
    const record = entry("idea");
    await call(a, "/api/data", { action: "save", record }, cookie);
    assert.equal(
      (await call(a, "/api/ai", { action: "organize", id: record.id }, cookie))
        .status,
      502,
    );
    assert.deepEqual(
      JSON.parse(
        a.db.prepare("SELECT payload FROM records WHERE id=?").get(record.id)
          .payload,
      ),
      record,
    );
  } finally {
    await a.stop();
  }
});

test("Aion text uses its own credentials and local speech readiness is reported", async () => {
  const calls = [];
  const a = await open({
    provider: "aion",
    apiKey: "aion-test-only-fixture-key",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/chat/completions"))
        return Response.json({ choices: [{ message: { content: "OK" } }] });
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text:
                  "```json\n" +
                  JSON.stringify({
                    title: "Test the idea",
                    body: "Make a small sample.",
                  }) +
                  "\n```",
              },
            ],
          },
        ],
      });
    },
  });
  try {
    const cookie = await login(a);
    const data = await (await call(a, "/api/data", undefined, cookie)).json();
    assert.equal(data.provider, "aion");
    assert.equal(data.connected, true);
    assert.equal(data.voiceAvailable, false);
    assert.equal(
      (await call(a, "/api/connection", { action: "test" }, cookie)).status,
      200,
    );
    assert.equal(calls[0].url, "https://api.aionlabs.ai/v1/chat/completions");
    const r = entry("idea");
    await call(a, "/api/data", { action: "save", record: r }, cookie);
    const result = await call(
      a,
      "/api/ai",
      { action: "organize", id: r.id },
      cookie,
    );
    assert.equal(result.status, 200);
    assert.equal((await result.json()).title, "Test the idea");
    const upstream = calls.find((c) => c.url.endsWith("/responses"));
    assert.equal(upstream.url, "https://api.aionlabs.ai/v1/responses");
    const payload = JSON.parse(upstream.init.body);
    assert.equal(payload.model, "aion-labs/aion-3.5-mini");
    assert.equal(payload.input[0].role, "system");
    assert.equal(payload.store, undefined);
    assert.equal(payload.text, undefined);
    assert.equal(payload.reasoning_effort, "low");
    const speech = await fetch(a.base + "/api/transcribe", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(speech.status, 400);
    assert.equal(
      calls.some((c) => c.url.includes("api.openai.com")),
      false,
    );
  } finally {
    await a.stop();
  }
});

test("provider change never forwards a saved OpenAI credential to Aion", async () => {
  let calls = 0;
  const a = await open({
    provider: "aion",
    apiKey: "",
    fetchImpl: async () => {
      calls++;
      return Response.json({});
    },
  });
  try {
    const cookie = await login(a);
    a.db
      .prepare(
        "UPDATE settings SET api_key='old-encrypted-openai-credential',api_provider='openai' WHERE id=1",
      )
      .run();
    assert.equal(
      (await (await call(a, "/api/data", undefined, cookie)).json()).connected,
      false,
    );
    assert.equal(
      (await call(a, "/api/connection", { action: "test" }, cookie)).status,
      428,
    );
    assert.equal(calls, 0);
  } finally {
    await a.stop();
  }
});

test('local voice works without an Aion or OpenAI key and makes no provider request',async()=>{let calls=0;const a=await open({provider:'aion',apiKey:'',localTranscribe:async bytes=>{assert.equal(bytes.toString(),'local-audio-fixture');return 'Remember the appointment.';},fetchImpl:async()=>{calls++;throw new Error('Must not contact an AI provider for speech');}});try{const cookie=await login(a);const state=await(await call(a,'/api/data',undefined,cookie)).json();assert.equal(state.connected,false);assert.equal(state.voiceAvailable,true);const form=new FormData();form.set('file',new Blob(['local-audio-fixture'],{type:'audio/wav'}),'recording.wav');const r=await fetch(a.base+'/api/transcribe',{method:'POST',headers:{Cookie:cookie},body:form});assert.equal(r.status,200);assert.equal((await r.json()).text,'Remember the appointment.');assert.equal(calls,0);}finally{await a.stop();}});

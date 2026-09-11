const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const consultationHandler = require("../api/consultation");

process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
process.env.TELEGRAM_BOT_TOKEN = "123456:test-token";
process.env.TELEGRAM_CHAT_ID = "-1001234567890";
process.env.SUPABASE_STORAGE_BUCKET = "consultation-files";
process.env.RATE_LIMIT_SECRET = "test-rate-limit-secret";
delete process.env.RESEND_API_KEY;
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.TURNSTILE_REQUIRED;

const fetchCalls = [];
global.fetch = async (url, options = {}) => {
  fetchCalls.push({ url: String(url), method: options.method });
  if (String(url).includes("/rpc/consume_consultation_rate_limit")) return { ok: true, status: 200, json: async () => true };
  if (String(url).includes("idempotency_key=eq.")) return { ok: true, status: 200, json: async () => [] };
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

function multipartBody(fields, file) {
  const boundary = "----AplusScholarBoundary";
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="brief-file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(chunks) };
}

async function submit(fields, file) {
  const payload = multipartBody(fields, file);
  const request = Readable.from(payload.body);
  request.method = "POST";
  request.headers = {
    origin: "https://aplus-scholar.vercel.app",
    "content-type": `multipart/form-data; boundary=${payload.boundary}`
  };
  const response = {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; }
  };
  await consultationHandler(request, response);
  return response;
}

const baseFields = {
  name: "Nguyen An",
  contactMethod: "email",
  email: "an@example.com",
  phone: "",
  contactTime: "",
  need: "Hỗ trợ học thuật",
  message: "Cần trao đổi đề cương",
  consent: "on",
  website: ""
};

(async () => {
  fetchCalls.length = 0;
  const validContact = await submit(baseFields);
  assert.equal(validContact.statusCode, 200, "Valid multipart request should be accepted");
  assert.ok(fetchCalls.some((call) => call.url.includes("/rest/v1/consultation_requests")), "Accepted request should be saved");
  assert.ok(fetchCalls.some((call) => call.url.includes("api.telegram.org")), "Accepted request should notify Telegram");

  const missingPhone = await submit({ ...baseFields, contactMethod: "phone", email: "" });
  assert.equal(missingPhone.statusCode, 400, "Phone channel requires a valid phone number");

  const spoofedPdf = await submit(baseFields, {
    name: "brief.pdf",
    type: "application/pdf",
    content: Buffer.from("plain text")
  });
  assert.equal(spoofedPdf.statusCode, 400, "Spoofed PDF must be rejected by signature validation");

  const signedPdf = await submit(baseFields, {
    name: "brief.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4\n%%EOF")
  });
  assert.equal(signedPdf.statusCode, 200, "Signed PDF should pass validation and be accepted");
  assert.ok(fetchCalls.some((call) => call.url.includes("/storage/v1/object/consultation-files/")), "Accepted files should be uploaded to private Storage");

  fetchCalls.length = 0;
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), method: options.method });
    if (String(url).includes("/rpc/consume_consultation_rate_limit")) return { ok: true, status: 200, json: async () => true };
    if (String(url).includes("idempotency_key=eq.")) return { ok: true, status: 200, json: async () => [] };
    if (String(url).includes("api.telegram.org")) return { ok: false, status: 503, json: async () => ({ description: "Unavailable" }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const unavailableTelegram = await submit(baseFields);
  assert.equal(unavailableTelegram.statusCode, 200, "Notification failure must not make an already-saved request fail");

  fetchCalls.length = 0;
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), method: options.method });
    return { ok: false, status: 503, json: async () => ({ message: "Project is paused" }) };
  };
  const pausedDatabase = await submit(baseFields);
  assert.equal(pausedDatabase.statusCode, 503, "Unavailable rate protection should return a safe retryable form error");
  assert.ok(!fetchCalls.some((call) => call.url.includes("api.telegram.org")), "Telegram is not reached when storage fails first");

  console.log("consultation multipart tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

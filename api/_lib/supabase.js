const { createHmac, randomUUID } = require("node:crypto");

function cleanText(value, maximumLength) {
  return String(value || "").trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maximumLength);
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function getStorageBucket() {
  return cleanText(process.env.SUPABASE_STORAGE_BUCKET, 63).replace(/[^a-z0-9-_]/gi, "");
}

function getHeaders(config, extra = {}) {
  return { apikey: config.key, Authorization: `Bearer ${config.key}`, ...extra };
}

async function supabaseRequest(path, options = {}) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: getHeaders(config, options.headers)
  });
  if (!response.ok) {
    let detail = "unknown error";
    try {
      const payload = await response.json();
      detail = cleanText(payload.message || payload.hint || payload.code || detail, 180);
    } catch {}
    throw new Error(`SUPABASE_REQUEST_FAILED: ${response.status} ${detail}`);
  }
  return response;
}

async function getExistingRequest(idempotencyKey) {
  const response = await supabaseRequest(`/rest/v1/consultation_requests?select=request_id&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`);
  const records = await response.json();
  return records[0] || null;
}

async function insertRequest(record) {
  await supabaseRequest("/rest/v1/consultation_requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(record)
  });
}

async function updateRequest(requestId, changes) {
  await supabaseRequest(`/rest/v1/consultation_requests?request_id=eq.${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() })
  });
}

async function selectRequests(query) {
  const response = await supabaseRequest(`/rest/v1/consultation_requests?${query}`);
  return response.json();
}

function encodeStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

async function uploadPrivateFile({ path, buffer, contentType }) {
  const bucket = getStorageBucket();
  if (!bucket) throw new Error("PRIVATE_STORAGE_NOT_CONFIGURED");
  await supabaseRequest(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": contentType || "application/octet-stream", "x-upsert": "false" },
    body: buffer
  });
  return bucket;
}

async function deletePrivateFile(bucket, path) {
  if (!bucket || !path) return;
  await supabaseRequest(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, { method: "DELETE" });
}

async function insertLifecycleEvent({ requestId = null, eventType, actor = "system", metadata = {} }) {
  try {
    await supabaseRequest("/rest/v1/data_lifecycle_events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ request_id: requestId, event_type: eventType, actor, metadata })
    });
  } catch (error) {
    console.warn("[privacy] Unable to write lifecycle event", { eventType, requestId, error: cleanText(error.message, 180) });
  }
}

function getClientIp(request) {
  return cleanText(String(request.headers["x-forwarded-for"] || "").split(",")[0] || request.socket?.remoteAddress || "unknown", 80);
}

function rateLimitKey(request, scope) {
  const secret = process.env.RATE_LIMIT_SECRET || "aplus-scholar-rate-limit-v1";
  return createHmac("sha256", secret).update(`${scope}:${getClientIp(request)}`).digest("hex");
}

async function consumeRateLimit(request, scope, maximumAttempts, windowSeconds) {
  const response = await supabaseRequest("/rest/v1/rpc/consume_consultation_rate_limit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_key: rateLimitKey(request, scope),
      p_limit: maximumAttempts,
      p_window_seconds: windowSeconds
    })
  });
  return Boolean(await response.json());
}

async function verifyTurnstile(token, request) {
  const secret = cleanText(process.env.TURNSTILE_SECRET_KEY, 200);
  const required = String(process.env.TURNSTILE_REQUIRED || "").toLowerCase() === "true";
  if (!secret) {
    if (required) throw new Error("TURNSTILE_NOT_CONFIGURED");
    return true;
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: getClientIp(request) });
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!result.ok) throw new Error("TURNSTILE_VERIFY_FAILED");
  const payload = await result.json();
  return payload.success === true;
}

function newRequestId() {
  return `AP-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = {
  addDays,
  cleanText,
  consumeRateLimit,
  deletePrivateFile,
  getStorageBucket,
  getSupabaseConfig,
  getClientIp,
  getExistingRequest,
  insertLifecycleEvent,
  insertRequest,
  newRequestId,
  selectRequests,
  supabaseRequest,
  updateRequest,
  uploadPrivateFile,
  verifyTurnstile
};

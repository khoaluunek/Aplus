const Busboy = require("busboy");
const { randomUUID } = require("node:crypto");
const {
  addDays,
  cleanText,
  consumeRateLimit,
  deletePrivateFile,
  getExistingRequest,
  getStorageBucket,
  insertLifecycleEvent,
  insertRequest,
  newRequestId,
  uploadPrivateFile,
  verifyTurnstile
} = require("./_lib/supabase");
const { deliverNotifications } = require("./_lib/notifications");

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const CONSENT_VERSION = "2026-09-11";
const allowedFileTypes = new Map([
  ["pdf", new Set(["application/pdf", "application/octet-stream"])],
  ["doc", new Set(["application/msword", "application/octet-stream"])],
  ["docx", new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"])]
]);

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(payload);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "aplus-scholar.vercel.app"
      || (hostname.startsWith("aplus-scholar-") && hostname.endsWith("-khoaluunek.vercel.app"));
  } catch {
    return false;
  }
}

function normalizeVietnamPhone(value) {
  let phone = cleanText(value, 32).replace(/[\s().-]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84") && phone.length === 11) phone = `0${phone.slice(2)}`;
  return phone;
}

function hasSignature(buffer, extension) {
  if (extension === "pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === "doc") return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (extension === "docx") {
    const signature = buffer.subarray(0, 4);
    return signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      || signature.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
      || signature.equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
  }
  return false;
}

function parseMultipartRequest(request) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: request.headers,
        limits: { fieldNameSize: 80, fieldSize: 4000, fields: 16, fileSize: MAX_FILE_SIZE, files: 1, parts: 17 }
      });
    } catch {
      reject(new Error("INVALID_MULTIPART"));
      return;
    }
    const fields = {};
    let attachment = null;
    let uploadError = "";
    parser.on("field", (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated) uploadError = "INVALID_FIELDS";
      fields[name] = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "brief-file" || !info.filename) {
        stream.resume();
        return;
      }
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("limit", () => { uploadError = "FILE_TOO_LARGE"; });
      stream.on("end", () => {
        if (stream.truncated) uploadError = "FILE_TOO_LARGE";
        attachment = {
          name: cleanText(info.filename, 140).replace(/[\\/]/g, "-"),
          type: cleanText(info.mimeType, 120).toLowerCase(),
          buffer: Buffer.concat(chunks)
        };
      });
    });
    parser.on("filesLimit", () => { uploadError = "TOO_MANY_FILES"; });
    parser.on("partsLimit", () => { uploadError = "TOO_MANY_PARTS"; });
    parser.on("error", () => reject(new Error("INVALID_MULTIPART")));
    parser.on("close", () => resolve({ fields, attachment, uploadError }));
    request.pipe(parser);
  });
}

function validIdempotencyKey(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function consultationHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { message: "Phương thức không được hỗ trợ." });
  }
  if (!isAllowedOrigin(request.headers.origin)) return sendJson(response, 403, { message: "Nguồn gửi yêu cầu không hợp lệ." });
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("multipart/form-data")) {
    return sendJson(response, 415, { message: "Biểu mẫu cần được gửi theo định dạng multipart/form-data." });
  }

  let parsed;
  try { parsed = await parseMultipartRequest(request); }
  catch { return sendJson(response, 400, { message: "Dữ liệu biểu mẫu không hợp lệ." }); }

  const body = parsed.fields;
  if (cleanText(body.website, 200)) return sendJson(response, 200, { requestId: newRequestId(), accepted: true });
  if (parsed.uploadError) {
    return sendJson(response, 400, { message: parsed.uploadError === "FILE_TOO_LARGE" ? "Tệp đính kèm vượt quá 3 MB." : "Tệp hoặc dữ liệu biểu mẫu không hợp lệ." });
  }

  const name = cleanText(body.name, 100);
  const phone = normalizeVietnamPhone(body.phone);
  const email = cleanText(body.email, 160).toLowerCase();
  const contactMethod = cleanText(body.contactMethod, 20);
  const contactTime = cleanText(body.contactTime, 80);
  const need = cleanText(body.need, 120);
  const message = cleanText(body.message, 4000);
  const consent = cleanText(body.consent, 20);
  const idempotencyKey = validIdempotencyKey(cleanText(body.idempotencyKey, 50)) ? cleanText(body.idempotencyKey, 50) : randomUUID();
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = !phone || /^0\d{9}$/.test(phone);
  const validContactMethod = ["phone", "zalo", "email"].includes(contactMethod);
  const hasSelectedContact = contactMethod === "email" ? Boolean(email) : Boolean(phone);
  if (!name || !need || !["on", "true"].includes(consent) || !validContactMethod || !hasSelectedContact || !validEmail || !validPhone) {
    return sendJson(response, 400, { message: "Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại." });
  }
  try {
    const turnstileValid = await verifyTurnstile(cleanText(body.turnstileToken, 4096), request);
    if (!turnstileValid) return sendJson(response, 403, { message: "Không thể xác minh biểu mẫu. Vui lòng thử lại hoặc liên hệ qua Zalo." });
  } catch (error) {
    console.error("[consultation] Turnstile unavailable", { error: cleanText(error.message, 160) });
    return sendJson(response, 503, { message: "Hệ thống xác minh đang bận. Vui lòng thử lại sau ít phút." });
  }
  if (parsed.attachment && !getStorageBucket()) {
    return sendJson(response, 503, { message: "Tính năng tải tệp đang tạm đóng để bảo đảm lưu trữ riêng tư. Vui lòng gửi yêu cầu không kèm tệp hoặc liên hệ qua Zalo/email." });
  }

  try {
    const allowed = await consumeRateLimit(request, "consultation", 5, 60 * 60);
    if (!allowed) return sendJson(response, 429, { message: "Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 giờ hoặc liên hệ qua Zalo." });
  } catch (error) {
    console.error("[consultation] Rate limit unavailable", { error: cleanText(error.message, 160) });
    return sendJson(response, 503, { message: "Hệ thống tiếp nhận đang được bảo vệ. Vui lòng thử lại sau ít phút." });
  }

  try {
    const existing = await getExistingRequest(idempotencyKey);
    if (existing) return sendJson(response, 200, { requestId: existing.request_id, accepted: true, duplicate: true });
  } catch (error) {
    console.error("[consultation] Unable to check idempotency", { error: cleanText(error.message, 160) });
    return sendJson(response, 502, { message: "Không thể xác nhận yêu cầu lúc này. Vui lòng thử lại sau ít phút." });
  }

  let attachment = null;
  if (parsed.attachment) {
    const extensionMatch = parsed.attachment.name.match(/\.([a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
    const acceptedMimeTypes = allowedFileTypes.get(extension);
    if (!acceptedMimeTypes || !acceptedMimeTypes.has(parsed.attachment.type) || !hasSignature(parsed.attachment.buffer, extension)) {
      return sendJson(response, 400, { message: "Tệp không khớp định dạng PDF, DOC hoặc DOCX được hỗ trợ." });
    }
    attachment = { ...parsed.attachment, extension };
  }

  const requestId = newRequestId();
  const receivedAt = new Date();
  let attachmentBucket = null;
  let attachmentPath = null;
  if (attachment) {
    attachmentPath = `consultations/${receivedAt.getUTCFullYear()}/${requestId}.${attachment.extension}`;
    try {
      attachmentBucket = await uploadPrivateFile({ path: attachmentPath, buffer: attachment.buffer, contentType: attachment.type });
    } catch (error) {
      console.error("[consultation] Private upload failed", { requestId, error: cleanText(error.message, 160) });
      return sendJson(response, 503, { message: "Không thể lưu tệp riêng tư lúc này. Yêu cầu chưa được gửi; vui lòng thử lại sau hoặc gửi không kèm tệp." });
    }
  }

  const record = {
    request_id: requestId,
    idempotency_key: idempotencyKey,
    name,
    phone: phone || null,
    email: email || null,
    contact_method: contactMethod,
    contact_time: contactTime || null,
    need,
    message: message || null,
    attachment_name: attachment?.name || null,
    attachment_size: attachment?.buffer.length || null,
    attachment_bucket: attachmentBucket,
    attachment_path: attachmentPath,
    attachment_retention_until: attachment ? addDays(receivedAt, 30) : null,
    consent_at: receivedAt.toISOString(),
    consent_version: CONSENT_VERSION,
    retention_until: addDays(receivedAt, 30),
    status: "received",
    telegram_status: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "pending" : "not_configured",
    email_status: process.env.RESEND_API_KEY ? "pending" : "not_configured",
    notification_attempts: { telegram: 0, email: 0 }
  };
  try {
    await insertRequest(record);
  } catch (error) {
    if (attachmentBucket && attachmentPath) await deletePrivateFile(attachmentBucket, attachmentPath).catch(() => {});
    try {
      const existing = await getExistingRequest(idempotencyKey);
      if (existing) return sendJson(response, 200, { requestId: existing.request_id, accepted: true, duplicate: true });
    } catch {}
    console.error("[consultation] Supabase insert failed", { requestId, error: cleanText(error.message, 180) });
    return sendJson(response, 502, { message: "Không thể lưu yêu cầu lúc này. Vui lòng thử lại sau ít phút." });
  }

  await insertLifecycleEvent({ requestId, eventType: "request_received", metadata: { hasAttachment: Boolean(attachment), consentVersion: CONSENT_VERSION } });
  await deliverNotifications(record);
  return sendJson(response, 200, { requestId, accepted: true, receivedAt: receivedAt.toISOString() });
}

module.exports = consultationHandler;
module.exports.config = { api: { bodyParser: false } };

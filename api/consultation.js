const Busboy = require("busboy");
const { randomUUID } = require("node:crypto");

const MAX_FILE_SIZE = 3 * 1024 * 1024;
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

function cleanText(value, maximumLength) {
  return String(value || "").trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maximumLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]);
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
        limits: { fieldNameSize: 80, fieldSize: 4000, fields: 12, fileSize: MAX_FILE_SIZE, files: 1, parts: 13 }
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

async function consultationHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { message: "Phương thức không được hỗ trợ." });
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    return sendJson(response, 403, { message: "Nguồn gửi yêu cầu không hợp lệ." });
  }

  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("multipart/form-data")) {
    return sendJson(response, 415, { message: "Biểu mẫu cần được gửi theo định dạng multipart/form-data." });
  }

  let parsed;
  try {
    parsed = await parseMultipartRequest(request);
  } catch {
    return sendJson(response, 400, { message: "Dữ liệu biểu mẫu không hợp lệ." });
  }

  const body = parsed.fields;
  if (cleanText(body.website, 200)) {
    return sendJson(response, 200, { requestId: `AP-${randomUUID().slice(0, 8).toUpperCase()}` });
  }
  if (parsed.uploadError) {
    return sendJson(response, 400, { message: parsed.uploadError === "FILE_TOO_LARGE" ? "Tệp đính kèm vượt quá 3 MB." : "Tệp hoặc dữ liệu biểu mẫu không hợp lệ." });
  }

  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 20).replace(/\s/g, "");
  const email = cleanText(body.email, 160);
  const contactMethod = cleanText(body.contactMethod, 20);
  const contactTime = cleanText(body.contactTime, 80);
  const need = cleanText(body.need, 120);
  const message = cleanText(body.message, 4000);
  const consent = cleanText(body.consent, 20);
  const validEmail = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = !phone || /^0\d{9}$/.test(phone);
  const validContactMethod = ["phone", "zalo", "email"].includes(contactMethod);
  const hasSelectedContact = contactMethod === "email" ? Boolean(email) : Boolean(phone);

  if (!name || !need || !consent || !validContactMethod || !hasSelectedContact || !validEmail || !validPhone) {
    return sendJson(response, 400, { message: "Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại." });
  }

  let emailAttachment;
  if (parsed.attachment) {
    const extensionMatch = parsed.attachment.name.match(/\.([a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
    const acceptedMimeTypes = allowedFileTypes.get(extension);
    if (!acceptedMimeTypes || !acceptedMimeTypes.has(parsed.attachment.type) || !hasSignature(parsed.attachment.buffer, extension)) {
      return sendJson(response, 400, { message: "Tệp không khớp định dạng PDF, DOC hoặc DOCX được hỗ trợ." });
    }
    emailAttachment = { filename: parsed.attachment.name, content: parsed.attachment.buffer.toString("base64") };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const consultationInbox = process.env.CONSULTATION_INBOX || "aplusscholarr@gmail.com";
  const consultationFrom = process.env.CONSULTATION_FROM || "Aplus Scholar <onboarding@resend.dev>";
  if (!resendApiKey) {
    return sendJson(response, 503, { message: "Kênh gửi trực tiếp đang được cấu hình. Vui lòng gửi qua email dự phòng." });
  }

  const requestId = `AP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const contactLabels = { phone: "Gọi điện", zalo: "Zalo", email: "Email" };
  const submittedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const safeMessage = escapeHtml(message || "Chưa cung cấp").replace(/\n/g, "<br />");

  let resendResponse;
  try {
    resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: consultationFrom,
        to: [consultationInbox],
        reply_to: email || undefined,
        subject: `[${requestId}] Yêu cầu tư vấn: ${need}`,
        html: `<h2>Yêu cầu tư vấn mới ${requestId}</h2><p><strong>Họ tên:</strong> ${escapeHtml(name)}</p><p><strong>Kênh phản hồi:</strong> ${contactLabels[contactMethod]}</p><p><strong>Số điện thoại:</strong> ${escapeHtml(phone || "Không cung cấp")}</p><p><strong>Email:</strong> ${escapeHtml(email || "Không cung cấp")}</p><p><strong>Khung giờ:</strong> ${escapeHtml(contactTime || "Không yêu cầu")}</p><p><strong>Nhu cầu:</strong> ${escapeHtml(need)}</p><p><strong>Thời gian gửi:</strong> ${escapeHtml(submittedAt)}</p><hr /><p><strong>Nội dung trao đổi</strong></p><p>${safeMessage}</p>`,
        attachments: emailAttachment ? [emailAttachment] : undefined
      })
    });
  } catch {
    return sendJson(response, 502, { message: "Kênh gửi thư đang gián đoạn. Vui lòng dùng email dự phòng." });
  }

  if (!resendResponse.ok) {
    return sendJson(response, 502, { message: "Hệ thống gửi thư chưa phản hồi. Vui lòng dùng email dự phòng." });
  }

  return sendJson(response, 200, { requestId, receivedAt: new Date().toISOString() });
}

module.exports = consultationHandler;
module.exports.config = { api: { bodyParser: false } };

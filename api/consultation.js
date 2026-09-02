const { randomUUID } = require("node:crypto");

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const allowedFileTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ""
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

module.exports = async function consultationHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { message: "Phương thức không được hỗ trợ." });
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    return sendJson(response, 403, { message: "Nguồn gửi yêu cầu không hợp lệ." });
  }

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  } catch {
    return sendJson(response, 400, { message: "Dữ liệu gửi lên không hợp lệ." });
  }
  if (cleanText(body.website, 200)) {
    return sendJson(response, 200, { requestId: `AP-${randomUUID().slice(0, 8).toUpperCase()}` });
  }

  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 20).replace(/\s/g, "");
  const email = cleanText(body.email, 160);
  const need = cleanText(body.need, 120);
  const message = cleanText(body.message, 4000);
  const file = body.file && typeof body.file === "object" ? body.file : null;

  if (!name || !/^0\d{9}$/.test(phone) || !need || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return sendJson(response, 400, { message: "Thông tin liên hệ chưa hợp lệ. Vui lòng kiểm tra lại." });
  }

  let attachment;
  if (file) {
    const fileName = cleanText(file.name, 140).replace(/[\\/]/g, "-");
    const fileType = cleanText(file.type, 120);
    const fileSize = Number(file.size || 0);
    const fileContent = String(file.content || "");
    const validExtension = /\.(pdf|doc|docx)$/i.test(fileName);
    const maximumBase64Length = Math.ceil(MAX_FILE_SIZE * 4 / 3) + 8;
    if (!validExtension || !allowedFileTypes.has(fileType) || fileSize <= 0 || fileSize > MAX_FILE_SIZE || !fileContent || fileContent.length > maximumBase64Length) {
      return sendJson(response, 400, { message: "Tệp đính kèm không hợp lệ hoặc vượt quá 3 MB." });
    }
    attachment = { filename: fileName, content: fileContent };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const consultationInbox = process.env.CONSULTATION_INBOX || "aplusscholarr@gmail.com";
  const consultationFrom = process.env.CONSULTATION_FROM || "Aplus Scholar <onboarding@resend.dev>";
  if (!resendApiKey) {
    return sendJson(response, 503, { message: "Kênh gửi trực tiếp đang được cấu hình. Vui lòng gửi qua email dự phòng." });
  }

  const requestId = `AP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const safeName = escapeHtml(name);
  const safePhone = escapeHtml(phone);
  const safeEmail = escapeHtml(email || "Không cung cấp");
  const safeNeed = escapeHtml(need);
  const safeMessage = escapeHtml(message || "Chưa cung cấp").replace(/\n/g, "<br />");
  const submittedAt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

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
        html: `<h2>Yêu cầu tư vấn mới ${requestId}</h2><p><strong>Họ tên:</strong> ${safeName}</p><p><strong>Số điện thoại:</strong> ${safePhone}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Nhu cầu:</strong> ${safeNeed}</p><p><strong>Thời gian:</strong> ${escapeHtml(submittedAt)}</p><hr /><p><strong>Nội dung trao đổi</strong></p><p>${safeMessage}</p>`,
        attachments: attachment ? [attachment] : undefined
      })
    });
  } catch {
    return sendJson(response, 502, { message: "Kênh gửi thư đang gián đoạn. Vui lòng dùng email dự phòng." });
  }

  if (!resendResponse.ok) {
    return sendJson(response, 502, { message: "Hệ thống gửi thư chưa phản hồi. Vui lòng dùng email dự phòng." });
  }

  return sendJson(response, 200, { requestId, receivedAt: new Date().toISOString() });
};

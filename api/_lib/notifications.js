const { cleanText, updateRequest } = require("./supabase");

const contactLabels = { phone: "Gọi điện", zalo: "Zalo", email: "Email" };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]);
}

async function notifyTelegram(record) {
  const token = cleanText(process.env.TELEGRAM_BOT_TOKEN, 200);
  const chatId = cleanText(process.env.TELEGRAM_CHAT_ID, 80);
  if (!token || !chatId) return "not_configured";
  const message = [
    `📩 Yêu cầu tư vấn mới · ${record.request_id}`,
    `Họ tên: ${record.name}`,
    `Kênh phản hồi: ${contactLabels[record.contact_method] || "Chưa xác định"}`,
    "Mở hệ thống tiếp nhận có phân quyền để xem chi tiết."
  ].join("\n");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true })
  });
  if (!response.ok) throw new Error(`TELEGRAM_SEND_FAILED: ${response.status}`);
  return "sent";
}

async function notifyEmail(record) {
  const apiKey = cleanText(process.env.RESEND_API_KEY, 300);
  if (!apiKey) return "not_configured";
  const inbox = cleanText(process.env.CONSULTATION_INBOX || "aplusscholarr@gmail.com", 200);
  const from = cleanText(process.env.CONSULTATION_FROM || "Aplus Scholar <onboarding@resend.dev>", 200);
  const message = escapeHtml(record.message || "Chưa cung cấp").replace(/\n/g, "<br />");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [inbox],
      reply_to: record.email || undefined,
      subject: `[${record.request_id}] Yêu cầu tư vấn: ${record.need}`,
      html: `<h2>Yêu cầu tư vấn ${escapeHtml(record.request_id)}</h2><p><strong>Họ tên:</strong> ${escapeHtml(record.name)}</p><p><strong>Kênh phản hồi:</strong> ${escapeHtml(contactLabels[record.contact_method] || "Chưa xác định")}</p><p><strong>Số điện thoại:</strong> ${escapeHtml(record.phone || "Không cung cấp")}</p><p><strong>Email:</strong> ${escapeHtml(record.email || "Không cung cấp")}</p><p><strong>Khung giờ:</strong> ${escapeHtml(record.contact_time || "Không yêu cầu")}</p><p><strong>Nhu cầu:</strong> ${escapeHtml(record.need)}</p><p><strong>Có tệp riêng tư:</strong> ${record.attachment_path ? "Có — xem bằng liên kết có thời hạn trong kho lưu trữ" : "Không"}</p><hr /><p><strong>Nội dung trao đổi</strong></p><p>${message}</p>`
    })
  });
  if (!response.ok) throw new Error(`RESEND_SEND_FAILED: ${response.status}`);
  return "sent";
}

function attemptCount(record, channel) {
  return Number(record.notification_attempts?.[channel] || 0);
}

async function deliverNotifications(record) {
  const attempts = { ...(record.notification_attempts || {}) };
  const changes = {};
  await Promise.allSettled([
    (async () => {
      if (["sent", "not_configured"].includes(record.telegram_status) || attemptCount(record, "telegram") >= 3) return;
      attempts.telegram = attemptCount(record, "telegram") + 1;
      try { changes.telegram_status = await notifyTelegram(record); }
      catch (error) { changes.telegram_status = `failed:${cleanText(error.message, 120)}`; }
    })(),
    (async () => {
      if (["sent", "not_configured"].includes(record.email_status) || attemptCount(record, "email") >= 3) return;
      attempts.email = attemptCount(record, "email") + 1;
      try { changes.email_status = await notifyEmail(record); }
      catch (error) { changes.email_status = `failed:${cleanText(error.message, 120)}`; }
    })()
  ]);
  if (Object.keys(changes).length) {
    changes.notification_attempts = attempts;
    await updateRequest(record.request_id, changes).catch((error) => {
      console.warn("[consultation] Notification status update failed", { requestId: record.request_id, error: cleanText(error.message, 160) });
    });
  }
  return changes;
}

module.exports = { deliverNotifications, contactLabels };

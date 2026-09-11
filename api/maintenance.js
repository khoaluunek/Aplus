const {
  cleanText,
  deletePrivateFile,
  insertLifecycleEvent,
  selectRequests,
  updateRequest
} = require("./_lib/supabase");
const { deliverNotifications } = require("./_lib/notifications");

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(payload);
}

function isAuthorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) && request.headers.authorization === `Bearer ${secret}`;
}

async function removeExpiredAttachment(record, now) {
  if (!record.attachment_path || record.attachment_deleted_at) return false;
  await deletePrivateFile(record.attachment_bucket, record.attachment_path);
  await updateRequest(record.request_id, {
    attachment_name: null,
    attachment_size: null,
    attachment_path: null,
    attachment_bucket: null,
    attachment_deleted_at: now
  });
  await insertLifecycleEvent({ requestId: record.request_id, eventType: "attachment_deleted", metadata: { reason: "retention_expired" } });
  return true;
}

module.exports = async function maintenanceHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { message: "Phương thức không được hỗ trợ." });
  }
  if (!isAuthorized(request)) return sendJson(response, 401, { message: "Không được phép." });
  const now = new Date().toISOString();
  const beforeNow = encodeURIComponent(now);
  const result = { attachmentsDeleted: 0, requestsDeleted: 0, notificationsRetried: 0, failures: [] };
  try {
    const expiringAttachments = await selectRequests(`select=request_id,attachment_bucket,attachment_path,attachment_deleted_at&attachment_path=not.is.null&attachment_deleted_at=is.null&attachment_retention_until=lte.${beforeNow}&limit=100`);
    for (const record of expiringAttachments) {
      try { if (await removeExpiredAttachment(record, now)) result.attachmentsDeleted += 1; }
      catch (error) { result.failures.push({ requestId: record.request_id, step: "attachment", error: cleanText(error.message, 120) }); }
    }

    const expiringRequests = await selectRequests(`select=request_id,attachment_bucket,attachment_path,attachment_deleted_at&deleted_at=is.null&retention_until=lte.${beforeNow}&limit=100`);
    for (const record of expiringRequests) {
      try {
        await removeExpiredAttachment(record, now);
        await updateRequest(record.request_id, {
          name: null,
          phone: null,
          email: null,
          contact_time: null,
          need: null,
          message: null,
          status: "deleted",
          deleted_at: now
        });
        await insertLifecycleEvent({ requestId: record.request_id, eventType: "request_deleted", metadata: { reason: "retention_expired" } });
        result.requestsDeleted += 1;
      } catch (error) { result.failures.push({ requestId: record.request_id, step: "request", error: cleanText(error.message, 120) }); }
    }

    const queuedNotifications = await selectRequests("select=request_id,name,phone,email,contact_method,contact_time,need,message,attachment_path,telegram_status,email_status,notification_attempts&deleted_at=is.null&status=eq.received&limit=100&order=created_at.asc");
    for (const record of queuedNotifications) {
      const telegramAttempts = Number(record.notification_attempts?.telegram || 0);
      const emailAttempts = Number(record.notification_attempts?.email || 0);
      if ((["sent", "not_configured"].includes(record.telegram_status) || telegramAttempts >= 3) && (["sent", "not_configured"].includes(record.email_status) || emailAttempts >= 3)) continue;
      await deliverNotifications(record);
      result.notificationsRetried += 1;
    }
  } catch (error) {
    console.error("[maintenance] Run failed", { error: cleanText(error.message, 180) });
    return sendJson(response, 502, { ...result, message: "Tác vụ bảo trì chưa hoàn tất." });
  }
  if (result.failures.length) console.warn("[maintenance] Partial failures", result.failures);
  return sendJson(response, result.failures.length ? 207 : 200, result);
};

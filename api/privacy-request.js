const {
  cleanText,
  consumeRateLimit,
  insertLifecycleEvent,
  newRequestId,
  supabaseRequest
} = require("./_lib/supabase");

function sendJson(response, status, payload) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(payload);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "aplus-scholar.vercel.app";
  } catch { return false; }
}

module.exports = async function privacyRequestHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { message: "Phương thức không được hỗ trợ." });
  }
  if (!isAllowedOrigin(request.headers.origin)) return sendJson(response, 403, { message: "Nguồn gửi yêu cầu không hợp lệ." });
  const body = typeof request.body === "object" && request.body ? request.body : {};
  if (cleanText(body.website, 200)) return sendJson(response, 200, { requestId: `DR-${newRequestId().slice(3)}` });
  const name = cleanText(body.name, 100);
  const email = cleanText(body.email, 160).toLowerCase();
  const requestType = cleanText(body.requestType, 20);
  const consultationRequestId = cleanText(body.consultationRequestId, 20).toUpperCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["access", "rectify", "delete"].includes(requestType)) {
    return sendJson(response, 400, { message: "Vui lòng điền họ tên, email hợp lệ và loại yêu cầu." });
  }
  try {
    const allowed = await consumeRateLimit(request, "privacy", 3, 60 * 60);
    if (!allowed) return sendJson(response, 429, { message: "Bạn đã gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 giờ." });
  } catch {
    return sendJson(response, 503, { message: "Hệ thống tiếp nhận yêu cầu dữ liệu đang bận. Vui lòng gửi email tới aplusscholarr@gmail.com." });
  }
  const requestId = `DR-${newRequestId().slice(3)}`;
  try {
    await supabaseRequest("/rest/v1/consultation_data_requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        request_id: requestId,
        name,
        email,
        request_type: requestType,
        consultation_request_id: consultationRequestId || null,
        status: "received"
      })
    });
    await insertLifecycleEvent({ eventType: "privacy_request_received", actor: "data_subject", metadata: { dataRequestId: requestId, requestType } });
  } catch (error) {
    console.error("[privacy] Unable to save request", { error: cleanText(error.message, 160) });
    return sendJson(response, 502, { message: "Không thể ghi nhận yêu cầu lúc này. Vui lòng gửi email tới aplusscholarr@gmail.com." });
  }
  return sendJson(response, 200, { requestId, message: "Yêu cầu đã được ghi nhận. Aplus Scholar sẽ xác minh danh tính trước khi xử lý." });
};

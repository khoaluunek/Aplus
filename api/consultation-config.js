const { getStorageBucket } = require("./_lib/supabase");

module.exports = function consultationConfig(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ message: "Phương thức không được hỗ trợ." });
  }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.status(200).json({
    uploadsEnabled: Boolean(getStorageBucket()),
    turnstileSiteKey: String(process.env.TURNSTILE_SITE_KEY || "").trim(),
    turnstileRequired: String(process.env.TURNSTILE_REQUIRED || "").toLowerCase() === "true"
  });
};

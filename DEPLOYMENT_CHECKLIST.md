# Checklist triển khai an toàn

1. Chạy migration `supabase/migrations/20260911000000_privacy_hardening.sql` trong Supabase SQL Editor (hoặc `supabase db push`). Migration tạo bucket `consultation-files` ở chế độ private, bảng thời hạn lưu, log vòng đời, nhật ký yêu cầu dữ liệu và rate limit nguyên tử.
2. Trong Vercel, khai báo toàn bộ biến trong `.env.example`. Dùng `SUPABASE_SECRET_KEY`/service role chỉ ở Vercel Functions, không đưa vào HTML hoặc trình duyệt.
3. Tạo Cloudflare Turnstile cho hai domain `aplus-scholar.vercel.app` và domain production chính thức. Điền site key/secret, giữ `TURNSTILE_REQUIRED=true`, rồi thử gửi form.
4. Xác minh cron `/api/maintenance` chạy mỗi ngày lúc 02:00 UTC (09:00 giờ Việt Nam). Vercel tự gửi `Authorization: Bearer CRON_SECRET`; không gọi URL này từ trình duyệt.
5. Khi một yêu cầu trở thành dịch vụ đã xác nhận, nhân sự có quyền cập nhật `status`, `retention_until` (tối đa 12 tháng từ lần trao đổi cuối) và `attachment_retention_until` (tối đa 90 ngày sau hoàn tất). Không thay đổi các mốc này nếu không có cơ sở hợp lệ.
6. Tạo cảnh báo Vercel cho lỗi Function/cron và kiểm tra các bản ghi có `telegram_status` hoặc `email_status` bắt đầu bằng `failed:`. Cron thử lại tối đa ba lần; tệp chưa bao giờ được gửi vào Telegram hoặc Resend.

Không cấp quyền đọc Storage cho `anon` hoặc `authenticated`. Chỉ tạo signed URL ở một Function có xác thực dành cho nhân sự khi thực sự cần xem tệp.

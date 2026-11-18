# Cài FCMS PRO PWA

## Android Chrome

1. Mở domain Cloudflare Pages bằng HTTPS.
2. Đăng nhập.
3. Chọn menu ⋮ → Install app/Add to Home screen.
4. Mở app từ biểu tượng và kiểm tra refresh/session.

## iPhone Safari

1. Mở domain bằng Safari.
2. Chọn Share → Add to Home Screen.
3. Mở từ Home Screen.

## Windows Edge/Chrome

Chọn biểu tượng Install ở thanh địa chỉ hoặc menu → Apps → Install FCMS PRO.

Service worker chỉ cache shell/assets same-origin. Auth, Supabase API, file riêng tư và thao tác ghi không được cache. Offline mode chỉ hiển thị fallback; không coi thao tác offline là giao dịch thành công.

Thiết bị thật và native Capacitor APK/IPA chưa được xác minh trong workspace hiện tại.

# LifeCare – Your Life, Your Balance 🌿

> Modern, responsive, full-stack personal planner and holistic health care web application built to help individuals balance daily tasks, physical health, and emotional well-being.

---

## 🌟 Key Capabilities & Architecture

### 1. User Authentication & Private Data Vault
- **Hai cách sử dụng:**
  - **Đăng nhập / Đăng ký**: dữ liệu được lưu (Google Sheet / JSON) và mã hoá.
  - **Tài khoản khách**: dùng thử ngay, **không lưu dữ liệu**. Mỗi khách có tài khoản riêng (tuỳ chọn có sẵn dữ liệu mẫu). Dữ liệu khách không bao giờ nằm trong các tab dữ liệu chính. Trên Google Sheet, nó chỉ được giữ **tạm**, mã hoá nguyên khối, ở tab `_guests` để mọi instance Vercel cùng dùng được. Dữ liệu này bị xoá khi khách đăng xuất hoặc sau 24 giờ. Khi chạy trên máy (file JSON), dữ liệu khách chỉ nằm trong bộ nhớ.
  - Khách muốn giữ lại dữ liệu: bấm **"Tạo tài khoản để lưu"**, đăng ký với tuỳ chọn "Chuyển dữ liệu đang dùng thử". Toàn bộ dữ liệu (công việc, mục tiêu, tiến độ, thời gian biểu, sức khoẻ, tâm trạng, chat AI, cài đặt, tâm lý nền) được chuyển sang tài khoản mới, và từ đó được lưu và mã hoá.
  - Tài khoản demo `alex.balance@lifecare.app` / `LifeCare2026!` vẫn đăng nhập được (dữ liệu demo có lưu).
- **Multi-user Authentication:** Registration, login, session tokens, password recovery, profile editing (name, DOB, gender, wellness goals, avatar), and password management.
- **Privacy & Isolation:** Strict database row-level user scoping (`WHERE user_id = ?`) ensuring no user can view or modify another person's schedules, check-ins, or reflections.
- **Data Privacy & GDPR-friendly Controls:** Export all user data as JSON (`/api/user/export`), clear health and mood history, and permanent account deletion.

### 2. Main Dashboard
- **Contextual Greeting:** Dynamic greeting adapting to the time of day (`Good morning`, `Good afternoon`, `Good evening`), with user's name and current date.
- **Daily Overview Metrics:** Real-time counters for completed tasks, remaining tasks, completion rate %, sleep recorded, and emotional state.
- **Quick Actions:** Rapid 30-second daily check-in trigger, new task modal launcher, physical log, and mood reflection shortcuts.
- **Proactive Prompts:** Proactively surfaces a daily check-in banner if today's check-in hasn't been completed.

### 3. Smart Planner – Schedule Management
- **Calendar Views:** Month grid view, Week view, and Day view.
- **Task & Event Features:** Title, detailed description, category tagging (`Study`, `Work`, `Exercise`, `Personal`, `Rest`, `Other`), priority levels (`Low`, `Medium`, `High`), dates, start & end times, and interactive completion checkboxes.
- **Search & Filters:** Real-time search by keywords, category filter, and priority filter.

### 4. Physical Health Check-in
- **Holistic Daily Tracking:** Physical condition (Very Good, Good, Normal, Tired, Unwell), sleep duration (hours) and quality rating, exercise status, water intake (Liters), and interactive 1–5 energy rating buttons.
- **Discomfort & Symptoms Log:** Capture physical discomfort or tension notes.
- **Medical Disclaimer Safeguard:** Prominent advisory reminding users that LifeCare does not diagnose diseases or replace professional medical consultations.

### 5. Mental Health & Emotional Wellness
- **Daily Mood Picker:** Interactive mood selector with expressive emojis (Happy 😊, Excited ✨, Relaxed 😌, Normal 🙂, Tired 🥱, Stressed 😣, Sad 😢, Anxious 😰, Overwhelmed 🌪️).
- **Standardized Reflection Questionnaire:** 1–5 scale questions covering stress frequency, anxiety, motivation, social connectedness, and unwinding time.
- **Supportive Mindful Guidance:** Tailored encouragement based on reported emotions.
- **Ethical Boundary & Crisis Resources:** Transparent disclaimer that scores are not psychological diagnoses, accompanied by emergency contact information (e.g. 988 Lifeline).

### 6. The 5 Added Innovations
1. **⚡ Proactive Daily Check-in:** 30–60 second rapid check-in popup capturing mood, sleep, and stress in just three clicks.
2. **✨ AI Wellness Assistant:** Conversational companion providing mindful advice, time management coaching, break recommendations, and schedule audits.
3. **📅 Personal Health Timeline:** Visual chronological milestone stream tracking high-energy days, stress days, sleep patterns, and reflective journals over 7 days, 30 days, or a full year.
4. **💡 Smart Schedule Recommendation:** Engine detecting heavy work/study blocks without rest and advising hydration, walks, and screen breaks.
5. **📊 Automated Weekly Personal Report:** Comprehensive weekly summary with tasks completed ratio, average sleep duration, positive mood frequency, average stress, and motivational advice for the upcoming week.

### 7. Responsive UI & PWA Installation
- **Palette:** Soft Blue (`#6C9CE8`), Light Green (`#A8D5BA`), Off-white (`#F8FAFC`), Soft Purple (`#B8A5E8`), Dark Gray (`#334155`).
- **Dark Mode Support:** Smooth light/dark theme toggle with persistent preference.
- **PWA Ready:** Web app manifest, custom SVG icons, and Service Worker offline caching.

---

## 🔑 Quên mật khẩu (gửi mật khẩu tạm qua email)

Mật khẩu chỉ được lưu dạng băm (PBKDF2), nên không ai, kể cả máy chủ, xem lại được mật khẩu cũ.
Khi quên mật khẩu, LifeCare gửi một **mật khẩu tạm thời ngẫu nhiên** (dùng được 30 phút) tới email đã đăng ký:

- Mật khẩu cũ vẫn dùng được cho tới khi người dùng đăng nhập bằng mật khẩu tạm, nên người khác nhập email của bạn cũng không khoá được tài khoản.
- Đăng nhập bằng mật khẩu tạm thì app mở Cài đặt để đặt mật khẩu mới ngay.
- Câu trả lời luôn giống nhau, không để lộ email nào đã đăng ký; mỗi tài khoản tối đa 1 email / 60 giây.

Cấu hình gửi bằng Gmail (biến môi trường trên Vercel):
1. Bật **Xác minh 2 bước** cho tài khoản Gmail dùng để gửi.
2. Tạo **Mật khẩu ứng dụng** tại https://myaccount.google.com/apppasswords (16 ký tự).
3. Đặt `SMTP_USER` = địa chỉ Gmail đó, `SMTP_PASS` = mật khẩu ứng dụng (không phải mật khẩu Gmail), rồi deploy lại.

Chưa cấu hình thì nút "Gửi Mật Khẩu Tạm Thời" báo chức năng chưa được thiết lập.

## 🚀 Getting Started

### Lưu dữ liệu: Google Sheet / JSON (có mã hoá)
Khi chạy, dữ liệu nằm trong một SQLite trong bộ nhớ. Sau mỗi thay đổi, server mã hoá các trường nhạy cảm rồi ghi ra:
1. **Google Sheet** (khi đặt `GOOGLE_SHEET_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`). Mỗi bảng là một tab, tab `_meta` giữ phiên bản dữ liệu. Dùng cho bản deploy trên Vercel.
2. **File JSON** `data/lifecare-store.json` (mặc định khi chạy trên máy).

**Mã hoá (AES-256-GCM)** bằng khoá `DATA_ENCRYPTION_KEY`. Các trường được mã hoá:
- email, họ tên, ngày sinh, giới tính, mục tiêu cá nhân, tâm lý nền;
- ngày/giờ của công việc, khung giờ, gián đoạn và tiến độ;
- toàn bộ dữ liệu sức khoẻ và tâm trạng;
- nội dung chat AI;
- token phiên đăng nhập.

Tiêu đề và mô tả công việc để nguyên. Mật khẩu vốn đã được băm một chiều (PBKDF2). Danh sách cột mã hoá nằm trong `server/crypto-fields.js`.

> ⚠️ Mất hoặc đổi `DATA_ENCRYPTION_KEY` là không đọc lại được dữ liệu cũ. Khi chạy trên máy mà chưa đặt khoá, server tự tạo `data/.encryption-key` (không commit file này).

#### Thiết lập Google Sheet (một lần)
1. Vào https://console.cloud.google.com/, tạo project mới (hoặc dùng project có sẵn).
2. **APIs & Services → Library**, bật **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account**: đặt tên, bỏ qua phần phân quyền, bấm Done.
4. Mở service account vừa tạo → **Keys → Add key → Create new key → JSON**, tải file về. Giữ kín file này.
5. Tạo một Google Sheet trống. Bấm **Share**, thêm email của service account (dạng `...@...iam.gserviceaccount.com`) với quyền **Editor**.
6. Lấy **ID** của Sheet: phần nằm giữa `/d/` và `/edit` trên URL.
7. Trên Vercel (Project → Settings → Environment Variables), thêm các biến sau rồi deploy lại:
   - `GOOGLE_SHEET_ID`: ID ở bước 6.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: dán toàn bộ nội dung file JSON ở bước 4. Có thể dán dạng base64: `base64 -i key.json`.
   - `DATA_ENCRYPTION_KEY`: tạo bằng lệnh `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `GROQ_API_KEY`: để bật trợ lý AI.

Nhiều instance Vercel dùng chung Sheet:
- Mỗi phản hồi API kèm header `X-Data-Version`, trình duyệt gửi lại ở yêu cầu sau. Instance nào đang giữ bản cũ hơn sẽ nạp lại từ Sheet trước khi trả lời.
- Google Sheets chỉ cho khoảng 60 lượt đọc/phút. Server gộp các lần kiểm tra. Nếu Sheet tạm báo bận, server vẫn phục vụ bằng dữ liệu đang có và tự thử ghi lại.

Không sửa tay dữ liệu trong Sheet: các ô `enc:v1:...` là bản mã. Nếu sửa tay, nhớ tăng phiên bản ở ô `_meta!A1` để server nạp lại.

### Lập lịch theo khung giờ & mục tiêu
- **Thời gian biểu (time block)**: chia ngày thành ngủ nghỉ, ăn uống, đi học, học thêm, giải trí, tập luyện, tự học. Thiết lập một lần (có mẫu học sinh / sinh viên / người đi làm), áp dụng cho cả tuần hoặc các ngày được chọn, tự lặp mỗi tuần. Thời gian còn trống do AI phân bổ theo mục tiêu và thói quen.
- **Mục tiêu lớn**: AI chia thành công việc cụ thể, gồm thời lượng, ưu tiên và hạn. Người dùng sửa từng việc, hoặc báo "mình đang bị trễ" để AI chỉ điều chỉnh phần cần thiết.
- **Gián đoạn**: khai báo sự cố, nghỉ học, việc phát sinh hoặc thời gian bận. AI xếp lại theo ưu tiên, hạn chót và thời gian còn lại, không dồn hết sang hôm sau.
- **Tiến độ & dự báo**: hiển thị % hoàn thành và các cột mốc 25/50/75/100%. Có thể ghi thêm phần học/làm ngoài lịch. App dự báo ngày xong (sớm/trễ so với hạn) và cảnh báo khi mục tiêu không còn khả thi.
- **Nhắc việc**: khi đến giờ mà chưa xác nhận hoàn thành, app nhắc lại sau số phút tuỳ chỉnh, tôn trọng giờ yên tĩnh. Có thể bật thông báo trình duyệt.
- **Tâm lý nền + kiểm tra trạng thái hằng ngày**: hồ sơ tâm lý / ý chí được đặt cố định. Mỗi ngày lần đầu vào web, app hỏi nhanh trạng thái, rồi AI điều chỉnh nhẹ lịch hôm đó.
- Lượng nước tính bằng **ml**. Mục bữa ăn đổi thành "Dự kiến bữa ăn / chế độ dinh dưỡng".

### Trợ lý AI (Groq)
Trợ lý AI chạy bằng mô hình ngôn ngữ thật qua Groq (`server/llm-assistant.js`):
- Đọc hồ sơ, lịch (7 ngày trước đến 14 ngày tới), check-in sức khoẻ và tâm trạng gần đây của người dùng.
- **Tự thêm / sửa / xoá / đánh dấu hoàn thành công việc** trong Kế Hoạch khi người dùng yêu cầu; giao diện tự tải lại lịch.
- Nhớ hội thoại (bảng `ai_chats`); tin nhắn có dấu hiệu khủng hoảng luôn được trả lời ngay bằng thông tin hỗ trợ khẩn cấp.

**Giới hạn gói miễn phí của Groq:** khoảng 8.000 token/phút cho mỗi model. Để không bị báo "quá tải":
- Ngữ cảnh gửi cho AI được viết gọn (một tin nhắn thường khoảng 2.700 token).
- Khi model chính hết hạn mức, server tự chuyển sang `GROQ_FALLBACK_MODEL` (mặc định `openai/gpt-oss-20b`).
- Khi cả hai cùng hết, server tự đợi đúng thời gian Groq yêu cầu (tối đa 12 giây mỗi lần) rồi thử lại.
- Nếu vẫn không được, khung chat hiện nút "Thử lại".

Muốn dùng nhiều hơn thì nâng Groq lên Dev Tier (trả phí).

Biến môi trường: `GROQ_API_KEY` (bắt buộc để bật AI), `GROQ_MODEL` (mặc định `openai/gpt-oss-120b`), `APP_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`). Không có `GROQ_API_KEY` thì trợ lý dùng bộ luật trả lời cố định như trước.

### Prerequisites
- Node.js (v18+ recommended)

### Run Locally
```bash
# Cài đặt dependencies
npm install

# Start the server
node server.js
```

Open your browser at:
```
http://localhost:3000
```

### Pre-seeded Demo Account
To quickly explore the dashboard with pre-populated realistic historical data:
- **Email:** `alex.balance@lifecare.app`
- **Password:** `LifeCare2026!`

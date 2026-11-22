# LifeCare – Your Life, Your Balance 🌿

> Modern, responsive, full-stack personal planner and holistic health care web application built to help individuals balance daily tasks, physical health, and emotional well-being.

---

## 🌟 Key Capabilities & Architecture

### 1. User Authentication & Private Data Vault
- **Chế độ mở (Guest Mode / No-login):** Tạm thời bỏ yêu cầu bắt buộc đăng nhập bằng email. Người dùng có thể trải nghiệm ngay lập tức toàn bộ tính năng của LifeCare (Lập kế hoạch, theo dõi sức khỏe thể chất, cảm xúc, trợ lý AI) dưới chế độ Khách mà không bị chặn bởi form đăng nhập.
- **Tùy chọn đăng nhập / đăng ký:** Form đăng nhập email và mật khẩu vẫn hoạt động bình thường cho người dùng có nhu cầu lưu trữ tài khoản cá nhân riêng biệt.
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

## 🚀 Getting Started

### Database Configuration (Turso / Local SQLite)
LifeCare hỗ trợ 2 chế độ cơ sở dữ liệu:
1. **Turso Cloud Database (libSQL)** – Khuyên dùng cho môi trường production / Vercel Serverless:
   - Thêm biến môi trường trên Vercel (Project Settings > Environment Variables):
     - `TURSO_DATABASE_URL`: URL kết nối (ví dụ: `libsql://your-db.turso.io`)
     - `TURSO_AUTH_TOKEN`: Token xác thực Turso
   - Hệ thống cũng hỗ trợ tiền tố `TURBO_DATABASE_URL` và `TURBO_AUTH_TOKEN`.
   - Khi có các biến này, ứng dụng sẽ tự động đồng bộ và lưu trữ dữ liệu vĩnh viễn trên Turso Cloud.
2. **Local SQLite File:**
   - Khi chạy ở môi trường local hoặc không cấu hình Turso, hệ thống tự động sử dụng file SQLite nội bộ (`data/lifecare.sqlite`).

### Prerequisites
- Node.js (v18+ recommended)

### Run Locally
```bash
# Cài đặt dependencies
npm install

# Khởi tạo database (tùy chọn)
npm run db:setup

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

# 🌟 PlanMaster AI - Ứng Dụng Lập Kế Hoạch, Khảo Sát Tâm Lý & AI Camera (Teachable Machine)

Một ứng dụng Progressive Web App (PWA) hiện đại, toàn diện và trực quan. Tích hợp:
1. **Quản lý kế hoạch chuyên sâu** (Thêm, Sửa, Xoá, Checklist, Kanban, Danh sách).
2. **Khảo sát sức khỏe tâm lý** theo chuẩn WHO-5 & PHQ-4.
3. **AI Camera tích hợp Google Teachable Machine** nhận diện biểu cảm, độ tập trung và mức độ mệt mỏi thời gian thực.
4. **Hệ thống cảnh báo & thông báo lịch trình** khẩn cấp (Web Notifications, Chime sound).
5. **Trợ lý AI (PlanBot)** tư vấn phương pháp S.M.A.R.T và tự động đồng bộ kế hoạch 1-click.

---

## 🚀 Truy Cập Nhanh

Ứng dụng đang hoạt động tại:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📷 Tính Năng Mới: Tích Hợp Google Teachable Machine

Nằm tại Tab **"AI Camera (Teachable Machine)"**:
- **Quét Camera thời gian thực**: Sử dụng Webcam để nhận diện biểu cảm khuôn mặt và trạng thái cơ thể.
- **Bảng xác suất AI sống động**:
  - 🌟 **Tươi Cười & Tích Cực**
  - 🎯 **Tập Trung Cao Độ**
  - 🥱 **Mệt Mỏi / Cần Nghỉ**
  - 😣 **Áp Lực / Căng Thẳng**
- **Đồng bộ 1-Chạm vào Khảo Sát Tâm Lý**:
  - Bấm nút **"🧘 Áp Dụng Vào Khảo Sát Tâm Lý"** để hệ thống tự động điền kết quả nhận diện camera vào bảng kiểm tra sức khỏe tinh thần.
- **Đồng bộ cùng Trợ Lý AI**:
  - Bấm nút **"🤖 Nhờ AI Đề Xuất Lịch Trình"** để PlanBot AI đọc trạng thái cảm xúc thực tế và gợi ý kế hoạch cân bằng phù hợp.
- **Hỗ trợ nạp Model riêng của bạn (Custom Teachable Machine Model)**:
  - Cho phép dán bất kỳ đường dẫn model nào bạn đã huấn luyện trên [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com/).
  - Tự động nạp `model.json` và `metadata.json` qua TensorFlow.js và `@teachablemachine/image`.
  - Có sẵn hướng dẫn 3 bước tự huấn luyện model miễn phí ngay trên giao diện!

---

## 🧠 Tính Năng Khảo Sát Tâm Lý (Mental Health)

- Đo lường cảm xúc, thanh trượt mức độ Stress (1-10) và mức Năng lượng (1-10).
- 4 câu hỏi trắc nghiệm khoa học đánh giá mức độ lo âu, chất lượng giấc ngủ và gánh nặng công việc.
- Chẩn đoán điểm số tinh thần (thang điểm 100), đưa ra lời khuyên cá nhân hóa (thở 4-7-8, đi dạo, Pomodoro).
- Nút **"🤖 Nhờ PlanBot AI Điều Chỉnh Lịch Trình"** tự động chuyển điểm tâm lý sang AI để dời việc nặng khi bạn mệt mỏi.

---

## 🔔 Hệ Thống Thông Báo Lịch Trình

- **Chuông thông báo (Notification Center)** với đèn đỏ báo động khi có việc gấp.
- Phân loại rõ ràng:
  - 🔴 **Quá hạn**: Cần giải quyết ngay hoặc dời hạn.
  - 🟡 **Cần làm hôm nay**: Hạn chót trong ngày.
  - 🔵 **Sắp tới hạn ngày mai**.
- Nút bấm **"Xong"** và **"Xem chi tiết"** trực tiếp từ thông báo.
- **Thông báo đẩy màn hình (Desktop Notifications)** và âm thanh chuông báo (Chime Sound) qua Web Audio API.

---

## 📱 Chuẩn Progressive Web App (PWA)

- Hỗ trợ `manifest.json`, Service Worker lưu cache và hoạt động mượt mà.
- Nút **"Cài Đặt App"** cho phép cài đặt trực tiếp lên máy tính hoặc điện thoại như phần mềm độc lập.
- Bố cục vừa vặn, tối ưu cho cả màn hình rộng và thiết bị di động.

---

## 💻 Cách Khởi Chạy

Mở Terminal tại thư mục dự án và chạy:
```bash
npm start
# hoặc: node server.js
```
Mở trình duyệt truy cập: **`http://localhost:3000`**

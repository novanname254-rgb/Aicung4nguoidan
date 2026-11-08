const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'plans.json');
const MENTAL_HEALTH_FILE = path.join(DATA_DIR, 'mental-health.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// Ensure data folder and files exist
function initDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(MENTAL_HEALTH_FILE)) {
    fs.writeFileSync(MENTAL_HEALTH_FILE, '[]', 'utf8');
  }
}

function readMentalHealth() {
  try {
    initDataFile();
    const data = fs.readFileSync(MENTAL_HEALTH_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    return [];
  }
}

function writeMentalHealth(records) {
  try {
    initDataFile();
    fs.writeFileSync(MENTAL_HEALTH_FILE, JSON.stringify(records, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function readPlans() {
  try {
    initDataFile();
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Lỗi khi đọc file plans.json:', err);
    return [];
  }
}

function writePlans(plans) {
  try {
    initDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify(plans, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Lỗi khi ghi file plans.json:', err);
    return false;
  }
}

// Helpers for request & response
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Built-in Intelligent Planner AI Engine
function generateAIPlanResponse(userMessage, plansContext = []) {
  const msg = (userMessage || '').toLowerCase();
  const now = new Date();
  
  // Format date helper: YYYY-MM-DD
  const formatDate = (daysAhead) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  };

  let category = 'Công việc';
  let title = 'Kế hoạch phát triển mục tiêu mới';
  let advice = '';
  let suggestedTasks = [];

  // 0. Sức khỏe tâm lý / Stress / Phục hồi năng lượng / Điều chỉnh lịch
  if (msg.includes('tâm lý') || msg.includes('stress') || msg.includes('căng thẳng') || msg.includes('kiệt sức') || msg.includes('mệt mỏi') || msg.includes('tinh thần') || msg.includes('áp lực')) {
    category = 'Sức khỏe';
    title = 'Kế hoạch phục hồi năng lượng & Cân bằng tâm lý';
    advice = `🌿 **Lời khuyên cân bằng tâm trí & giảm tải áp lực:**
1. **Ưu tiên phục hồi (Energy Audit):** Khi tinh thần đang mệt mỏi, việc cố ép bản thân làm việc nặng chỉ làm tăng áp lực. Hãy tạm gác các đầu việc không khẩn cấp.
2. **Kỹ thuật xả stress tức thì (Grounding & Breath):** Thực hành nhịp thở 4-7-8 (Hít vào 4s, giữ 7s, thở ra 8s) để kích hoạt hệ thần kinh phó giao cảm giúp nhịp tim dịu lại.
3. **Phân tách ranh giới rõ ràng:** Tắt thông báo sau 20h00, dành ít nhất 20-30 phút thư giãn không dùng màn hình điện thoại.

Dưới đây là các đầu việc phục hồi năng lượng nhẹ nhàng tôi đã chuẩn bị để giúp bạn lấy lại sự cân bằng:`;

    suggestedTasks = [
      {
        title: 'Nghỉ ngơi chủ động & Kỹ thuật thở 4-7-8 (15 phút)',
        description: 'Thực hiện 3 hiệp thở 4-7-8 vào buổi trưa hoặc sau giờ làm việc căng thẳng để giải tỏa áp lực thần kinh.',
        category: 'Sức khỏe',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(1),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Tìm góc yên tĩnh, ngồi thẳng lưng thư giãn vai', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Hít vào 4 giây - Giữ 7 giây - Thở ra chậm 8 giây', completed: false }
        ],
        tags: ['Tâm lý', 'Thư giãn', 'Hồi phục']
      },
      {
        title: 'Đi dạo ngoài trời không thiết bị điện tử 20 phút',
        description: 'Vận động nhẹ nhàng dưới ánh sáng tự nhiên giúp tăng tiết Serotonin và giảm nồng độ hormone Cortisol.',
        category: 'Sức khỏe',
        priority: 'medium',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(2),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Bật chế độ không làm phiền', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Uống 1 cốc nước ấm sau khi đi dạo về', completed: false }
        ],
        tags: ['Đi dạo', 'Năng lượng']
      },
      {
        title: 'Rà soát và dời hạn các việc chưa khẩn cấp',
        description: 'Giảm bớt gánh nặng tâm lý bằng cách chuyển các đầu việc độ ưu tiên Thấp sang tuần sau.',
        category: 'Công việc',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(1),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chọn lọc tối đa 2 việc quan trọng nhất cho ngày mai', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ghi nhận bản thân đã nỗ lực hết mình', completed: false }
        ],
        tags: ['Tối ưu', 'Giảm tải']
      }
    ];
  }
  // 1. Ngoại ngữ / IELTS / Tiếng Anh
  else if (msg.includes('ielts') || msg.includes('tiếng anh') || msg.includes('ngoại ngữ') || msg.includes('english') || msg.includes('toeic')) {
    category = 'Học tập';
    title = 'Lộ trình bứt phá mục tiêu Tiếng Anh';
    advice = `🎯 **Chiến lược học tập hiệu quả:**
1. **Chia nhỏ thời gian (Time-blocking):** Dành cố định 45-60 phút vào khung giờ não bộ tỉnh táo nhất (sáng sớm hoặc tối).
2. **Phương pháp Input trước, Output sau:** Tập trung củng cố 3000 từ vựng cốt lõi và luyện nghe Shadowing trước khi luyện viết/nói.
3. **Theo dõi tiến độ định kỳ:** Thi thử mini-test mỗi cuối tuần để đo lường tiến bộ.

Dưới đây là các đầu việc cụ thể tôi đã lập sẵn cho bạn. Bạn có thể nhấn **"Thêm vào kế hoạch"** để đưa ngay vào bảng quản lý!`;

    suggestedTasks = [
      {
        title: 'Xây dựng vốn từ vựng học thuật (20 từ/ngày)',
        description: 'Sử dụng phương pháp Spaced Repetition (Anki/Flashcards) học từ vựng theo chủ đề quen thuộc.',
        category: 'Học tập',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(7),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Tải bộ thẻ từ vựng Oxford 3000 / Academic', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Học 20 từ mới và ôn lại 40 từ cũ mỗi ngày', completed: false }
        ],
        tags: ['Tiếng Anh', 'Từ vựng', 'Anki']
      },
      {
        title: 'Luyện nghe & Nhại giọng (Shadowing) 30 phút/ngày',
        description: 'Luyện tai nghe quen với ngữ điệu người bản xứ qua BBC 6 Minute English hoặc TED Talks.',
        category: 'Học tập',
        priority: 'medium',
        status: 'todo',
        startDate: formatDate(1),
        dueDate: formatDate(14),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Nghe lần 1 không phụ đề để nắm ý chính', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Vừa nghe vừa đọc to theo transcript (Shadowing)', completed: false }
        ],
        tags: ['Tiếng Anh', 'Listening', 'Speaking']
      },
      {
        title: 'Luyện đề và tự chấm điểm hàng tuần',
        description: 'Làm 1 bài test hoàn chỉnh kỹ năng Đọc và Nghe vào sáng Chủ nhật để đánh giá band điểm.',
        category: 'Học tập',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(6),
        dueDate: formatDate(21),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Bấm giờ chuẩn 60 phút Reading và 40 phút Listening', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ghi chú sổ tay lỗi sai và từ vựng bẫy', completed: false }
        ],
        tags: ['Thi thử', 'Đánh giá']
      }
    ];
  }
  // 2. Sức khỏe / Giảm cân / Tập gym / Chạy bộ
  else if (msg.includes('giảm cân') || msg.includes('gym') || msg.includes('chạy bộ') || msg.includes('tập luyện') || msg.includes('sức khỏe') || msg.includes('thể dục') || msg.includes('ăn kiêng')) {
    category = 'Sức khỏe';
    title = 'Kế hoạch cải thiện thể lực và vóc dáng';
    advice = `💪 **Nguyên tắc vàng để đạt kết quả bền vững:**
1. **Calo In < Calo Out (Thâm hụt calo lành mạnh):** Giảm bớt đường ngọt, đồ chiên dầu; ưu tiên đạm sạch và rau xanh.
2. **Quy tắc 80/20:** 80% phụ thuộc vào dinh dưỡng và giấc ngủ, 20% phụ thuộc vào cường độ vận động.
3. **Thói quen nhất quán quan trọng hơn tập quá sức:** Bắt đầu từ 20-30 phút/ngày để duy trì không bị kiệt sức.`;

    suggestedTasks = [
      {
        title: 'Thiết lập thực đơn ăn uống thâm hụt calo',
        description: 'Cắt giảm nước ngọt và tinh bột tinh chế, tính toán TDEE và chuẩn bị đồ ăn lành mạnh trong tuần.',
        category: 'Sức khỏe',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(3),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Tính lượng TDEE và mục tiêu calo mỗi ngày', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Uống đủ 2 - 2.5 lít nước mỗi ngày', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chuẩn bị hộp đồ ăn trưa giàu đạm và rau củ', completed: false }
        ],
        tags: ['Dinh dưỡng', 'EatClean']
      },
      {
        title: 'Lịch tập cardio/chạy bộ 3 buổi mỗi tuần',
        description: 'Duy trì vận động thể chất vào Thứ 3, Thứ 5 và Thứ 7 lúc 6h30 sáng.',
        category: 'Sức khỏe',
        priority: 'medium',
        status: 'todo',
        startDate: formatDate(1),
        dueDate: formatDate(14),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chạy bộ xen kẽ đi bộ nhanh 3km/buổi', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Thực hiện 10 phút giãn cơ sau khi chạy', completed: false }
        ],
        tags: ['Chạy bộ', 'Cardio']
      },
      {
        title: 'Cân đo chỉ số cơ thể định kỳ',
        description: 'Đo cân nặng và vòng eo vào sáng thứ 2 hàng tuần sau khi thức dậy.',
        category: 'Sức khỏe',
        priority: 'low',
        status: 'todo',
        startDate: formatDate(7),
        dueDate: formatDate(28),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ghi lại cân nặng và số đo 3 vòng vào nhật ký', completed: false }
        ],
        tags: ['Đo lường', 'Mục tiêu']
      }
    ];
  }
  // 3. Dự án / Khởi nghiệp / Kinh doanh / Mở quán / Marketing
  else if (msg.includes('dự án') || msg.includes('khởi nghiệp') || msg.includes('kinh doanh') || msg.includes('mở quán') || msg.includes('bán hàng') || msg.includes('marketing') || msg.includes('sản phẩm')) {
    category = 'Công việc';
    title = 'Kế hoạch triển khai dự án kinh doanh';
    advice = `🚀 **Lộ trình thực thi tinh gọn (Lean Startup):**
1. **Xác thực nhu cầu (Validation):** Khảo sát 20-30 khách hàng tiềm năng trước khi đầu tư vốn lớn.
2. **Sản phẩm khả dụng tối thiểu (MVP):** Tạo ra phiên bản thử nghiệm nhanh chóng để kiểm chứng.
3. **Quản trị rủi ro & dòng tiền:** Lập bảng dự trù ngân sách ít nhất cho 6 tháng duy trì.`;

    suggestedTasks = [
      {
        title: 'Nghiên cứu thị trường và phân tích đối thủ cạnh tranh',
        description: 'Khảo sát 5 đối thủ trực tiếp trong khu vực về giá bán, menu, điểm mạnh và điểm yếu.',
        category: 'Công việc',
        priority: 'urgent',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(5),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Lập bảng phân tích điểm mạnh yếu SWOT', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Phỏng vấn 10 khách hàng thuộc tệp mục tiêu', completed: false }
        ],
        tags: ['Khởi nghiệp', 'Nghiên cứu']
      },
      {
        title: 'Dự toán chi phí đầu tư và điểm hòa vốn',
        description: 'Bóc tách chi phí cố định (mặt bằng, thiết bị) và chi phí biến đổi (nguyên liệu, marketing).',
        category: 'Tài chính',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(2),
        dueDate: formatDate(7),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Tính giá vốn sản phẩm (COGS)', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Xác định số lượng đơn hàng cần để đạt điểm hòa vốn', completed: false }
        ],
        tags: ['Tài chính', 'Ngân sách']
      },
      {
        title: 'Xây dựng kênh truyền thông & nhận diện thương hiệu',
        description: 'Tạo Fanpage, thiết kế logo, bộ ấn phẩm truyền thông và chạy chiến dịch tiếp cận đầu tiên.',
        category: 'Công việc',
        priority: 'medium',
        status: 'todo',
        startDate: formatDate(5),
        dueDate: formatDate(15),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Thiết kế logo và banner trên Canva/Figma', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Viết 5 bài viết giới thiệu khai trương', completed: false }
        ],
        tags: ['Marketing', 'Branding']
      }
    ];
  }
  // 4. Quản lý thời gian / Năng suất / Đọc sách / Bản thân
  else if (msg.includes('thời gian') || msg.includes('đọc sách') || msg.includes('thói quen') || msg.includes('năng suất') || msg.includes('pomodoro') || msg.includes('kỷ luật')) {
    category = 'Cá nhân';
    title = 'Kế hoạch nâng cao hiệu suất & Kỷ luật bản thân';
    advice = `⏳ **Bí quyết quản lý thời gian cá nhân:**
1. **Phương pháp Pomodoro:** 25 phút tập trung cao độ, 5 phút nghỉ ngơi ngắn.
2. **Quy tắc 2 phút:** Việc gì làm dưới 2 phút hãy làm ngay lập tức, không trì hoãn.
3. **Thói quen buổi sáng (Morning Routine):** Bắt đầu ngày mới không chạm vào mạng xã hội trong 30 phút đầu tiên.`;

    suggestedTasks = [
      {
        title: 'Xây dựng thói quen đọc sách 20 trang mỗi ngày',
        description: 'Chọn khung giờ trước khi đi ngủ 30 phút, đọc tập trung và gạch chân các ý tưởng tâm đắc.',
        category: 'Cá nhân',
        priority: 'medium',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(10),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chọn 1 cuốn sách phát triển kỹ năng', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ghi lại 3 bài học áp dụng được sau khi đọc', completed: false }
        ],
        tags: ['Đọc sách', 'Thói quen']
      },
      {
        title: 'Áp dụng khung giờ Pomodoro vào công việc hàng ngày',
        description: 'Thực hiện ít nhất 4 chu kỳ Pomodoro (100 phút tập trung) cho công việc quan trọng nhất.',
        category: 'Công việc',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(7),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Tắt toàn bộ thông báo điện thoại khi đang tập trung', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Đánh giá mức độ hoàn thành công việc cuối ngày', completed: false }
        ],
        tags: ['Pomodoro', 'Năng suất']
      }
    ];
  }
  // 5. Tổng quát / Kế hoạch chung
  else {
    title = `Kế hoạch hành động: "${userMessage.slice(0, 35)}..."`;
    advice = `💡 **Phân tích mục tiêu theo nguyên tắc S.M.A.R.T:**
- **Specific (Cụ thể):** Xác định rõ mục tiêu cần đạt được là gì.
- **Measurable (Đo lường được):** Có con số hoặc mốc cụ thể để kiểm tra.
- **Achievable (Khả thi):** Chia thành các bước vừa sức để không nản lòng.
- **Relevant (Thực tế):** Phù hợp với định hướng hiện tại của bạn.
- **Time-bound (Có hạn chót):** Gắn thời hạn rõ ràng cho từng bước.

Tôi đã xây dựng lộ trình 3 bước hành động cụ thể cho bạn:`;

    suggestedTasks = [
      {
        title: `Nghiên cứu & Lên khung mục tiêu: ${userMessage.slice(0, 40)}`,
        description: 'Thu thập thông tin, xác định các nguồn lực cần thiết và đặt ra tiêu chuẩn hoàn thành.',
        category: 'Công việc',
        priority: 'high',
        status: 'todo',
        startDate: formatDate(0),
        dueDate: formatDate(3),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Liệt kê các bước chuẩn bị ban đầu', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Đặt ra tiêu chí đánh giá thành công', completed: false }
        ],
        tags: ['Chuẩn bị', 'Lập kế hoạch']
      },
      {
        title: 'Thực thi giai đoạn 1: Triển khai các bước cốt lõi',
        description: 'Tập trung giải quyết 20% công việc quan trọng nhất mang lại 80% kết quả.',
        category: 'Công việc',
        priority: 'urgent',
        status: 'todo',
        startDate: formatDate(2),
        dueDate: formatDate(10),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Thực hiện đầu việc ưu tiên số 1', completed: false },
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Kiểm tra và hiệu chỉnh lại hướng đi', completed: false }
        ],
        tags: ['Thực thi', 'Hành động']
      },
      {
        title: 'Tổng kết đánh giá & Tối ưu kết quả',
        description: 'Xem xét những điều làm tốt và những điểm cần cải thiện cho kế hoạch tiếp theo.',
        category: 'Cá nhân',
        priority: 'low',
        status: 'todo',
        startDate: formatDate(9),
        dueDate: formatDate(15),
        subtasks: [
          { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ghi chú bài học kinh nghiệm', completed: false }
        ],
        tags: ['Đánh giá']
      }
    ];
  }

  return {
    reply: advice,
    suggestedTasks: suggestedTasks
  };
}

// External LLM API caller (e.g. Google Gemini)
async function callGeminiAPI(apiKey, prompt, history = []) {
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const systemInstruction = `Bạn là Trợ lý AI Chuyên gia Lập Kế Hoạch Cá Nhân và Quản lý Công việc thông minh.
Nhiệm vụ của bạn:
1. Luôn phản hồi bằng tiếng Việt thân thiện, súc tích, logic, khích lệ.
2. Đưa ra lời khuyên thực tế theo phương pháp SMART, Pomodoro, Time-blocking hoặc Eisenhower.
3. Khi người dùng muốn lập kế hoạch, hãy LUÔN cung cấp danh sách công việc đề xuất ở định dạng JSON ở cuối câu trả lời được bọc trong khối \`\`\`json { "tasks": [ ... ] } \`\`\` để hệ thống tự động bóc tách thành nút bấm cho người dùng thêm vào bảng.
Mỗi task trong mảng "tasks" cần có:
- title: Tiêu đề ngắn gọn
- description: Mô tả chi tiết hành động
- category: Một trong ['Công việc', 'Học tập', 'Sức khỏe', 'Tài chính', 'Cá nhân']
- priority: Một trong ['urgent', 'high', 'medium', 'low']
- dueDate: YYYY-MM-DD (dựa theo ngày hôm nay: ${new Date().toISOString().split('T')[0]})
- subtasks: Danh sách các bước nhỏ ["bước 1", "bước 2"]
- tags: Danh sách nhãn ["nhan1", "nhan2"]`;

  const contents = [];
  if (history && history.length > 0) {
    history.slice(-6).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      });
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  const response = await fetch(geminiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Xin lỗi, tôi không thể xử lý yêu cầu lúc này.';

  // Extract JSON tasks if present
  let suggestedTasks = [];
  let cleanReply = rawText;
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        suggestedTasks = parsed.tasks.map(t => ({
          title: t.title || 'Công việc mới',
          description: t.description || '',
          category: t.category || 'Công việc',
          priority: t.priority || 'medium',
          status: 'todo',
          startDate: new Date().toISOString().split('T')[0],
          dueDate: t.dueDate || new Date().toISOString().split('T')[0],
          subtasks: (t.subtasks || []).map(st => ({
            id: 'sub_' + Math.random().toString(36).substr(2, 6),
            title: typeof st === 'string' ? st : st.title,
            completed: false
          })),
          tags: t.tags || []
        }));
      }
      cleanReply = rawText.replace(/```json[\s\S]*?```/, '').trim();
    } catch (e) {
      console.warn('Lỗi parse JSON từ Gemini response:', e);
    }
  }

  return {
    reply: cleanReply,
    suggestedTasks
  };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- REST API ROUTES ---
  if (pathname.startsWith('/api/')) {
    try {
      // 1. GET /api/plans - Lấy danh sách kế hoạch
      if (pathname === '/api/plans' && method === 'GET') {
        const plans = readPlans();
        return sendJSON(res, 200, { success: true, data: plans });
      }

      // 2. POST /api/plans - Thêm kế hoạch mới
      if (pathname === '/api/plans' && method === 'POST') {
        const body = await parseBody(req);
        if (!body.title || !body.title.trim()) {
          return sendJSON(res, 400, { success: false, error: 'Tiêu đề kế hoạch không được để trống' });
        }

        const plans = readPlans();
        const nowIso = new Date().toISOString();
        const newPlan = {
          id: 'plan_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          title: body.title.trim(),
          description: body.description ? body.description.trim() : '',
          category: body.category || 'Công việc',
          priority: body.priority || 'medium', // urgent, high, medium, low
          status: body.status || 'todo', // todo, in_progress, completed
          startDate: body.startDate || nowIso.split('T')[0],
          dueDate: body.dueDate || nowIso.split('T')[0],
          tags: Array.isArray(body.tags) ? body.tags : [],
          subtasks: Array.isArray(body.subtasks) ? body.subtasks.map(s => ({
            id: s.id || 'sub_' + Math.random().toString(36).substr(2, 7),
            title: s.title || '',
            completed: Boolean(s.completed)
          })) : [],
          createdAt: nowIso,
          updatedAt: nowIso
        };

        plans.unshift(newPlan);
        writePlans(plans);
        return sendJSON(res, 201, { success: true, data: newPlan });
      }

      // 3. POST /api/plans/batch - Thêm nhiều kế hoạch (Ví dụ từ gợi ý AI)
      if (pathname === '/api/plans/batch' && method === 'POST') {
        const body = await parseBody(req);
        const newItems = Array.isArray(body.plans) ? body.plans : [];
        if (newItems.length === 0) {
          return sendJSON(res, 400, { success: false, error: 'Không có kế hoạch nào để thêm' });
        }

        const plans = readPlans();
        const nowIso = new Date().toISOString();
        const addedPlans = [];

        for (const item of newItems) {
          if (!item.title) continue;
          const newPlan = {
            id: 'plan_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
            title: item.title.trim(),
            description: item.description ? item.description.trim() : '',
            category: item.category || 'Công việc',
            priority: item.priority || 'medium',
            status: item.status || 'todo',
            startDate: item.startDate || nowIso.split('T')[0],
            dueDate: item.dueDate || nowIso.split('T')[0],
            tags: Array.isArray(item.tags) ? item.tags : [],
            subtasks: Array.isArray(item.subtasks) ? item.subtasks.map(s => ({
              id: s.id || 'sub_' + Math.random().toString(36).substr(2, 7),
              title: s.title || '',
              completed: Boolean(s.completed)
            })) : [],
            createdAt: nowIso,
            updatedAt: nowIso
          };
          plans.unshift(newPlan);
          addedPlans.push(newPlan);
        }

        writePlans(plans);
        return sendJSON(res, 201, { success: true, count: addedPlans.length, data: addedPlans });
      }

      // 4. PUT /api/plans/:id - Sửa kế hoạch
      if (pathname.startsWith('/api/plans/') && method === 'PUT') {
        const id = pathname.replace('/api/plans/', '');
        const body = await parseBody(req);
        const plans = readPlans();
        const index = plans.findIndex(p => p.id === id);

        if (index === -1) {
          return sendJSON(res, 404, { success: false, error: 'Không tìm thấy kế hoạch' });
        }

        const current = plans[index];
        const updatedPlan = {
          ...current,
          title: body.title !== undefined ? body.title.trim() : current.title,
          description: body.description !== undefined ? body.description.trim() : current.description,
          category: body.category !== undefined ? body.category : current.category,
          priority: body.priority !== undefined ? body.priority : current.priority,
          status: body.status !== undefined ? body.status : current.status,
          startDate: body.startDate !== undefined ? body.startDate : current.startDate,
          dueDate: body.dueDate !== undefined ? body.dueDate : current.dueDate,
          tags: body.tags !== undefined ? body.tags : current.tags,
          subtasks: body.subtasks !== undefined ? body.subtasks : current.subtasks,
          updatedAt: new Date().toISOString()
        };

        plans[index] = updatedPlan;
        writePlans(plans);
        return sendJSON(res, 200, { success: true, data: updatedPlan });
      }

      // 5. DELETE /api/plans/:id - Xoá kế hoạch
      if (pathname.startsWith('/api/plans/') && method === 'DELETE') {
        const id = pathname.replace('/api/plans/', '');
        const plans = readPlans();
        const index = plans.findIndex(p => p.id === id);

        if (index === -1) {
          return sendJSON(res, 404, { success: false, error: 'Không tìm thấy kế hoạch để xoá' });
        }

        const deleted = plans.splice(index, 1)[0];
        writePlans(plans);
        return sendJSON(res, 200, { success: true, message: 'Đã xoá kế hoạch thành công', deleted });
      }

      // 6. POST /api/ai/chat - Trò chuyện với Trợ lý AI Lập Kế Hoạch
      if (pathname === '/api/ai/chat' && method === 'POST') {
        const body = await parseBody(req);
        const message = body.message || '';
        const history = body.history || [];
        const apiKey = body.apiKey || process.env.GEMINI_API_KEY || '';
        const provider = body.provider || (apiKey ? 'gemini' : 'builtin');

        if (!message.trim()) {
          return sendJSON(res, 400, { success: false, error: 'Tin nhắn không được để trống' });
        }

        const currentPlans = readPlans();

        if (provider === 'gemini' && apiKey) {
          try {
            const aiResult = await callGeminiAPI(apiKey, message, history);
            return sendJSON(res, 200, { success: true, provider: 'gemini', ...aiResult });
          } catch (apiErr) {
            console.error('Gemini API call failed, falling back to built-in AI:', apiErr.message);
            // Fallback gracefully to built-in AI
            const fallbackResult = generateAIPlanResponse(message, currentPlans);
            return sendJSON(res, 200, {
              success: true,
              provider: 'builtin (fallback)',
              reply: `*(Lưu ý: API Key gặp lỗi hoặc chưa kích hoạt, trợ lý đang phản hồi qua Bộ não AI tích hợp sẵn)*\n\n` + fallbackResult.reply,
              suggestedTasks: fallbackResult.suggestedTasks
            });
          }
        } else {
          // Use built-in intelligent engine
          const aiResult = generateAIPlanResponse(message, currentPlans);
          return sendJSON(res, 200, { success: true, provider: 'builtin', ...aiResult });
        }
      }

      // 7. GET /api/export - Xuất toàn bộ dữ liệu kế hoạch
      if (pathname === '/api/export' && method === 'GET') {
        const plans = readPlans();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="ke_hoach_${new Date().toISOString().split('T')[0]}.json"`
        });
        return res.end(JSON.stringify(plans, null, 2));
      }

      // 8. POST /api/import - Nhập dữ liệu
      if (pathname === '/api/import' && method === 'POST') {
        const body = await parseBody(req);
        if (!Array.isArray(body.plans)) {
          return sendJSON(res, 400, { success: false, error: 'Dữ liệu không đúng định dạng danh sách kế hoạch' });
        }
        writePlans(body.plans);
        return sendJSON(res, 200, { success: true, count: body.plans.length });
      }

      // 9. GET /api/mental-health - Lịch sử khảo sát tâm lý
      if (pathname === '/api/mental-health' && method === 'GET') {
        const records = readMentalHealth();
        return sendJSON(res, 200, { success: true, data: records });
      }

      // 10. POST /api/mental-health - Lưu khảo sát tâm lý mới
      if (pathname === '/api/mental-health' && method === 'POST') {
        const body = await parseBody(req);
        const records = readMentalHealth();
        const record = {
          id: 'mh_' + Date.now(),
          timestamp: new Date().toISOString(),
          mood: body.mood || 'normal',
          stressLevel: Number(body.stressLevel) || 5,
          energyLevel: Number(body.energyLevel) || 5,
          score: Number(body.score) || 70,
          status: body.status || 'Bình thường',
          answers: body.answers || {},
          recommendations: body.recommendations || []
        };
        records.unshift(record);
        // Keep max 50 records
        if (records.length > 50) records.length = 50;
        writeMentalHealth(records);
        return sendJSON(res, 201, { success: true, data: record });
      }

      // 404 for unknown API
      return sendJSON(res, 404, { success: false, error: 'Endpoint không tồn tại' });
    } catch (apiError) {
      console.error('Lỗi API nội bộ:', apiError);
      return sendJSON(res, 500, { success: false, error: apiError.message || 'Lỗi máy chủ nội bộ' });
    }
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Truy cập bị từ chối');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If file not found, try index.html (SPA fallback)
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 - Không tìm thấy trang');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const responseHeaders = { 'Content-Type': contentType };
    if (pathname === '/sw.js') {
      responseHeaders['Service-Worker-Allowed'] = '/';
      responseHeaders['Cache-Control'] = 'no-cache';
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Lỗi đọc tệp tĩnh');
      }
      res.writeHead(200, responseHeaders);
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Ứng dụng Lập Kế Hoạch & Trợ Lý AI đã sẵn sàng!`);
  console.log(`🌐 Truy cập tại: http://localhost:${PORT}`);
  console.log(`====================================================`);
});

// AI Planning Assistant Module (PlanBot)
const AIAssistant = {
  isOpen: false,
  history: [],
  isTyping: false,
  apiKey: localStorage.getItem('planmaster_gemini_key') || '',
  provider: localStorage.getItem('planmaster_ai_provider') || 'builtin',

  init() {
    this.drawer = document.getElementById('ai-drawer');
    this.messagesContainer = document.getElementById('ai-messages');
    this.input = document.getElementById('ai-input');
    this.sendBtn = document.getElementById('ai-send-btn');
    this.toggleBtn = document.getElementById('btn-toggle-ai');
    this.closeBtn = document.getElementById('btn-close-ai');
    this.quickPromptsContainer = document.getElementById('ai-quick-prompts');
    this.settingsBtn = document.getElementById('btn-ai-settings');

    // Attach event listeners
    this.toggleBtn.addEventListener('click', () => this.toggleDrawer());
    this.closeBtn.addEventListener('click', () => this.closeDrawer());
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => this.openSettingsModal());
    }

    // Quick prompts
    this.setupQuickPrompts();

    // Welcome greeting if empty
    if (this.history.length === 0) {
      this.addBotMessage(
        `👋 Xin chào! Tôi là **Trợ lý AI Lập Kế Hoạch** (PlanBot).\n\n` +
        `Tôi có thể giúp bạn:\n` +
        `• Lập lộ trình mục tiêu (học ngoại ngữ, tập gym, kinh doanh, đọc sách,...)\n` +
        `• Bẻ nhỏ mục tiêu lớn thành các công việc cụ thể theo phương pháp SMART\n` +
        `• Tự động xuất việc vào bảng quản lý chỉ với 1 cú click!\n\n` +
        `*Bạn muốn lên kế hoạch cho mục tiêu gì hôm nay? Hãy chọn gợi ý bên dưới hoặc gõ tin nhắn nhé!*`
      );
    }
  },

  setupQuickPrompts() {
    const prompts = [
      { label: '🌿 Cân bằng tâm lý & Giảm stress', text: 'Tôi đang cảm thấy khá mệt mỏi và áp lực công việc, hãy giúp tôi lên kế hoạch giảm tải và các thói quen thư giãn phục hồi năng lượng' },
      { label: '🎯 Ôn thi IELTS 30 ngày', text: 'Tôi muốn lập kế hoạch ôn thi IELTS trong 30 ngày để bứt phá band điểm, hãy chia nhỏ lộ trình giúp tôi' },
      { label: '💪 Giảm cân & Tập Gym 4 tuần', text: 'Hãy lập cho tôi kế hoạch tập gym và ăn uống lành mạnh giảm 2-3kg trong 4 tuần' },
      { label: '🚀 Khởi nghiệp mở quán cafe', text: 'Lập kế hoạch các bước chuẩn bị mở một quán cà phê nhỏ từ nghiên cứu đến khai trương' },
      { label: '📚 Rèn thói quen đọc sách', text: 'Giúp tôi lập kế hoạch rèn luyện thói quen đọc sách 30 phút mỗi ngày và ghi chép bài học' }
    ];

    if (!this.quickPromptsContainer) return;
    this.quickPromptsContainer.innerHTML = '';
    prompts.forEach(p => {
      const chip = document.createElement('button');
      chip.className = 'quick-chip';
      chip.textContent = p.label;
      chip.addEventListener('click', () => {
        this.input.value = p.text;
        this.handleSend();
      });
      this.quickPromptsContainer.appendChild(chip);
    });
  },

  toggleDrawer() {
    if (this.isOpen) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  },

  openDrawer() {
    this.isOpen = true;
    this.drawer.classList.add('open');
    setTimeout(() => this.input.focus(), 300);
  },

  closeDrawer() {
    this.isOpen = false;
    this.drawer.classList.remove('open');
  },

  addUserMessage(text) {
    this.history.push({ role: 'user', content: text });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.innerHTML = `<div class="bubble-body">${this.escapeHTML(text)}</div>`;
    this.messagesContainer.appendChild(bubble);
    this.scrollToBottom();
  },

  addBotMessage(markdownText, suggestedTasks = []) {
    this.history.push({ role: 'assistant', content: markdownText });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot';

    const formattedHtml = this.parseMarkdown(markdownText);
    let tasksHtml = '';

    if (suggestedTasks && suggestedTasks.length > 0) {
      tasksHtml = `
        <div class="ai-suggested-tasks">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
            <strong style="font-size: 0.8rem; color: var(--primary);">📋 Đề xuất ${suggestedTasks.length} kế hoạch:</strong>
            <button class="btn btn-primary" style="padding: 0.25rem 0.65rem; font-size: 0.725rem;" id="btn-import-all-${Date.now()}">
              ${Icons.get('sparkles', '', 14)} Thêm tất cả vào bảng
            </button>
          </div>
          ${suggestedTasks.map((t, idx) => `
            <div class="ai-task-card" data-idx="${idx}">
              <div class="ai-task-title">${this.escapeHTML(t.title)}</div>
              <div class="ai-task-meta">
                <span class="badge badge-priority-${t.priority}">Ưu tiên: ${this.translatePriority(t.priority)}</span>
                <span class="badge badge-category">${this.escapeHTML(t.category || 'Công việc')}</span>
                <span style="color: var(--text-muted);">${Icons.get('calendar', '', 12)} Hạn: ${t.dueDate}</span>
              </div>
              ${t.description ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${this.escapeHTML(t.description)}</div>` : ''}
              ${t.subtasks && t.subtasks.length > 0 ? `
                <ul class="ai-task-subtasks">
                  ${t.subtasks.map(st => `<li>${this.escapeHTML(st.title || st)}</li>`).join('')}
                </ul>
              ` : ''}
              <button class="ai-import-btn" data-action="import-single" data-index="${idx}">
                ${Icons.get('plus', '', 12)} Thêm vào kế hoạch
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    bubble.innerHTML = `
      <div class="bubble-body">
        ${formattedHtml}
        ${tasksHtml}
      </div>
    `;

    this.messagesContainer.appendChild(bubble);

    // Bind click events for import buttons
    const importAllBtn = bubble.querySelector('[id^="btn-import-all-"]');
    if (importAllBtn) {
      importAllBtn.addEventListener('click', () => {
        App.importBatchPlans(suggestedTasks);
        importAllBtn.disabled = true;
        importAllBtn.innerHTML = `${Icons.get('check', '', 14)} Đã thêm toàn bộ vào bảng!`;
        importAllBtn.style.background = 'var(--status-completed)';
      });
    }

    const singleBtns = bubble.querySelectorAll('[data-action="import-single"]');
    singleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        const taskData = suggestedTasks[idx];
        if (taskData) {
          App.createPlanFromAI(taskData);
          btn.disabled = true;
          btn.innerHTML = `${Icons.get('check', '', 12)} Đã thêm`;
          btn.style.color = 'var(--status-completed)';
          btn.style.background = 'transparent';
        }
      });
    });

    this.scrollToBottom();
  },

  showTyping() {
    this.isTyping = true;
    this.sendBtn.disabled = true;
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble bot';
    typingBubble.id = 'ai-typing-indicator';
    typingBubble.innerHTML = `
      <div class="bubble-body">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(typingBubble);
    this.scrollToBottom();
  },

  hideTyping() {
    this.isTyping = false;
    this.sendBtn.disabled = false;
    const indicator = document.getElementById('ai-typing-indicator');
    if (indicator) indicator.remove();
  },

  async handleSend() {
    const text = this.input.value.trim();
    if (!text || this.isTyping) return;

    this.addUserMessage(text);
    this.input.value = '';
    this.showTyping();

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: this.history,
          apiKey: this.apiKey,
          provider: this.provider
        })
      });

      const data = await response.json();
      this.hideTyping();

      if (data.success) {
        this.addBotMessage(data.reply, data.suggestedTasks || []);
      } else {
        this.addBotMessage(`⚠️ Lỗi: ${data.error || 'Không thể nhận phản hồi từ AI'}`);
      }
    } catch (err) {
      console.warn('Kết nối API server gián đoạn, sử dụng bộ xử lý AI cục bộ:', err);
      this.hideTyping();
      const localResult = this.generateLocalAIResponse(text);
      this.addBotMessage(localResult.reply, localResult.suggestedTasks);
    }
  },

  generateLocalAIResponse(userMessage) {
    const msg = (userMessage || '').toLowerCase();
    const now = new Date();
    const formatDate = (days) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    if (msg.includes('tiếng anh') || msg.includes('ielts') || msg.includes('toeic') || msg.includes('học')) {
      return {
        reply: `🎯 **Lộ trình học tập & bứt phá mục tiêu:**\n\n1. **Chia nhỏ thời gian:** Học cố định 45-60 phút mỗi sáng sớm.\n2. **Input trước, Output sau:** Ưu tiên 3000 từ vựng cốt lõi và luyện nghe trước khi luyện nói/viết.\n3. **Đánh giá hàng tuần:** Làm 1 bài mini-test vào cuối tuần để đo lường.\n\n*Tôi đã chia nhỏ 3 mục tiêu cụ thể dưới đây, bạn có thể thêm ngay vào kế hoạch:*`,
        suggestedTasks: [
          {
            title: 'Học 20 từ vựng học thuật mới mỗi ngày',
            description: 'Sử dụng flashcard/Anki theo phương pháp Spaced Repetition.',
            category: 'Học tập',
            priority: 'high',
            status: 'todo',
            startDate: formatDate(0),
            dueDate: formatDate(7),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chọn 1 chủ đề từ vựng quen thuộc', completed: false },
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Ôn tập 3 lần trong ngày', completed: false }
            ]
          },
          {
            title: 'Luyện nghe phản xạ Shadowing 30 phút/ngày',
            description: 'Vừa nghe podcast vừa nhắc lại theo ngữ điệu người bản ngữ.',
            category: 'Học tập',
            priority: 'medium',
            status: 'todo',
            startDate: formatDate(1),
            dueDate: formatDate(14),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Nghe 1 tập podcast BBC 6 Minute', completed: false }
            ]
          }
        ]
      };
    } else if (msg.includes('gym') || msg.includes('giảm cân') || msg.includes('chạy bộ') || msg.includes('sức khỏe')) {
      return {
        reply: `💪 **Kế hoạch cải thiện thể chất & vóc dáng:**\n\n1. **Dinh dưỡng 80%, Tập luyện 20%:** Hạn chế đồ ngọt, dầu mỡ; uống đủ 2-2.5L nước.\n2. **Tính nhất quán:** Duy trì 3-4 buổi mỗi tuần thay vì tập quá sức.\n3. **Theo dõi:** Đo vòng eo và cân nặng vào sáng thứ Hai.`,
        suggestedTasks: [
          {
            title: 'Thiết lập thực đơn thâm hụt calo lành mạnh',
            description: 'Chuẩn bị đồ ăn trưa giàu đạm và rau xanh, giảm tinh bột nhanh.',
            category: 'Sức khỏe',
            priority: 'high',
            status: 'todo',
            startDate: formatDate(0),
            dueDate: formatDate(7),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Chuẩn bị thực đơn cho cả tuần', completed: false },
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Uống tối thiểu 2 lít nước/ngày', completed: false }
            ]
          },
          {
            title: 'Tập cardio / chạy bộ 3 buổi mỗi tuần',
            description: 'Chạy bộ xen kẽ đi bộ nhanh 30-40 phút vào các ngày thứ 3, 5, 7.',
            category: 'Sức khỏe',
            priority: 'medium',
            status: 'todo',
            startDate: formatDate(1),
            dueDate: formatDate(21),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Khởi động khớp 10 phút', completed: false }
            ]
          }
        ]
      };
    } else {
      return {
        reply: `💡 **Chiến lược hành động theo phương pháp S.M.A.R.T:**\n\nTôi đã phân tích mục tiêu: **"${userMessage.slice(0, 40)}"** và chia nhỏ thành các bước hành động khả thi dưới đây:`,
        suggestedTasks: [
          {
            title: `Khảo sát & Chuẩn bị: ${userMessage.slice(0, 35)}`,
            description: 'Xác định tiêu chí thành công, liệt kê các nguồn lực cần thiết.',
            category: 'Công việc',
            priority: 'high',
            status: 'todo',
            startDate: formatDate(0),
            dueDate: formatDate(3),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Liệt kê các bước chuẩn bị', completed: false }
            ]
          },
          {
            title: 'Triển khai giai đoạn trọng tâm',
            description: 'Tập trung vào 20% đầu việc mang lại 80% kết quả cốt lõi.',
            category: 'Công việc',
            priority: 'urgent',
            status: 'todo',
            startDate: formatDate(2),
            dueDate: formatDate(10),
            subtasks: [
              { id: 'sub_' + Math.random().toString(36).substr(2, 6), title: 'Thực hiện đầu việc ưu tiên số 1', completed: false }
            ]
          }
        ]
      };
    }
  },

  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 50);
  },

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  parseMarkdown(text) {
    if (!text) return '';
    let html = this.escapeHTML(text);

    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Inline code `code`
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    // Bullet points
    html = html.replace(/^• (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    // Numbered lists
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

    // Wrap list items
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Line breaks
    html = html.replace(/\n\n/g, '<br/><br/>');
    html = html.replace(/\n/g, '<br/>');

    return html;
  },

  translatePriority(p) {
    const map = {
      urgent: 'Khẩn cấp',
      high: 'Cao',
      medium: 'Trung bình',
      low: 'Thấp'
    };
    return map[p] || 'Trung bình';
  },

  openSettingsModal() {
    const modal = document.getElementById('modal-ai-settings');
    const input = document.getElementById('setting-gemini-key');
    const providerSelect = document.getElementById('setting-ai-provider');
    if (!modal) return;

    input.value = this.apiKey;
    providerSelect.value = this.provider;
    modal.classList.add('active');

    const saveBtn = document.getElementById('btn-save-ai-settings');
    const closeBtn = document.getElementById('btn-close-ai-settings');

    const handleSave = () => {
      this.apiKey = input.value.trim();
      this.provider = providerSelect.value;
      localStorage.setItem('planmaster_gemini_key', this.apiKey);
      localStorage.setItem('planmaster_ai_provider', this.provider);
      modal.classList.remove('active');
      App.showToast('Đã lưu cấu hình AI thành công!', 'success');
      saveBtn.removeEventListener('click', handleSave);
    };

    saveBtn.onclick = handleSave;
    closeBtn.onclick = () => modal.classList.remove('active');
  }
};

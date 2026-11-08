// Mental Health & Psychological Wellbeing Module
const MentalHealth = {
  currentRecord: null,
  history: [],
  moodOptions: [
    { key: 'great', emoji: '🌟', label: 'Rất Phấn Chấn', desc: 'Tràn đầy năng lượng & tự tin', scoreFactor: 100 },
    { key: 'good', emoji: '😊', label: 'Bình Yên', desc: 'Cảm giác thoải mái, ổn định', scoreFactor: 85 },
    { key: 'neutral', emoji: '😐', label: 'Bình Thường', desc: 'Không vui không buồn, tạm ổn', scoreFactor: 70 },
    { key: 'stressed', emoji: '😣', label: 'Căng Thẳng', desc: 'Nhiều áp lực đè nặng', scoreFactor: 45 },
    { key: 'exhausted', emoji: '😫', label: 'Kiệt Sức', desc: 'Quá tải, muốn buông xuôi', scoreFactor: 25 }
  ],

  init() {
    this.container = document.getElementById('mental-health-section');
    this.loadHistory();
    this.render();
  },

  async loadHistory() {
    try {
      const res = await fetch('/api/mental-health');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.history = data.data;
      } else {
        this.history = JSON.parse(localStorage.getItem('planmaster_mental_history') || '[]');
      }
    } catch (e) {
      this.history = JSON.parse(localStorage.getItem('planmaster_mental_history') || '[]');
    }
    this.renderHistory();
  },

  saveLocalHistory() {
    try {
      localStorage.setItem('planmaster_mental_history', JSON.stringify(this.history));
    } catch (e) {}
  },

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="mental-health-wrapper">
        <!-- Hero Introduction Banner -->
        <div class="mental-hero-card">
          <div class="mental-hero-content">
            <div class="mental-hero-badge">
              ${Icons.get('sparkles', '', 14)} Trắc Nghiệm Tâm Lý & Cân Bằng Tinh Thần
            </div>
            <h2>Lắng Nghe Tâm Trí - Tối Ưu Năng Suất</h2>
            <p>Khảo sát nhanh trạng thái tinh thần của bạn hôm nay. Hệ thống sẽ tự động đo lường mức độ stress, đưa ra lời khuyên khoa học và kết nối với Trợ lý AI để điều chỉnh lại lịch trình công việc phù hợp nhất.</p>
          </div>
          <div class="mental-hero-illustration">
            <span style="font-size: 3.5rem;">🧘‍♂️</span>
          </div>
        </div>

        <div class="mental-grid">
          <!-- Survey Form -->
          <div class="mental-form-card" id="mental-survey-form-container">
            <h3 class="section-title">
              <span>🩺 Bảng Khảo Sát Tâm Lý Nhanh</span>
              <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">(Dựa trên thang đo WHO-5 & PHQ-4)</span>
            </h3>

            <form id="mental-survey-form">
              <!-- AI Camera Prompt Banner -->
              <div style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem; background: var(--bg-muted); padding: 0.75rem 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--primary);">
                <span style="font-size: 1.4rem;">📷</span>
                <div style="flex: 1; font-size: 0.8rem; color: var(--text-secondary);">
                  <strong>Chưa chắc chắn về cảm xúc của mình?</strong> Hãy dùng Camera AI nhận diện biểu cảm thời gian thực bằng Google Teachable Machine.
                </div>
                <button type="button" class="btn btn-secondary" id="btn-goto-tm" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; white-space: nowrap;">
                  Bật Camera AI
                </button>
              </div>

              <!-- Question 1: Mood Choice -->
              <div class="survey-question-group">
                <label class="survey-label">1. Cảm xúc chủ đạo của bạn hôm nay là gì?</label>
                <div class="mood-selector-grid">
                  ${this.moodOptions.map(m => `
                    <label class="mood-option-item" data-mood="${m.key}">
                      <input type="radio" name="survey-mood" value="${m.key}" ${m.key === 'good' ? 'checked' : ''} />
                      <span class="mood-emoji">${m.emoji}</span>
                      <span class="mood-name">${m.label}</span>
                      <span class="mood-sub">${m.desc}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <!-- Question 2: Stress Slider -->
              <div class="survey-question-group">
                <div class="slider-header">
                  <label class="survey-label">2. Mức độ áp lực / Căng thẳng (Stress)</label>
                  <span class="slider-value-badge" id="stress-slider-val">5 / 10</span>
                </div>
                <input type="range" min="1" max="10" value="5" class="range-slider stress-slider" id="input-stress-level" />
                <div class="slider-labels">
                  <span>1: Hoàn toàn thư thái</span>
                  <span>5: Áp lực vừa phải</span>
                  <span>10: Cực kỳ căng thẳng</span>
                </div>
              </div>

              <!-- Question 3: Energy Slider -->
              <div class="survey-question-group">
                <div class="slider-header">
                  <label class="survey-label">3. Mức năng lượng & Độ tỉnh táo thể chất</label>
                  <span class="slider-value-badge" id="energy-slider-val">6 / 10</span>
                </div>
                <input type="range" min="1" max="10" value="6" class="range-slider energy-slider" id="input-energy-level" />
                <div class="slider-labels">
                  <span>1: Kiệt sức / Uể oải</span>
                  <span>5: Bình thường</span>
                  <span>10: Tràn đầy sinh lực</span>
                </div>
              </div>

              <!-- Scientific Checklist Questions -->
              <div class="survey-question-group">
                <label class="survey-label">4. Tự đánh giá trong 48 giờ qua:</label>
                <div class="checklist-questions">
                  <div class="checklist-item">
                    <span class="checklist-text">• Bạn có cảm thấy lo lắng, bất an hoặc khó ngồi yên?</span>
                    <select class="form-control select-compact" id="q-anxiety">
                      <option value="0">Không bao giờ (0đ)</option>
                      <option value="1">Thỉnh thoảng (1đ)</option>
                      <option value="2">Khá thường xuyên (2đ)</option>
                      <option value="3">Gần như liên tục (3đ)</option>
                    </select>
                  </div>

                  <div class="checklist-item">
                    <span class="checklist-text">• Bạn có còn cảm thấy hứng thú khi bắt tay vào kế hoạch?</span>
                    <select class="form-control select-compact" id="q-interest">
                      <option value="0">Hào hứng, thích thú (0đ)</option>
                      <option value="1">Tương đối ổn (1đ)</option>
                      <option value="2">Hơi mất động lực (2đ)</option>
                      <option value="3">Hoàn toàn không có hứng thú (3đ)</option>
                    </select>
                  </div>

                  <div class="checklist-item">
                    <span class="checklist-text">• Chất lượng giấc ngủ & sự hồi phục ban đêm:</span>
                    <select class="form-control select-compact" id="q-sleep">
                      <option value="0">Ngủ sâu, thức dậy sảng khoái (0đ)</option>
                      <option value="1">Tạm ổn, có lúc tỉnh giấc (1đ)</option>
                      <option value="2">Khó ngủ, chập chờn (2đ)</option>
                      <option value="3">Mất ngủ, mệt mỏi cả ngày (3đ)</option>
                    </select>
                  </div>

                  <div class="checklist-item">
                    <span class="checklist-text">• Cảm giác khối lượng công việc hiện tại:</span>
                    <select class="form-control select-compact" id="q-overload">
                      <option value="0">Hoàn toàn kiểm soát được (0đ)</option>
                      <option value="1">Hơi bận rộn nhưng xử lý được (1đ)</option>
                      <option value="2">Bắt đầu thấy ngợp và áp lực (2đ)</option>
                      <option value="3">Quá tải nặng nề, kiệt quệ (3đ)</option>
                    </select>
                  </div>
                </div>
              </div>

              <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.8rem; font-size: 0.95rem; margin-top: 0.5rem;" id="btn-submit-survey">
                ${Icons.get('sparkles', '', 18)} Phân Tích Chỉ Số Tâm Lý Ngay
              </button>
            </form>
          </div>

          <!-- Result & Recommendations Column -->
          <div class="mental-result-col">
            <div id="mental-result-box" class="mental-result-card empty">
              <div class="empty-state" style="padding: 2.5rem 1rem;">
                <div class="empty-state-icon" style="font-size: 2rem;">🧠</div>
                <h4 style="color: var(--text-primary); margin-top: 0.5rem;">Chưa có kết quả phân tích</h4>
                <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 280px; text-align: center;">
                  Hãy hoàn thành bảng khảo sát bên trái để nhận chẩn đoán sức khỏe tinh thần và lời khuyên tối ưu lịch trình từ AI.
                </p>
              </div>
            </div>

            <!-- Survey History Card -->
            <div class="mental-history-card">
              <h4 style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                <span>📅 Nhật Ký Cảm Xúc Gần Đây</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);" id="history-count">0 lần khảo sát</span>
              </h4>
              <div id="mental-history-list" class="mental-history-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    if (this.history.length > 0) {
      this.displayResult(this.history[0]);
    }
  },

  bindEvents() {
    // Stress Slider Live Preview
    const stressSlider = document.getElementById('input-stress-level');
    const stressBadge = document.getElementById('stress-slider-val');
    if (stressSlider && stressBadge) {
      stressSlider.addEventListener('input', (e) => {
        stressBadge.textContent = `${e.target.value} / 10`;
      });
    }

    // Energy Slider Live Preview
    const energySlider = document.getElementById('input-energy-level');
    const energyBadge = document.getElementById('energy-slider-val');
    if (energySlider && energyBadge) {
      energySlider.addEventListener('input', (e) => {
        energyBadge.textContent = `${e.target.value} / 10`;
      });
    }

    // Form submit
    const form = document.getElementById('mental-survey-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.processSurvey();
      });
    }

    // Go to Teachable Machine camera button
    const gotoTmBtn = document.getElementById('btn-goto-tm');
    if (gotoTmBtn) {
      gotoTmBtn.addEventListener('click', () => {
        App.switchTab('tm');
      });
    }
  },

  processSurvey() {
    const moodEl = document.querySelector('input[name="survey-mood"]:checked');
    const moodKey = moodEl ? moodEl.value : 'good';
    const stressVal = Number(document.getElementById('input-stress-level').value);
    const energyVal = Number(document.getElementById('input-energy-level').value);

    const qAnxiety = Number(document.getElementById('q-anxiety').value);
    const qInterest = Number(document.getElementById('q-interest').value);
    const qSleep = Number(document.getElementById('q-sleep').value);
    const qOverload = Number(document.getElementById('q-overload').value);

    // Scoring Algorithm:
    // Base score from selected mood: 25 - 100
    const moodObj = this.moodOptions.find(m => m.key === moodKey) || this.moodOptions[1];
    let score = moodObj.scoreFactor;

    // Penalty from stress (1 to 10 -> -3 to -30)
    score -= (stressVal - 3) * 3.5;

    // Bonus/Penalty from energy (1 to 10 -> -15 to +15)
    score += (energyVal - 5) * 2.5;

    // Penalty from checklist (each 0 to 3 points -> up to -36)
    const checklistSum = qAnxiety + qInterest + qSleep + qOverload;
    score -= checklistSum * 3.5;

    // Clamp score between 10 and 100
    score = Math.round(Math.max(10, Math.min(100, score)));

    // Categorization
    let status = '';
    let statusClass = '';
    let recommendations = [];

    if (score >= 80) {
      status = '🌟 Tâm Trí Phấn Chấn & Thư Thái';
      statusClass = 'status-great';
      recommendations = [
        '✨ Bạn đang ở trạng thái tinh thần đỉnh cao! Đây là thời điểm vàng để tập trung vào mục tiêu quan trọng và sáng tạo nhất.',
        '🎯 Duy trì nhịp độ hiện tại, nhớ uống đủ 2 lít nước và duy trì thói quen ngủ lành mạnh.',
        '🚀 Bạn có thể nâng cao chỉ tiêu thử thách bản thân mà không sợ quá tải.'
      ];
    } else if (score >= 60) {
      status = '🌿 Ổn Định & Cân Bằng';
      statusClass = 'status-good';
      recommendations = [
        '👍 Trạng thái tâm lý tốt, tâm thế vững vàng để thực hiện các kế hoạch hàng ngày.',
        '⏱ Áp dụng kỹ thuật Pomodoro (làm 25 phút, nghỉ 5 phút) để duy trì sự bền bỉ.',
        '🚶‍♀️ Dành 15 phút đi dạo thư giãn mắt và giãn cơ sau các buổi làm việc dài.'
      ];
    } else if (score >= 40) {
      status = '⚠️ Căng Thẳng Mức Vừa';
      statusClass = 'status-warning';
      recommendations = [
        '🧘‍♂️ Bạn đang chịu áp lực khá lớn. Hãy tránh nhận thêm việc mới trong hôm nay.',
        '🌬 Thực hành nhịp thở 4-7-8 (Hít vào 4s - Giữ 7s - Thở ra 8s) để hạ nhịp tim và xoa dịu thần kinh.',
        '✂️ Nhờ AI rà soát và chuyển bớt các đầu việc không khẩn cấp sang tuần sau.'
      ];
    } else {
      status = '🚨 Nguy Cơ Kiệt Sức (Burnout Alert)';
      statusClass = 'status-danger';
      recommendations = [
        '🛑 BÁO ĐỘNG QUÁ TẢI: Bạn cần nghỉ ngơi chủ động ngay hôm nay để bảo vệ sức khỏe!',
        '📵 Tắt thông báo công việc sau giờ làm, đi ngủ sớm hơn 1 tiếng tối nay.',
        '🌿 Nhấn nút bên dưới để PlanBot AI tự động cắt giảm 50% khối lượng việc và thêm các bước hồi phục tinh thần.'
      ];
    }

    const newRecord = {
      id: 'mh_' + Date.now(),
      timestamp: new Date().toISOString(),
      mood: moodKey,
      moodEmoji: moodObj.emoji,
      stressLevel: stressVal,
      energyLevel: energyVal,
      score,
      status,
      statusClass,
      recommendations
    };

    this.history.unshift(newRecord);
    this.saveLocalHistory();
    this.displayResult(newRecord);
    this.renderHistory();

    // Send to backend
    fetch('/api/mental-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord)
    }).catch(() => {});

    App.showToast('Đã hoàn thành khảo sát sức khỏe tâm lý!', 'success');
  },

  displayResult(record) {
    const box = document.getElementById('mental-result-box');
    if (!box) return;

    box.className = `mental-result-card ${record.statusClass || ''}`;
    box.innerHTML = `
      <div class="result-header">
        <div class="result-score-circle">
          <div class="score-number">${record.score}</div>
          <div class="score-max">/ 100</div>
        </div>
        <div class="result-title-group">
          <div class="result-status-badge">${record.status}</div>
          <div class="result-date">Đánh giá lúc: ${new Date(record.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</div>
        </div>
      </div>

      <div class="result-metrics-bar">
        <div class="metric-pill">
          <span>Tâm trạng:</span> <strong>${record.moodEmoji || '😊'}</strong>
        </div>
        <div class="metric-pill">
          <span>Stress:</span> <strong>${record.stressLevel}/10</strong>
        </div>
        <div class="metric-pill">
          <span>Năng lượng:</span> <strong>${record.energyLevel}/10</strong>
        </div>
      </div>

      <div class="result-recommendations">
        <h4>💡 Khuyến Nghị Tinh Thần Cá Nhân Hoá:</h4>
        <ul>
          ${(record.recommendations || []).map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>

      <div class="result-ai-action">
        <button class="btn btn-ai-toggle" id="btn-sync-ai-mental" style="width: 100%; padding: 0.75rem; font-size: 0.85rem;">
          ${Icons.get('sparkles', '', 16)} Nhờ PlanBot AI Điều Chỉnh Lịch Trình
        </button>
      </div>
    `;

    const aiBtn = document.getElementById('btn-sync-ai-mental');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => {
        AIAssistant.openDrawer();
        const promptText = `Hôm nay tôi vừa làm khảo sát sức khỏe tâm lý. Điểm số của tôi là ${record.score}/100 (${record.status}). Mức độ stress hiện tại: ${record.stressLevel}/10, năng lượng: ${record.energyLevel}/10. Hãy phân tích và đề xuất cho tôi lộ trình điều chỉnh công việc, giảm bớt áp lực và chèn thêm các thói quen phục hồi năng lượng phù hợp.`;
        AIAssistant.input.value = promptText;
        AIAssistant.handleSend();
      });
    }
  },

  renderHistory() {
    const list = document.getElementById('mental-history-list');
    const countEl = document.getElementById('history-count');
    if (!list) return;

    if (countEl) countEl.textContent = `${this.history.length} lần khảo sát`;

    if (this.history.length === 0) {
      list.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">Chưa có dữ liệu lịch sử</div>`;
      return;
    }

    list.innerHTML = this.history.slice(0, 5).map(h => {
      const dateStr = new Date(h.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      return `
        <div class="history-item">
          <div class="history-left">
            <span class="history-emoji">${h.moodEmoji || '😊'}</span>
            <div>
              <div class="history-status">${h.status}</div>
              <div class="history-date">${dateStr} • Stress: ${h.stressLevel}/10</div>
            </div>
          </div>
          <div class="history-score">${h.score}đ</div>
        </div>
      `;
    }).join('');
  }
};

// Main Application Controller
const App = {
  plans: [],
  activeTab: 'plans', // 'plans' or 'mental'
  viewMode: 'kanban', // 'kanban' or 'list'
  searchQuery: '',
  filterCategory: 'all',
  filterPriority: 'all',
  filterSchedule: 'all', // 'all' or 'today_or_overdue'
  editingPlanId: null,
  planToDeleteId: null,
  deletedBackup: null,
  deferredPwaPrompt: null,
  theme: localStorage.getItem('planmaster_theme') || 'light',

  init() {
    this.applyTheme(this.theme);
    this.registerPWA();
    this.bindEvents();
    this.loadPlans();
    AIAssistant.init();
    ScheduleNotifications.init();
    MentalHealth.init();
    TeachableMachine.init();
  },

  registerPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => {
            console.log('PWA Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('PWA Service Worker registration failed:', err);
          });
      });
    }

    // PWA Install prompt listener
    const pwaBtn = document.getElementById('btn-pwa-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPwaPrompt = e;
      if (pwaBtn) {
        pwaBtn.style.display = 'inline-flex';
        pwaBtn.addEventListener('click', async () => {
          if (!this.deferredPwaPrompt) return;
          this.deferredPwaPrompt.prompt();
          const { outcome } = await this.deferredPwaPrompt.userChoice;
          if (outcome === 'accepted') {
            App.showToast('Cảm ơn bạn đã cài đặt PlanMaster AI!', 'success');
          }
          this.deferredPwaPrompt = null;
          pwaBtn.style.display = 'none';
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      if (pwaBtn) pwaBtn.style.display = 'none';
      this.deferredPwaPrompt = null;
    });
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    const plansTabBtn = document.getElementById('tab-btn-plans');
    const mentalTabBtn = document.getElementById('tab-btn-mental');
    const tmTabBtn = document.getElementById('tab-btn-tm');

    const plansContent = document.getElementById('plans-tab-content');
    const mentalContent = document.getElementById('mental-health-section');
    const tmContent = document.getElementById('teachable-machine-section');

    // Reset active buttons
    [plansTabBtn, mentalTabBtn, tmTabBtn].forEach(b => {
      if (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      }
    });

    // Hide all
    if (plansContent) plansContent.style.display = 'none';
    if (mentalContent) mentalContent.style.display = 'none';
    if (tmContent) tmContent.style.display = 'none';

    if (tabName === 'plans') {
      if (plansTabBtn) { plansTabBtn.classList.add('active'); plansTabBtn.setAttribute('aria-selected', 'true'); }
      if (plansContent) plansContent.style.display = 'block';
    } else if (tabName === 'mental') {
      if (mentalTabBtn) { mentalTabBtn.classList.add('active'); mentalTabBtn.setAttribute('aria-selected', 'true'); }
      if (mentalContent) mentalContent.style.display = 'block';
      if (window.MentalHealth) MentalHealth.render();
    } else if (tabName === 'tm') {
      if (tmTabBtn) { tmTabBtn.classList.add('active'); tmTabBtn.setAttribute('aria-selected', 'true'); }
      if (tmContent) tmContent.style.display = 'block';
      if (window.TeachableMachine) TeachableMachine.render();
    }
  },

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('planmaster_theme', theme);
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? Icons.get('sun', '', 18) : Icons.get('moon', '', 18);
      themeBtn.title = theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối';
    }
  },

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  },

  bindEvents() {
    // Navigation Tabs
    const tabPlans = document.getElementById('tab-btn-plans');
    const tabMental = document.getElementById('tab-btn-mental');
    const tabTm = document.getElementById('tab-btn-tm');
    if (tabPlans) tabPlans.addEventListener('click', () => this.switchTab('plans'));
    if (tabMental) tabMental.addEventListener('click', () => this.switchTab('mental'));
    if (tabTm) tabTm.addEventListener('click', () => this.switchTab('tm'));

    // Theme toggle
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // View switchers
    const viewKanbanBtn = document.getElementById('view-kanban-btn');
    const viewListBtn = document.getElementById('view-list-btn');
    if (viewKanbanBtn && viewListBtn) {
      viewKanbanBtn.addEventListener('click', () => this.switchView('kanban'));
      viewListBtn.addEventListener('click', () => this.switchView('list'));
    }

    // Search and filter inputs
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    const categoryFilter = document.getElementById('filter-category');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.filterCategory = e.target.value;
        this.render();
      });
    }

    const priorityFilter = document.getElementById('filter-priority');
    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        this.filterPriority = e.target.value;
        this.render();
      });
    }

    // Modal Add Plan Trigger
    const btnNewPlan = document.getElementById('btn-new-plan');
    if (btnNewPlan) {
      btnNewPlan.addEventListener('click', () => this.openPlanModal());
    }

    // Modal Plan Form Submit
    const planForm = document.getElementById('plan-form');
    if (planForm) {
      planForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handlePlanFormSubmit();
      });
    }

    // Modal Close buttons
    const btnClosePlanModal = document.getElementById('btn-close-plan-modal');
    const btnCancelPlan = document.getElementById('btn-cancel-plan');
    if (btnClosePlanModal) btnClosePlanModal.addEventListener('click', () => this.closePlanModal());
    if (btnCancelPlan) btnCancelPlan.addEventListener('click', () => this.closePlanModal());

    // Subtask add button in modal
    const btnAddSubtask = document.getElementById('btn-add-subtask-modal');
    if (btnAddSubtask) {
      btnAddSubtask.addEventListener('click', () => this.addSubtaskInput());
    }

    // Delete Modal triggers
    const btnConfirmDelete = document.getElementById('btn-confirm-delete');
    const btnCancelDelete = document.getElementById('btn-cancel-delete');
    const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', () => this.confirmDelete());
    if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
    if (btnCloseDeleteModal) btnCloseDeleteModal.addEventListener('click', () => this.closeDeleteModal());

    // Export button
    const btnExport = document.getElementById('btn-export-plans');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportPlans());
    }
  },

  async loadPlans() {
    try {
      const res = await fetch('/api/plans');
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        this.plans = data.data;
      } else {
        this.plans = JSON.parse(localStorage.getItem('planmaster_local_plans') || '[]');
      }
    } catch (err) {
      console.warn('Không thể tải plans từ server, dùng localStorage:', err);
      this.plans = JSON.parse(localStorage.getItem('planmaster_local_plans') || '[]');
    }

    if (!this.plans || this.plans.length === 0) {
      this.plans = this.getDefaultSamplePlans();
      this.saveLocalBackup();
    }
    this.render();
  },

  getDefaultSamplePlans() {
    return [
      {
        id: "plan_sample_1",
        title: "Hoàn thiện báo cáo phân tích chiến lược Q4",
        description: "Tổng hợp số liệu doanh thu, đánh giá KPI các phòng ban và đề xuất định hướng phát triển cho quý tiếp theo.",
        category: "Công việc",
        priority: "high",
        status: "in_progress",
        startDate: "2026-11-05",
        dueDate: "2026-11-12",
        tags: ["Báo cáo", "Chiến lược", "Q4"],
        subtasks: [
          { id: "sub_1", title: "Thu thập số liệu từ phòng tài chính và marketing", completed: true },
          { id: "sub_2", title: "Vẽ biểu đồ so sánh tăng trưởng doanh thu", completed: true },
          { id: "sub_3", title: "Viết phần kết luận và khuyến nghị hành động", completed: false },
          { id: "sub_4", title: "Gửi bản nháp cho trưởng bộ phận xem trước", completed: false }
        ]
      },
      {
        id: "plan_sample_2",
        title: "Luyện nghe và nói Tiếng Anh 30 phút mỗi ngày",
        description: "Duy trì thói quen luyện nghe qua podcast BBC 6 Minute English và ghi âm bài nói Shadowing.",
        category: "Học tập",
        priority: "medium",
        status: "in_progress",
        startDate: "2026-11-01",
        dueDate: "2026-11-30",
        tags: ["Tiếng Anh", "Tự học"],
        subtasks: [
          { id: "sub_5", title: "Nghe 1 tập podcast BBC vào mỗi buổi sáng", completed: true },
          { id: "sub_6", title: "Học 10 từ vựng chuyên ngành qua Anki", completed: true },
          { id: "sub_7", title: "Ghi âm nói theo phương pháp Shadowing 15 phút", completed: false }
        ]
      },
      {
        id: "plan_sample_3",
        title: "Kế hoạch rèn luyện thể lực: Chạy bộ 5km",
        description: "Nâng cao sức bền tim mạch, duy trì lịch chạy 3 buổi/tuần vào khung giờ 6h00 sáng.",
        category: "Sức khỏe",
        priority: "high",
        status: "todo",
        startDate: "2026-11-08",
        dueDate: "2026-11-28",
        tags: ["Thể thao", "Sức khỏe"],
        subtasks: [
          { id: "sub_8", title: "Khởi động kỹ khớp gối và cổ chân 10 phút", completed: false },
          { id: "sub_9", title: "Chạy xen kẽ đi bộ nhanh đạt cự ly 3km", completed: false },
          { id: "sub_10", title: "Nâng cự ly lên 5km liên tục", completed: false }
        ]
      },
      {
        id: "plan_sample_4",
        title: "Đọc và tổng kết cuốn sách 'Atomic Habits'",
        description: "Đúc kết các nguyên lý xây dựng thói quen tốt và loại bỏ thói quen xấu vào ứng dụng ghi chú cá nhân.",
        category: "Cá nhân",
        priority: "low",
        status: "completed",
        startDate: "2026-10-20",
        dueDate: "2026-11-04",
        tags: ["Đọc sách", "Kỹ năng"],
        subtasks: [
          { id: "sub_11", title: "Đọc phần 1 & 2: Định luật tạo sự rõ ràng và hấp dẫn", completed: true },
          { id: "sub_12", title: "Đọc phần 3 & 4: Định luật làm cho dễ dàng và thỏa mãn", completed: true },
          { id: "sub_13", title: "Tạo mindmap tóm tắt 4 định luật cốt lõi", completed: true }
        ]
      },
      {
        id: "plan_sample_5",
        title: "Lập bảng cân đối chi tiêu & Quỹ dự phòng cá nhân",
        description: "Rà soát lại toàn bộ nguồn thu nhập, cố định các khoản chi thiết yếu và chuyển 20% vào quỹ dự phòng.",
        category: "Tài chính",
        priority: "urgent",
        status: "todo",
        startDate: "2026-11-08",
        dueDate: "2026-11-10",
        tags: ["Tài chính", "Tiết kiệm"],
        subtasks: [
          { id: "sub_14", title: "Thống kê sao kê chi tiêu tháng trước", completed: false },
          { id: "sub_15", title: "Phân bổ ngân sách theo quy tắc 50/30/20", completed: false },
          { id: "sub_16", title: "Thiết lập chuyển khoản tiết kiệm tự động", completed: false }
        ]
      }
    ];
  },

  saveLocalBackup() {
    try {
      localStorage.setItem('planmaster_local_plans', JSON.stringify(this.plans));
    } catch (e) {
      console.error('LocalStorage write error:', e);
    }
  },

  switchView(mode) {
    this.viewMode = mode;
    document.getElementById('view-kanban-btn').classList.toggle('active', mode === 'kanban');
    document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
    document.getElementById('kanban-view').style.display = mode === 'kanban' ? 'grid' : 'none';
    document.getElementById('list-view').style.display = mode === 'list' ? 'flex' : 'none';
    this.render();
  },

  filterBySchedule(mode) {
    this.filterSchedule = mode;
    this.switchView('list');
    this.render();
    if (mode === 'today_or_overdue') {
      this.showToast('Đang lọc các kế hoạch đến hạn hôm nay & quá hạn', 'info');
    }
  },

  getFilteredPlans() {
    return this.plans.filter(p => {
      // Schedule filter (today or overdue)
      if (this.filterSchedule === 'today_or_overdue') {
        const todayStr = new Date().toISOString().split('T')[0];
        const isTodayOrOverdue = p.dueDate && (p.dueDate <= todayStr) && p.status !== 'completed';
        if (!isTodayOrOverdue) return false;
      }

      // Search
      const matchSearch = !this.searchQuery ||
        p.title.toLowerCase().includes(this.searchQuery) ||
        (p.description && p.description.toLowerCase().includes(this.searchQuery)) ||
        (p.tags && p.tags.some(t => t.toLowerCase().includes(this.searchQuery)));

      // Category
      const matchCategory = this.filterCategory === 'all' || p.category === this.filterCategory;

      // Priority
      const matchPriority = this.filterPriority === 'all' || p.priority === this.filterPriority;

      return matchSearch && matchCategory && matchPriority;
    });
  },

  render() {
    this.renderStats();
    if (this.viewMode === 'kanban') {
      this.renderKanban();
    } else {
      this.renderList();
    }
    if (window.ScheduleNotifications && ScheduleNotifications.checkTaskDeadlines) {
      ScheduleNotifications.checkTaskDeadlines();
    }
  },

  renderStats() {
    const total = this.plans.length;
    const completed = this.plans.filter(p => p.status === 'completed').length;
    const inProgress = this.plans.filter(p => p.status === 'in_progress').length;
    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

    const totalEl = document.getElementById('stat-total');
    const inProgressEl = document.getElementById('stat-in-progress');
    const completedEl = document.getElementById('stat-completed');
    const rateEl = document.getElementById('stat-rate');

    if (totalEl) totalEl.textContent = total;
    if (inProgressEl) inProgressEl.textContent = inProgress;
    if (completedEl) completedEl.textContent = completed;
    if (rateEl) rateEl.textContent = `${rate}%`;
  },

  renderKanban() {
    const filtered = this.getFilteredPlans();
    const todoList = filtered.filter(p => p.status === 'todo');
    const inProgressList = filtered.filter(p => p.status === 'in_progress');
    const completedList = filtered.filter(p => p.status === 'completed');

    document.getElementById('count-todo').textContent = todoList.length;
    document.getElementById('count-in_progress').textContent = inProgressList.length;
    document.getElementById('count-completed').textContent = completedList.length;

    const renderColumn = (containerId, items) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (items.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">${Icons.get('circle', '', 24)}</div>
            <p>Chưa có kế hoạch nào</p>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(p => this.createCardHTML(p)).join('');
      this.attachCardEventListeners(container);
    };

    renderColumn('column-todo-items', todoList);
    renderColumn('column-in_progress-items', inProgressList);
    renderColumn('column-completed-items', completedList);
  },

  renderList() {
    const container = document.getElementById('list-view');
    if (!container) return;

    const filtered = this.getFilteredPlans();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 4rem 1rem;">
          <div class="empty-state-icon">${Icons.get('search', '', 28)}</div>
          <p style="font-size: 1rem; font-weight: 500;">Không tìm thấy kế hoạch phù hợp</p>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Thử đổi bộ lọc hoặc thêm kế hoạch mới</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      const isCompleted = p.status === 'completed';
      const subtasks = p.subtasks || [];
      const completedSubtasks = subtasks.filter(s => s.completed).length;

      return `
        <div class="list-item" data-id="${p.id}">
          <div class="list-item-left">
            <input type="checkbox" class="list-item-checkbox" ${isCompleted ? 'checked' : ''} data-action="toggle-status" title="Đánh dấu hoàn thành" />
            <div class="list-item-content">
              <div class="list-item-title ${isCompleted ? 'completed' : ''}">${this.escapeHTML(p.title)}</div>
              <div class="list-item-meta">
                <span class="badge badge-priority-${p.priority}">Ưu tiên ${this.translatePriority(p.priority)}</span>
                <span class="badge badge-category">${this.escapeHTML(p.category)}</span>
                <span>${Icons.get('calendar', '', 12)} Hạn: ${p.dueDate || 'Chưa đặt'}</span>
                ${subtasks.length > 0 ? `<span>${Icons.get('checkCircle', '', 12)} ${completedSubtasks}/${subtasks.length} mục</span>` : ''}
              </div>
            </div>
          </div>
          <div class="list-item-right">
            <select class="status-changer-select" data-action="change-status">
              <option value="todo" ${p.status === 'todo' ? 'selected' : ''}>📌 Cần làm</option>
              <option value="in_progress" ${p.status === 'in_progress' ? 'selected' : ''}>⚡ Đang làm</option>
              <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>✅ Hoàn thành</option>
            </select>
            <div class="card-actions">
              <button class="card-action-btn" data-action="edit" title="Chỉnh sửa">${Icons.get('edit', '', 16)}</button>
              <button class="card-action-btn btn-delete" data-action="delete" title="Xoá">${Icons.get('trash', '', 16)}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.attachCardEventListeners(container);
  },

  createCardHTML(p) {
    const isCompleted = p.status === 'completed';
    const subtasks = p.subtasks || [];
    const completedSub = subtasks.filter(s => s.completed).length;
    const progressPercent = subtasks.length > 0 ? Math.round((completedSub / subtasks.length) * 100) : 0;

    // Check overdue
    const isOverdue = !isCompleted && p.dueDate && new Date(p.dueDate) < new Date(new Date().setHours(0,0,0,0));

    return `
      <div class="plan-card" data-id="${p.id}">
        <div class="card-header">
          <div class="card-title ${isCompleted ? 'completed' : ''}">${this.escapeHTML(p.title)}</div>
          <div class="card-actions">
            <button class="card-action-btn" data-action="edit" title="Sửa kế hoạch">${Icons.get('edit', '', 14)}</button>
            <button class="card-action-btn btn-delete" data-action="delete" title="Xoá kế hoạch">${Icons.get('trash', '', 14)}</button>
          </div>
        </div>

        <div class="card-meta-tags">
          <span class="badge badge-priority-${p.priority}">${this.translatePriority(p.priority)}</span>
          <span class="badge badge-category">${this.escapeHTML(p.category)}</span>
        </div>

        ${p.description ? `<p class="card-desc">${this.escapeHTML(p.description)}</p>` : ''}

        ${subtasks.length > 0 ? `
          <div class="card-progress">
            <div class="progress-header">
              <span>Tiến độ các bước</span>
              <span><strong>${completedSub}/${subtasks.length}</strong> (${progressPercent}%)</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${isCompleted || progressPercent === 100 ? 'completed' : ''}" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
        ` : ''}

        <div class="card-footer">
          <div class="card-date ${isOverdue ? 'overdue' : ''}">
            ${Icons.get(isOverdue ? 'alert' : 'calendar', '', 13)}
            <span>${p.dueDate || 'Chưa đặt hạn'} ${isOverdue ? '(Quá hạn)' : ''}</span>
          </div>

          <select class="status-changer-select" data-action="change-status">
            <option value="todo" ${p.status === 'todo' ? 'selected' : ''}>📌 Cần làm</option>
            <option value="in_progress" ${p.status === 'in_progress' ? 'selected' : ''}>⚡ Đang làm</option>
            <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>✅ Xong</option>
          </select>
        </div>
      </div>
    `;
  },

  attachCardEventListeners(parentContainer) {
    // Edit buttons
    parentContainer.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').getAttribute('data-id');
        this.openPlanModal(id);
      });
    });

    // Delete buttons
    parentContainer.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('[data-id]').getAttribute('data-id');
        this.promptDelete(id);
      });
    });

    // Status select change
    parentContainer.querySelectorAll('[data-action="change-status"]').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = e.target.closest('[data-id]').getAttribute('data-id');
        this.updatePlanStatus(id, e.target.value);
      });
    });

    // Checkbox toggle status
    parentContainer.querySelectorAll('[data-action="toggle-status"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = e.target.closest('[data-id]').getAttribute('data-id');
        this.updatePlanStatus(id, e.target.checked ? 'completed' : 'todo');
      });
    });
  },

  // Modal Open/Close for Add/Edit
  openPlanModal(planId = null) {
    this.editingPlanId = planId;
    const modal = document.getElementById('modal-plan-form');
    const modalTitle = document.getElementById('modal-plan-title');
    const subtasksContainer = document.getElementById('subtasks-builder-list');

    modalTitle.textContent = planId ? 'Chỉnh Sửa Kế Hoạch' : 'Tạo Kế Hoạch Mới';
    subtasksContainer.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];

    if (planId) {
      const plan = this.plans.find(p => p.id === planId);
      if (!plan) return;

      document.getElementById('plan-input-title').value = plan.title || '';
      document.getElementById('plan-input-desc').value = plan.description || '';
      document.getElementById('plan-input-category').value = plan.category || 'Công việc';
      document.getElementById('plan-input-priority').value = plan.priority || 'medium';
      document.getElementById('plan-input-status').value = plan.status || 'todo';
      document.getElementById('plan-input-start').value = plan.startDate || todayStr;
      document.getElementById('plan-input-due').value = plan.dueDate || todayStr;
      document.getElementById('plan-input-tags').value = (plan.tags || []).join(', ');

      // Populate subtasks
      (plan.subtasks || []).forEach(st => {
        this.addSubtaskInput(st.title, st.completed, st.id);
      });
    } else {
      // New plan defaults
      document.getElementById('plan-input-title').value = '';
      document.getElementById('plan-input-desc').value = '';
      document.getElementById('plan-input-category').value = 'Công việc';
      document.getElementById('plan-input-priority').value = 'medium';
      document.getElementById('plan-input-status').value = 'todo';
      document.getElementById('plan-input-start').value = todayStr;
      document.getElementById('plan-input-due').value = todayStr;
      document.getElementById('plan-input-tags').value = '';

      // Add one empty subtask by default
      this.addSubtaskInput('');
    }

    modal.classList.add('active');
    setTimeout(() => document.getElementById('plan-input-title').focus(), 150);
  },

  closePlanModal() {
    const modal = document.getElementById('modal-plan-form');
    modal.classList.remove('active');
    this.editingPlanId = null;
  },

  addSubtaskInput(title = '', completed = false, id = null) {
    const container = document.getElementById('subtasks-builder-list');
    const subtaskId = id || 'sub_' + Math.random().toString(36).substr(2, 7);

    const row = document.createElement('div');
    row.className = 'subtask-item-row';
    row.dataset.id = subtaskId;
    row.innerHTML = `
      <input type="checkbox" ${completed ? 'checked' : ''} class="subtask-item-chk" title="Hoàn thành" />
      <input type="text" class="subtask-item-input" placeholder="Nội dung bước thực hiện..." value="${this.escapeHTML(title)}" />
      <button type="button" class="btn-remove-subtask" title="Xoá bước này">${Icons.get('x', '', 16)}</button>
    `;

    row.querySelector('.btn-remove-subtask').addEventListener('click', () => row.remove());
    container.appendChild(row);
  },

  async handlePlanFormSubmit() {
    const title = document.getElementById('plan-input-title').value.trim();
    if (!title) {
      this.showToast('Vui lòng nhập tiêu đề kế hoạch!', 'error');
      return;
    }

    const description = document.getElementById('plan-input-desc').value.trim();
    const category = document.getElementById('plan-input-category').value;
    const priority = document.getElementById('plan-input-priority').value;
    const status = document.getElementById('plan-input-status').value;
    const startDate = document.getElementById('plan-input-start').value;
    const dueDate = document.getElementById('plan-input-due').value;
    const tagsRaw = document.getElementById('plan-input-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    // Read subtasks
    const subtasks = [];
    document.querySelectorAll('#subtasks-builder-list .subtask-item-row').forEach(row => {
      const text = row.querySelector('.subtask-item-input').value.trim();
      if (text) {
        subtasks.push({
          id: row.dataset.id,
          title: text,
          completed: row.querySelector('.subtask-item-chk').checked
        });
      }
    });

    const payload = {
      title,
      description,
      category,
      priority,
      status,
      startDate,
      dueDate,
      tags,
      subtasks
    };

    if (this.editingPlanId) {
      // Update existing
      await this.savePlanUpdate(this.editingPlanId, payload);
      this.showToast('Đã cập nhật kế hoạch thành công!', 'success');
    } else {
      // Create new
      await this.saveNewPlan(payload);
      this.showToast('Đã thêm kế hoạch mới thành công!', 'success');
    }

    this.closePlanModal();
  },

  async saveNewPlan(payload) {
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.data) {
        this.plans.unshift(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      // Local fallback
      const newPlan = {
        id: 'plan_' + Date.now(),
        ...payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.plans.unshift(newPlan);
    }
    this.saveLocalBackup();
    this.render();
  },

  async savePlanUpdate(id, payload) {
    try {
      const res = await fetch(`/api/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.data) {
        const idx = this.plans.findIndex(p => p.id === id);
        if (idx !== -1) this.plans[idx] = data.data;
      }
    } catch (err) {
      const idx = this.plans.findIndex(p => p.id === id);
      if (idx !== -1) {
        this.plans[idx] = { ...this.plans[idx], ...payload, updatedAt: new Date().toISOString() };
      }
    }
    this.saveLocalBackup();
    this.render();
  },

  async updatePlanStatus(id, newStatus) {
    const plan = this.plans.find(p => p.id === id);
    if (!plan) return;

    plan.status = newStatus;
    // If completed, optionally mark all subtasks completed
    if (newStatus === 'completed' && plan.subtasks) {
      plan.subtasks.forEach(s => s.completed = true);
    }

    try {
      await fetch(`/api/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, subtasks: plan.subtasks })
      });
    } catch (e) {
      console.warn('API error when updating status, local saved:', e);
    }

    this.saveLocalBackup();
    this.render();
    this.showToast(`Đã chuyển trạng thái sang "${this.translateStatus(newStatus)}"`, 'info');
  },

  // Delete Prompt & Confirmation
  promptDelete(id) {
    this.planToDeleteId = id;
    const plan = this.plans.find(p => p.id === id);
    const deleteModal = document.getElementById('modal-delete-confirm');
    const deleteTitle = document.getElementById('delete-plan-title');

    if (deleteTitle && plan) {
      deleteTitle.textContent = `"${plan.title}"`;
    }

    deleteModal.classList.add('active');
  },

  closeDeleteModal() {
    const deleteModal = document.getElementById('modal-delete-confirm');
    deleteModal.classList.remove('active');
    this.planToDeleteId = null;
  },

  async confirmDelete() {
    if (!this.planToDeleteId) return;
    const id = this.planToDeleteId;
    const planIndex = this.plans.findIndex(p => p.id === id);

    if (planIndex !== -1) {
      this.deletedBackup = {
        plan: this.plans[planIndex],
        index: planIndex
      };
      this.plans.splice(planIndex, 1);
    }

    this.closeDeleteModal();
    this.render();
    this.saveLocalBackup();

    // Call API in background
    try {
      await fetch(`/api/plans/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Error deleting on server:', e);
    }

    this.showToast('Đã xoá kế hoạch', 'info', true);
  },

  // Undo Delete
  async undoDelete() {
    if (!this.deletedBackup) return;
    const { plan, index } = this.deletedBackup;
    this.plans.splice(index, 0, plan);
    this.deletedBackup = null;
    this.render();
    this.saveLocalBackup();

    try {
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });
    } catch (e) {
      console.warn('Error restoring on server:', e);
    }

    this.showToast('Đã khôi phục kế hoạch thành công!', 'success');
  },

  // AI Import Hooks
  async createPlanFromAI(taskData) {
    await this.saveNewPlan(taskData);
    this.showToast(`Đã thêm "${taskData.title.slice(0, 30)}..." vào bảng!`, 'success');
  },

  async importBatchPlans(tasks) {
    try {
      const res = await fetch('/api/plans/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans: tasks })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        this.plans = [...data.data, ...this.plans];
      } else {
        throw new Error();
      }
    } catch (err) {
      // Fallback
      tasks.forEach(t => {
        this.plans.unshift({
          id: 'plan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          ...t,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
    }
    this.saveLocalBackup();
    this.render();
    this.showToast(`Đã thêm toàn bộ ${tasks.length} kế hoạch vào bảng!`, 'success');
  },

  exportPlans() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.plans, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ke_hoach_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Đã tải xuống file sao lưu kế hoạch!', 'success');
  },

  showToast(message, type = 'info', hasUndo = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${this.escapeHTML(message)}</span>
      ${hasUndo ? `<button class="toast-undo-btn" id="toast-undo-btn">Hoàn tác</button>` : ''}
    `;

    if (hasUndo) {
      const undoBtn = toast.querySelector('#toast-undo-btn');
      undoBtn.addEventListener('click', () => {
        this.undoDelete();
        toast.remove();
      });
    }

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  },

  translatePriority(p) {
    const map = { urgent: 'Khẩn cấp', high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
    return map[p] || 'Trung bình';
  },

  translateStatus(s) {
    const map = { todo: 'Cần làm', in_progress: 'Đang làm', completed: 'Hoàn thành' };
    return map[s] || s;
  },

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Auto start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Notification & Schedule Alert Engine
const ScheduleNotifications = {
  notifications: [],
  isDropdownOpen: false,
  hasRequestedPermission: false,
  lastNotifiedMap: {},

  init() {
    this.bellBtn = document.getElementById('btn-notification-bell');
    this.dropdown = document.getElementById('notification-dropdown');
    this.badge = document.getElementById('notification-badge');
    this.listContainer = document.getElementById('notification-list');
    this.banner = document.getElementById('urgent-schedule-banner');

    if (this.bellBtn) {
      this.bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isDropdownOpen && !e.target.closest('#notification-wrapper')) {
        this.closeDropdown();
      }
    });

    // Check permissions and notify
    this.checkTaskDeadlines();
    // Run checks periodically every 45 seconds
    setInterval(() => this.checkTaskDeadlines(), 45000);
  },

  async requestPermission() {
    if (!('Notification' in window)) {
      App.showToast('Trình duyệt của bạn không hỗ trợ thông báo đẩy', 'info');
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  },

  toggleDropdown() {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  },

  openDropdown() {
    this.isDropdownOpen = true;
    if (this.dropdown) this.dropdown.classList.add('active');
    this.renderDropdown();
  },

  closeDropdown() {
    this.isDropdownOpen = false;
    if (this.dropdown) this.dropdown.classList.remove('active');
  },

  playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      // Audio autoplay policy might block if no user interaction yet
    }
  },

  checkTaskDeadlines() {
    const plans = App.plans || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const overduePlans = [];
    const todayPlans = [];
    const tomorrowPlans = [];

    plans.forEach(p => {
      if (p.status === 'completed') return;
      if (!p.dueDate) return;

      const pDate = new Date(p.dueDate);
      pDate.setHours(0, 0, 0, 0);

      if (pDate < today) {
        overduePlans.push(p);
      } else if (p.dueDate === todayStr) {
        todayPlans.push(p);
      } else if (p.dueDate === tomorrowStr) {
        tomorrowPlans.push(p);
      }
    });

    const totalUrgent = overduePlans.length + todayPlans.length;

    // Update Navbar Badge
    if (this.badge) {
      if (totalUrgent > 0) {
        this.badge.textContent = totalUrgent > 9 ? '9+' : totalUrgent;
        this.badge.style.display = 'inline-flex';
      } else {
        this.badge.style.display = 'none';
      }
    }

    // Update Urgent Banner on top
    this.updateBanner(overduePlans, todayPlans);

    // Build notifications list
    this.notifications = [
      ...overduePlans.map(p => ({
        type: 'overdue',
        title: `🔴 QUÁ HẠN: ${p.title}`,
        desc: `Hạn chót: ${p.dueDate}. Vui lòng xử lý hoặc dời lịch!`,
        planId: p.id,
        priority: p.priority
      })),
      ...todayPlans.map(p => ({
        type: 'today',
        title: `⏰ CẦN LÀM HÔM NAY: ${p.title}`,
        desc: `Đến hạn hoàn thành trong ngày hôm nay!`,
        planId: p.id,
        priority: p.priority
      })),
      ...tomorrowPlans.map(p => ({
        type: 'tomorrow',
        title: `📅 Sắp đến hạn ngày mai: ${p.title}`,
        desc: `Chuẩn bị hoàn thành kế hoạch`,
        planId: p.id,
        priority: p.priority
      }))
    ];

    // Trigger Desktop Notification if there are critical items and not notified recently
    if (totalUrgent > 0 && Notification.permission === 'granted') {
      const alertKey = todayStr + '_' + totalUrgent;
      if (!this.lastNotifiedMap[alertKey]) {
        this.lastNotifiedMap[alertKey] = true;
        this.playChime();
        try {
          new Notification('PlanMaster AI - Nhắc nhở lịch trình!', {
            body: `Bạn có ${overduePlans.length} việc quá hạn và ${todayPlans.length} kế hoạch cần hoàn thành hôm nay.`,
            icon: '/icons/icon-192.svg'
          });
        } catch (e) {}
      }
    }
  },

  updateBanner(overduePlans, todayPlans) {
    if (!this.banner) return;

    if (overduePlans.length === 0 && todayPlans.length === 0) {
      this.banner.style.display = 'none';
      return;
    }

    this.banner.style.display = 'flex';
    let bannerText = '';
    let bannerClass = 'urgent-banner ';

    if (overduePlans.length > 0) {
      bannerClass += 'banner-danger';
      bannerText = `⚠️ <strong>Cảnh báo lịch trình:</strong> Bạn có <strong>${overduePlans.length}</strong> kế hoạch đã quá hạn cần giải quyết ngay!`;
      if (todayPlans.length > 0) {
        bannerText += ` (Và <strong>${todayPlans.length}</strong> việc đến hạn hôm nay)`;
      }
    } else {
      bannerClass += 'banner-warning';
      bannerText = `⏰ <strong>Hôm nay:</strong> Bạn có <strong>${todayPlans.length}</strong> kế hoạch cần hoàn thành trong ngày.`;
    }

    this.banner.className = bannerClass;
    this.banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${Icons.get('alert', '', 18)}</span>
        <span>${bannerText}</span>
      </div>
      <div class="banner-actions">
        <button class="btn btn-secondary" style="padding: 0.3rem 0.75rem; font-size: 0.775rem;" id="banner-action-filter">Xem việc hôm nay</button>
        <button class="banner-close-btn" id="banner-close-btn" title="Đóng thông báo">${Icons.get('x', '', 16)}</button>
      </div>
    `;

    document.getElementById('banner-action-filter').onclick = () => {
      App.switchTab('plans');
      App.filterBySchedule('today_or_overdue');
    };

    document.getElementById('banner-close-btn').onclick = () => {
      this.banner.style.display = 'none';
    };
  },

  renderDropdown() {
    if (!this.listContainer) return;

    const notifPermission = ('Notification' in window) ? Notification.permission : 'unsupported';

    let permissionPromptHtml = '';
    if (notifPermission === 'default') {
      permissionPromptHtml = `
        <div class="notif-permission-box">
          <div style="font-size: 0.78rem; font-weight: 600;">🔔 Bật thông báo trên máy tính</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin: 0.2rem 0 0.5rem;">Nhận nhắc nhở lịch trình ngay cả khi bạn đang chuyển tab khác.</div>
          <button class="btn btn-primary" style="padding: 0.3rem 0.75rem; font-size: 0.75rem; width: 100%;" id="btn-enable-desktop-notif">
            Bật thông báo ngay
          </button>
        </div>
      `;
    }

    if (this.notifications.length === 0) {
      this.listContainer.innerHTML = `
        ${permissionPromptHtml}
        <div class="empty-state" style="padding: 1.75rem 1rem;">
          <div class="empty-state-icon" style="width: 40px; height: 40px; color: var(--status-completed);">
            ${Icons.get('checkCircle', '', 20)}
          </div>
          <p style="font-size: 0.85rem; font-weight: 500;">Không có lịch trình gấp!</p>
          <p style="font-size: 0.75rem; color: var(--text-muted);">Mọi kế hoạch của bạn đều đang đúng tiến độ.</p>
        </div>
      `;
      this.bindPermissionBtn();
      return;
    }

    this.listContainer.innerHTML = `
      ${permissionPromptHtml}
      <div class="notif-items-wrapper">
        ${this.notifications.map(n => `
          <div class="notif-item ${n.type}" data-plan-id="${n.planId}">
            <div class="notif-item-header">
              <span class="notif-item-title">${App.escapeHTML(n.title)}</span>
            </div>
            <div class="notif-item-desc">${App.escapeHTML(n.desc)}</div>
            <div class="notif-item-actions">
              <button class="btn-notif-action notif-complete-btn" data-action="complete" data-plan-id="${n.planId}">
                ${Icons.get('check', '', 12)} Xong
              </button>
              <button class="btn-notif-action notif-view-btn" data-action="view" data-plan-id="${n.planId}">
                Xem chi tiết
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    this.bindPermissionBtn();

    // Bind item action buttons
    this.listContainer.querySelectorAll('[data-action="complete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-plan-id');
        App.updatePlanStatus(id, 'completed');
        this.closeDropdown();
      });
    });

    this.listContainer.querySelectorAll('[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-plan-id');
        App.switchTab('plans');
        App.openPlanModal(id);
        this.closeDropdown();
      });
    });
  },

  bindPermissionBtn() {
    const btn = document.getElementById('btn-enable-desktop-notif');
    if (btn) {
      btn.addEventListener('click', async () => {
        const ok = await this.requestPermission();
        if (ok) {
          App.showToast('Đã kích hoạt thông báo đẩy trình duyệt thành công!', 'success');
          this.playChime();
          this.renderDropdown();
        } else {
          App.showToast('Bạn đã từ chối quyền thông báo. Hãy mở cài đặt trình duyệt để bật lại.', 'info');
        }
      });
    }
  }
};

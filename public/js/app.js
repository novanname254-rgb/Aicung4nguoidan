/**
 * LifeCare – Your Life, Your Balance
 * Comprehensive Client Controller with Multi-language, Overlaps, Recurring Tasks,
 * Dynamic Data, Meal/Exercise Tracking, Emotional Journal & Mood Calendar
 */

// Global State
const AppState = {
  token: localStorage.getItem('lifecare_token') || '',
  user: null,
  activeView: 'dashboard',
  tasks: [],
  overlaps: [],
  notifications: [],
  calendarView: 'month', // 'month', 'week', 'day'
  charts: {},
  theme: localStorage.getItem('lifecare_theme') || 'light',
  language: localStorage.getItem('lifecare_lang') || 'vi',
  aiMode: 'schedule', // 'schedule', 'wellness', 'insight'
  deferredPwaPrompt: null
};

// I18N Helper
function t(key) {
  const dict = (window.I18N && window.I18N[AppState.language]) ? window.I18N[AppState.language] : (window.I18N ? window.I18N['vi'] : {});
  return dict[key] || key;
}

function applyLanguage(lang) {
  AppState.language = lang;
  localStorage.setItem('lifecare_lang', lang);
  document.documentElement.lang = lang;

  // Update header indicator
  const flagEl = document.getElementById('currentLangFlag');
  const textEl = document.getElementById('currentLangText');
  if (flagEl && textEl) {
    flagEl.innerText = lang === 'vi' ? '🇻🇳' : '🇺🇸';
    textEl.innerText = lang === 'vi' ? 'VI' : 'EN';
  }

  // Update all [data-i18n] elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerText = t(key);
  });

  // Re-render dynamic active views
  if (AppState.activeView === 'dashboard') loadDashboard();
  else if (AppState.activeView === 'planner') loadPlanner();
  else if (AppState.activeView === 'physical') loadPhysicalHealth();
  else if (AppState.activeView === 'mental') loadMentalHealth();
  else if (AppState.activeView === 'timeline') loadTimeline('30days');
  else if (AppState.activeView === 'statistics') loadStatistics();
  else if (AppState.activeView === 'settings') loadSettings();
}

// API Helper
async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(AppState.token ? { 'Authorization': `Bearer ${AppState.token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 && AppState.token) {
        AppState.token = '';
        localStorage.removeItem('lifecare_token');
        showAuthModal(true);
      }
      throw new Error(data.message || 'Request failed');
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

// UI Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✓'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initPWA();
  bindLanguage();
  bindNavigation();
  bindAuthEvents();
  bindPlannerEvents();
  bindHealthEvents();
  bindMoodEvents();
  bindAiChat();
  bindSettings();
  bindProactiveBanner();

  // Apply initial language
  applyLanguage(AppState.language);

  // Check current session
  if (AppState.token) {
    try {
      const data = await apiRequest('/api/auth/me');
      AppState.user = data.user;
      updateUserUI();
      loadDashboard();
    } catch (e) {
      showAuthModal(true);
    }
  } else {
    // Attempt auto-login with demo user if available
    try {
      const loginRes = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'alex.balance@lifecare.app',
          password: 'LifeCare2026!'
        })
      });
      AppState.token = loginRes.token;
      localStorage.setItem('lifecare_token', loginRes.token);
      AppState.user = loginRes.user;
      updateUserUI();
      loadDashboard();
    } catch (err) {
      showAuthModal(true);
    }
  }
});

// PWA Service Worker & Install Prompt
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('LifeCare SW registered:', reg.scope))
        .catch(err => console.log('LifeCare SW failed:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPwaPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) {
      btn.style.display = 'inline-flex';
      btn.addEventListener('click', async () => {
        btn.style.display = 'none';
        AppState.deferredPwaPrompt.prompt();
        const choice = await AppState.deferredPwaPrompt.userChoice;
        AppState.deferredPwaPrompt = null;
      });
    }
  });
}

// Language switch binding
function bindLanguage() {
  const switchBtn = document.getElementById('langSwitchBtn');
  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      const nextLang = AppState.language === 'vi' ? 'en' : 'vi';
      applyLanguage(nextLang);
      showToast(nextLang === 'vi' ? 'Đã đổi sang Tiếng Việt' : 'Switched to English');
    });
  }

  const setLangSelect = document.getElementById('setLanguage');
  if (setLangSelect) {
    setLangSelect.value = AppState.language;
    setLangSelect.addEventListener('change', () => {
      applyLanguage(setLangSelect.value);
    });
  }
}

// Theme handling
function initTheme() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  updateThemeIcons();

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('lifecare_theme', AppState.theme);
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeIcons();
    if (AppState.activeView === 'statistics') {
      loadStatistics();
    }
  });
}

function updateThemeIcons() {
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  if (AppState.theme === 'dark') {
    sun.style.display = 'none';
    moon.style.display = 'block';
  } else {
    sun.style.display = 'block';
    moon.style.display = 'none';
  }
}

// Sidebar & Page Navigation
function bindNavigation() {
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('appSidebar');
  mobileBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  const links = document.querySelectorAll('.sidebar-nav .nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.getAttribute('data-view');
      navigateToView(view);
      sidebar.classList.remove('open');
    });
  });

  document.getElementById('brandLogo').addEventListener('click', (e) => {
    e.preventDefault();
    navigateToView('dashboard');
  });

  document.getElementById('btnGoToPlanner').addEventListener('click', () => navigateToView('planner'));
  document.getElementById('btnDashPhysCheckin').addEventListener('click', () => navigateToView('physical'));
  document.getElementById('btnDashMoodCheckin').addEventListener('click', () => navigateToView('mental'));
  document.getElementById('btnDashWeeklyReport').addEventListener('click', () => navigateToView('statistics'));
}

function navigateToView(viewName) {
  AppState.activeView = viewName;
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewName);
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Title update
  const titles = {
    dashboard: t('navDashboard'),
    planner: t('navPlanner'),
    physical: t('navPhysical'),
    mental: t('navMental'),
    timeline: t('navTimeline'),
    statistics: t('navStatistics'),
    settings: t('navSettings')
  };
  document.getElementById('pageTitle').innerText = titles[viewName] || 'LifeCare';

  if (viewName === 'dashboard') loadDashboard();
  else if (viewName === 'planner') loadPlanner();
  else if (viewName === 'physical') loadPhysicalHealth();
  else if (viewName === 'mental') loadMentalHealth();
  else if (viewName === 'timeline') loadTimeline('30days');
  else if (viewName === 'statistics') loadStatistics();
  else if (viewName === 'settings') loadSettings();
}

function updateUserUI() {
  if (!AppState.user) return;
  document.getElementById('sidebarUserName').innerText = AppState.user.full_name;
  document.getElementById('sidebarUserEmail').innerText = AppState.user.email;
  if (AppState.user.avatar) {
    document.getElementById('sidebarAvatar').src = AppState.user.avatar;
  }
}

// ==========================================
// 1. AUTHENTICATION CONTROLLER
// ==========================================
function bindAuthEvents() {
  const modal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const title = document.getElementById('authModalTitle');

  document.getElementById('showRegisterLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    forgotForm.style.display = 'none';
    title.innerText = t('createAccountTitle');
  });

  document.getElementById('showLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    forgotForm.style.display = 'none';
    title.innerText = t('signInTitle');
  });

  document.getElementById('showForgotLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    forgotForm.style.display = 'block';
    title.innerText = t('passwordRecoveryTitle');
  });

  document.getElementById('backToLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    forgotForm.style.display = 'none';
    loginForm.style.display = 'block';
    title.innerText = t('signInTitle');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      AppState.token = res.token;
      localStorage.setItem('lifecare_token', res.token);
      AppState.user = res.user;
      updateUserUI();
      showAuthModal(false);
      showToast(`${t('greetingMorning')}, ${res.user.full_name}!`);
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const full_name = document.getElementById('regFullName').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const dob = document.getElementById('regDob').value;
      const gender = document.getElementById('regGender').value;
      const personal_goals = document.getElementById('regGoals').value;

      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name, email, password, dob, gender, personal_goals })
      });

      AppState.token = res.token;
      localStorage.setItem('lifecare_token', res.token);
      AppState.user = res.user;
      updateUserUI();
      showAuthModal(false);
      showToast(AppState.language === 'vi' ? 'Đăng ký thành công! Chào mừng bạn.' : 'Registration successful! Welcome.');
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('forgotEmail').value;
      const res = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showToast(res.message);
      document.getElementById('backToLoginLink').click();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('sidebarLogoutBtn').addEventListener('click', async () => {
    if (confirm(AppState.language === 'vi' ? 'Bạn có chắc chắn muốn đăng xuất?' : 'Are you sure you want to sign out?')) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      AppState.token = '';
      AppState.user = null;
      localStorage.removeItem('lifecare_token');
      showAuthModal(true);
      showToast(AppState.language === 'vi' ? 'Đã đăng xuất.' : 'Signed out.');
    }
  });
}

function showAuthModal(show) {
  const modal = document.getElementById('authModal');
  if (show) modal.classList.add('active');
  else modal.classList.remove('active');
}

// ==========================================
// 2. MAIN DASHBOARD CONTROLLER
// ==========================================
async function loadDashboard() {
  const container = document.getElementById('dashTodayTasksList');
  container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">⌛ Đang tải dữ liệu...</div>`;

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await apiRequest(`/api/dashboard?date=${todayStr}`);
    const dash = data.data;

    // Greeting by time of day
    const hour = new Date().getHours();
    let timeGreeting = t('greetingMorning');
    let emoji = '🌅';
    if (hour >= 12 && hour < 17) {
      timeGreeting = t('greetingAfternoon');
      emoji = '☀️';
    } else if (hour >= 17) {
      timeGreeting = t('greetingEvening');
      emoji = '🌙';
    }

    const firstName = dash.user.full_name ? dash.user.full_name.split(' ')[0] : '';
    document.getElementById('welcomeGreeting').innerText = `${timeGreeting}, ${firstName}! ${emoji}`;

    // Fixed Date formatting
    const dateOptions = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString(AppState.language === 'vi' ? 'vi-VN' : 'en-US', dateOptions);

    // Metrics
    document.getElementById('dashCompletedTasks').innerText = dash.taskStats.completed;
    document.getElementById('dashRemainingTasks').innerText = dash.taskStats.remaining;
    document.getElementById('dashCompletionRate').innerText = `${dash.taskStats.completionRate}% ` + (AppState.language === 'vi' ? 'mục tiêu ngày' : 'of daily plan');
    document.getElementById('dashRemainingSub').innerText = `${dash.taskStats.remaining} ` + (AppState.language === 'vi' ? 'công việc đang chờ' : 'tasks pending');

    // Sleep Metric
    if (dash.healthStatus.latestPhysical && dash.healthStatus.latestPhysical.sleep_duration) {
      document.getElementById('dashSleepDuration').innerText = `${dash.healthStatus.latestPhysical.sleep_duration}h`;
      document.getElementById('dashSleepQuality').innerText = `${t('sleepQuality')}: ${dash.healthStatus.latestPhysical.sleep_quality || 'Good'}`;
    } else {
      document.getElementById('dashSleepDuration').innerText = '--';
      document.getElementById('dashSleepQuality').innerText = t('pendingCheckin');
    }

    // Mood Metric
    if (dash.emotionalStatus.latestMood) {
      document.getElementById('dashMoodValue').innerText = `${dash.emotionalStatus.latestMood.emoji || '✨'} ${dash.emotionalStatus.latestMood.mood}`;
      document.getElementById('dashMoodSub').innerText = AppState.language === 'vi' ? 'Ghi nhận hôm nay' : 'Logged today';
    } else {
      document.getElementById('dashMoodValue').innerText = t('pendingCheckin');
      document.getElementById('dashMoodSub').innerText = AppState.language === 'vi' ? 'Chưa phản chiếu' : 'Pending reflection';
    }

    // Compute Today's Well-being Score
    calculateTodayWellbeing(dash);

    // Render today's schedule
    renderDashboardTasks(dash.todayTasks);

    // Health overview
    renderDashboardHealthOverview(dash.healthStatus.latestPhysical, dash.emotionalStatus.latestMood);

    // Proactive check-in banner status
    if (dash.healthStatus.todayCheckinCompleted) {
      document.getElementById('proactiveBanner').style.display = 'none';
    } else {
      document.getElementById('proactiveBanner').style.display = 'flex';
    }

    // Schedule recommendations
    loadScheduleRecommendations();
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: #DC2626;">⚠️ Không thể tải dữ liệu: ${err.message}</div>`;
  }
}

// Calculate composite well-being score
function calculateTodayWellbeing(dash) {
  let score = 50; // Base score
  const h = dash.healthStatus.latestPhysical;
  const m = dash.emotionalStatus.latestMood;

  if (h && h.sleep_duration) {
    if (h.sleep_duration >= 7 && h.sleep_duration <= 9) score += 20;
    else if (h.sleep_duration >= 6) score += 10;
    document.getElementById('wellbeingSleepPill').innerText = `${h.sleep_duration}h ${AppState.language === 'vi' ? 'ngủ' : 'sleep'}`;
  } else {
    document.getElementById('wellbeingSleepPill').innerText = `--h ${AppState.language === 'vi' ? 'ngủ' : 'sleep'}`;
  }

  if (h && h.energy_level) {
    score += (h.energy_level * 3);
    document.getElementById('wellbeingEnergyPill').innerText = `${AppState.language === 'vi' ? 'Năng lượng' : 'Energy'}: ${h.energy_level}/5`;
  }

  if (m && m.stress_level) {
    score -= (m.stress_level * 3);
    document.getElementById('wellbeingStressPill').innerText = `${AppState.language === 'vi' ? 'Căng thẳng' : 'Stress'}: ${m.stress_level}/5`;
  }

  if (dash.taskStats && dash.taskStats.completionRate > 0) {
    score += Math.round(dash.taskStats.completionRate * 0.15);
  }

  score = Math.max(20, Math.min(100, Math.round(score)));
  document.getElementById('wellbeingCircleScore').innerHTML = `${score}<span>/100</span>`;

  if (score >= 75) {
    document.getElementById('wellbeingStatusText').innerText = t('wellbeingBalanced');
  } else {
    document.getElementById('wellbeingStatusText').innerText = t('wellbeingNeedRest');
  }
}

function renderDashboardTasks(tasks) {
  const container = document.getElementById('dashTodayTasksList');
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">🕊️ ${t('noTasksToday')}</p>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = tasks.map(task => {
    const isOverdue = task.status !== 'completed' && task.date < todayStr;
    return `
      <div class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}">
        <input type="checkbox" class="task-checkbox" ${task.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${task.id}', this.checked)" />
        <div class="task-details">
          <div class="task-title">
            ${escapeHTML(task.title)}
            ${isOverdue ? `<span class="badge badge-overdue">${t('overdue')}</span>` : ''}
            ${task.recurring && task.recurring !== 'none' ? `<span class="badge badge-recurring">🔄 ${task.recurring}</span>` : ''}
          </div>
          <div class="task-meta">
            <span class="badge badge-${task.category.toLowerCase()}">${task.category}</span>
            <span class="priority-${task.priority}">${t('priorityLabel')}: ${task.priority.toUpperCase()}</span>
            ${task.start_time ? `<span>🕒 ${task.start_time} ${task.end_time ? '– ' + task.end_time : ''}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashboardHealthOverview(health, mood) {
  const container = document.getElementById('dashHealthOverviewContent');
  if (!health && !mood) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.86rem;">${AppState.language === 'vi' ? 'Chưa có ghi nhận hôm nay. Điểm danh giúp nhận biết thói quen sớm!' : 'No logs yet today. Logging builds self-awareness!'}</p>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
  if (health) {
    html += `
      <div style="background: var(--bg-main); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">${t('healthOverview')}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          ${health.physical_condition || 'Good'} • ${health.sleep_duration || '--'}h • ${health.water_intake || '--'}L
        </div>
        ${health.exercise_type ? `<div style="font-size: 0.76rem; color: var(--primary); margin-top: 2px;">🏃 ${health.exercise_type} (${health.exercise_duration || 0}m)</div>` : ''}
      </div>
    `;
  }
  if (mood) {
    html += `
      <div style="background: var(--bg-main); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">${t('navMental')}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          ${mood.emoji || ''} ${mood.mood} • ${AppState.language === 'vi' ? 'Căng thẳng' : 'Stress'}: ${mood.stress_level || 2}/5
        </div>
        ${mood.journal_entry ? `<div style="font-size: 0.76rem; font-style: italic; color: var(--text-main); margin-top: 4px;">"${escapeHTML(mood.journal_entry.substring(0, 60))}..."</div>` : ''}
      </div>
    `;
  }
  html += `</div>`;
  container.innerHTML = html;
}

// Schedule recommendations
async function loadScheduleRecommendations() {
  try {
    const res = await apiRequest('/api/schedule/recommendations');
    const summaryEl = document.getElementById('scheduleRecSummary');
    if (res.recommendations && res.recommendations.length > 0) {
      summaryEl.innerText = res.recommendations[0];
    }
    document.getElementById('btnApplyScheduleRec').onclick = () => {
      alert(`${t('scheduleRecTitle')}:\n\n${res.summary}\n\n${res.recommendations.map(r => '• ' + r).join('\n')}`);
    };
  } catch (e) {}
}

// Proactive 30s Quick Check-in
function bindProactiveBanner() {
  const rapidModal = document.getElementById('rapidCheckinModal');
  const openRapid = () => { rapidModal.classList.add('active'); };
  const closeRapid = () => { rapidModal.classList.remove('active'); };

  document.getElementById('startRapidCheckinBtn').addEventListener('click', openRapid);
  document.getElementById('btnQuickCheckin').addEventListener('click', openRapid);
  document.getElementById('dismissProactiveBtn').addEventListener('click', () => {
    document.getElementById('proactiveBanner').style.display = 'none';
  });
  document.getElementById('rapidModalClose').addEventListener('click', closeRapid);

  document.getElementById('rapidCheckinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const mood = document.getElementById('rapidMood').value;
      const sleep_duration = parseFloat(document.getElementById('rapidSleep').value);
      const stress_level = parseInt(document.getElementById('rapidStress').value);

      await apiRequest('/api/checkin/quick', {
        method: 'POST',
        body: JSON.stringify({
          mood,
          sleep_duration,
          stress_level,
          physical_condition: sleep_duration >= 7 ? 'Good' : 'Tired',
          water_intake: 2.0
        })
      });

      closeRapid();
      document.getElementById('proactiveBanner').style.display = 'none';
      showToast(AppState.language === 'vi' ? 'Điểm danh 30 giây thành công!' : '30-second check-in saved!');
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('btnDashNewTask').addEventListener('click', () => {
    openTaskModal();
  });
}

// ==========================================
// 3. SMART PLANNER & SCHEDULE MANAGEMENT
// ==========================================
function bindPlannerEvents() {
  const taskModal = document.getElementById('taskModal');
  document.getElementById('btnOpenNewTaskModal').addEventListener('click', () => openTaskModal());
  document.getElementById('taskModalClose').addEventListener('click', () => taskModal.classList.remove('active'));
  document.getElementById('taskModalCancel').addEventListener('click', () => taskModal.classList.remove('active'));

  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const id = document.getElementById('taskIdInput').value;
      const title = document.getElementById('taskTitle').value;
      const description = document.getElementById('taskDesc').value;
      const category = document.getElementById('taskCategory').value;
      const priority = document.getElementById('taskPriority').value;
      const date = document.getElementById('taskDate').value;
      const start_time = document.getElementById('taskStartTime').value;
      const end_time = document.getElementById('taskEndTime').value;
      const recurring = document.getElementById('taskRecurring').value;
      const reminder_time = document.getElementById('taskReminderTime').value;

      if (id) {
        await apiRequest(`/api/tasks/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time, recurring, reminder_time })
        });
        showToast(AppState.language === 'vi' ? 'Đã cập nhật công việc.' : 'Task updated.');
      } else {
        const res = await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time, recurring, reminder_time })
        });
        showToast(AppState.language === 'vi' ? 'Đã tạo công việc mới.' : 'Task created.');
        if (res.overlapWarning) {
          alert('⚠️ ' + res.overlapWarning);
        }
      }

      taskModal.classList.remove('active');
      loadPlanner();
      if (AppState.activeView === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelectorAll('.calendar-view-tabs .view-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calendar-view-tabs .view-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.calendarView = btn.getAttribute('data-cal-view');
      renderCalendar();
    });
  });

  document.getElementById('taskSearchInput').addEventListener('input', () => filterAndRenderTaskList());
  document.getElementById('taskCategoryFilter').addEventListener('change', () => filterAndRenderTaskList());
  document.getElementById('taskPriorityFilter').addEventListener('change', () => filterAndRenderTaskList());
}

async function loadPlanner() {
  const container = document.getElementById('allTasksList');
  container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">⌛ Đang tải danh sách công việc...</div>`;

  try {
    const data = await apiRequest('/api/tasks');
    AppState.tasks = data.tasks || [];
    AppState.overlaps = data.overlaps || [];
    renderCalendar();
    filterAndRenderTaskList();
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: #DC2626;">⚠️ Lỗi: ${err.message}</div>`;
  }
}

function openTaskModal(task = null, defaultDate = null) {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');
  document.getElementById('taskIdInput').value = task ? task.id : '';
  document.getElementById('taskTitle').value = task ? task.title : '';
  document.getElementById('taskDesc').value = task ? (task.description || '') : '';
  document.getElementById('taskCategory').value = task ? task.category : 'Work';
  document.getElementById('taskPriority').value = task ? task.priority : 'medium';
  document.getElementById('taskDate').value = task ? task.date : (defaultDate || new Date().toISOString().split('T')[0]);
  document.getElementById('taskStartTime').value = task ? (task.start_time || '') : '';
  document.getElementById('taskEndTime').value = task ? (task.end_time || '') : '';
  document.getElementById('taskRecurring').value = task ? (task.recurring || 'none') : 'none';
  document.getElementById('taskReminderTime').value = task ? (task.reminder_time || '') : '';

  title.innerText = task ? (AppState.language === 'vi' ? 'Sửa Công Việc' : 'Edit Task') : t('createTaskEvent');
  modal.classList.add('active');
}

async function toggleTaskStatus(taskId, completed) {
  try {
    await apiRequest(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: completed ? 'completed' : 'pending' })
    });
    const tItem = AppState.tasks.find(x => x.id === taskId);
    if (tItem) tItem.status = completed ? 'completed' : 'pending';
    if (AppState.activeView === 'dashboard') loadDashboard();
    if (AppState.activeView === 'planner') loadPlanner();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (confirm(AppState.language === 'vi' ? 'Bạn có chắc chắn muốn xóa công việc này?' : 'Delete this task?')) {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      showToast(AppState.language === 'vi' ? 'Đã xóa công việc.' : 'Task removed.');
      loadPlanner();
      if (AppState.activeView === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function renderCalendar() {
  const container = document.getElementById('calendarDisplayArea');
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  if (AppState.calendarView === 'month') {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = AppState.language === 'vi'
      ? ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let html = `
      <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-heading); margin-bottom: 12px;">
        ${monthNames[month]} ${year}
      </div>
      <div class="month-grid">
        <div class="month-day-header">CN</div>
        <div class="month-day-header">T2</div>
        <div class="month-day-header">T3</div>
        <div class="month-day-header">T4</div>
        <div class="month-day-header">T5</div>
        <div class="month-day-header">T6</div>
        <div class="month-day-header">T7</div>
    `;

    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="month-day-cell" style="opacity: 0.3; background: transparent;"></div>`;
    }

    const todayDateStr = today.toISOString().split('T')[0];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dayStr === todayDateStr;
      const dayTasks = AppState.tasks.filter(t => t.date === dayStr);

      html += `
        <div class="month-day-cell ${isToday ? 'today' : ''}" onclick="openTaskModal(null, '${dayStr}')">
          <div class="day-num">${day} ${isToday ? '•' : ''}</div>
          ${dayTasks.slice(0, 2).map(t => `<div class="day-tasks-pill">${escapeHTML(t.title)}</div>`).join('')}
          ${dayTasks.length > 2 ? `<div style="font-size: 0.65rem; color: var(--primary); font-weight: 700;">+${dayTasks.length - 2}</div>` : ''}
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  } else {
    // Week or Day view
    const todayStr = today.toISOString().split('T')[0];
    const filtered = AppState.calendarView === 'day' 
      ? AppState.tasks.filter(t => t.date === todayStr)
      : AppState.tasks;

    container.innerHTML = `
      <div style="padding: 12px 0;">
        <h4 style="margin-bottom: 12px;">${AppState.calendarView === 'day' ? (AppState.language === 'vi' ? 'Công việc hôm nay (' + todayStr + ')' : 'Tasks for Today (' + todayStr + ')') : (AppState.language === 'vi' ? 'Tất cả công việc' : 'All Tasks')}</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${filtered.length === 0 ? `<p style="color: var(--text-muted);">${t('noMatchingTasks')}</p>` : filtered.map(tItem => `
            <div class="task-item" style="margin-bottom: 0;">
              <input type="checkbox" class="task-checkbox" ${tItem.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${tItem.id}', this.checked)" />
              <div class="task-details">
                <div class="task-title">
                  ${escapeHTML(tItem.title)}
                  ${tItem.recurring && tItem.recurring !== 'none' ? `<span class="badge badge-recurring">🔄 ${tItem.recurring}</span>` : ''}
                </div>
                <div class="task-meta">
                  <span>📅 ${tItem.date}</span>
                  ${tItem.start_time ? `<span>🕒 ${tItem.start_time} - ${tItem.end_time || ''}</span>` : ''}
                  <span class="badge badge-${tItem.category.toLowerCase()}">${tItem.category}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

function filterAndRenderTaskList() {
  const container = document.getElementById('allTasksList');
  const search = document.getElementById('taskSearchInput').value.toLowerCase();
  const cat = document.getElementById('taskCategoryFilter').value;
  const prio = document.getElementById('taskPriorityFilter').value;
  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = AppState.tasks.filter(tItem => {
    const matchSearch = tItem.title.toLowerCase().includes(search) || (tItem.description && tItem.description.toLowerCase().includes(search));
    const matchCat = cat === 'all' || tItem.category === cat;
    const matchPrio = prio === 'all' || tItem.priority === prio;
    return matchSearch && matchCat && matchPrio;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 24px 0;">${t('noMatchingTasks')}</p>`;
    return;
  }

  // Check overlap IDs
  const overlappingIds = new Set();
  (AppState.overlaps || []).forEach(o => {
    overlappingIds.add(o.task1Id);
    overlappingIds.add(o.task2Id);
  });

  container.innerHTML = filtered.map(tItem => {
    const isOverdue = tItem.status !== 'completed' && tItem.date < todayStr;
    const isOverlap = overlappingIds.has(tItem.id);

    return `
      <div class="task-item ${tItem.status === 'completed' ? 'completed' : ''}">
        <input type="checkbox" class="task-checkbox" ${tItem.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${tItem.id}', this.checked)" />
        <div class="task-details">
          <div class="task-title">
            ${escapeHTML(tItem.title)}
            ${isOverdue ? `<span class="badge badge-overdue">${t('overdue')}</span>` : ''}
            ${isOverlap ? `<span class="badge badge-overlap">${t('overlapWarning')}</span>` : ''}
            ${tItem.recurring && tItem.recurring !== 'none' ? `<span class="badge badge-recurring">🔄 ${tItem.recurring}</span>` : ''}
          </div>
          <div class="task-meta">
            <span>📅 ${tItem.date}</span>
            ${tItem.start_time ? `<span>🕒 ${tItem.start_time} ${tItem.end_time ? '– ' + tItem.end_time : ''}</span>` : ''}
            <span class="badge badge-${tItem.category.toLowerCase()}">${tItem.category}</span>
            <span class="priority-${tItem.priority}">${t('priorityLabel')}: ${tItem.priority.toUpperCase()}</span>
            ${tItem.reminder_time ? `<span>⏰ Nhắc: ${tItem.reminder_time}</span>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn-icon" style="width: 32px; height: 32px;" onclick='openTaskModal(${JSON.stringify(tItem).replace(/'/g, "&#39;")})' title="Edit">✎</button>
          <button class="btn-icon" style="width: 32px; height: 32px; color: #DC2626;" onclick="deleteTask('${tItem.id}')" title="Delete">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 4. PHYSICAL HEALTH CHECK-IN
// ==========================================
function bindHealthEvents() {
  document.querySelectorAll('#energyRatingGroup .rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#energyRatingGroup .rating-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('physEnergyLevel').value = btn.getAttribute('data-val');
    });
  });

  const physExerciseSelect = document.getElementById('physExercise');
  const exerciseRow = document.getElementById('exerciseDetailsRow');
  physExerciseSelect.addEventListener('change', () => {
    exerciseRow.style.display = physExerciseSelect.value === 'Yes' ? 'flex' : 'none';
  });

  document.getElementById('physicalCheckinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const checkin_date = document.getElementById('physDate').value || new Date().toISOString().split('T')[0];
      const physical_condition = document.getElementById('physCondition').value;
      const sleep_duration = document.getElementById('physSleepHours').value;
      const sleep_quality = document.getElementById('physSleepQuality').value;
      const exercise_status = document.getElementById('physExercise').value;
      const exercise_type = document.getElementById('physExerciseType').value;
      const exercise_duration = document.getElementById('physExerciseDuration').value;
      const meals_summary = document.getElementById('physMealsSummary').value;
      const water_intake = document.getElementById('physWater').value;
      const energy_level = document.getElementById('physEnergyLevel').value;
      const discomfort = document.getElementById('physDiscomfort').value;
      const notes = document.getElementById('physNotes').value;

      const res = await apiRequest('/api/health', {
        method: 'POST',
        body: JSON.stringify({
          checkin_date,
          physical_condition,
          sleep_duration,
          sleep_quality,
          exercise_status,
          exercise_type,
          exercise_duration,
          meals_summary,
          water_intake,
          energy_level,
          discomfort,
          notes
        })
      });

      showToast(res.message);
      if (res.adviceNotice) alert(res.adviceNotice);
      loadPhysicalHealth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadPhysicalHealth() {
  document.getElementById('physDate').value = new Date().toISOString().split('T')[0];
  const container = document.getElementById('physicalHistoryList');
  container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">⌛ Đang tải lịch sử thể chất...</div>`;

  try {
    const res = await apiRequest('/api/health?limit=15');
    const records = res.records || [];

    if (records.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Chưa có bản ghi nào.</p>`;
      return;
    }

    container.innerHTML = records.map(r => `
      <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">
          <span>📅 ${r.checkin_date}</span>
          <span style="color: var(--primary);">${r.physical_condition || 'Good'}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
          💤 ${t('sleepHours')}: <strong>${r.sleep_duration ? r.sleep_duration + 'h' : '--'}</strong> (${r.sleep_quality || 'Good'}) • 💧 Nước: <strong>${r.water_intake ? r.water_intake + 'L' : '--'}</strong> • ⚡ Năng lượng: <strong>${r.energy_level || '--'}/5</strong>
        </div>
        ${r.exercise_type ? `<div style="font-size: 0.8rem; color: var(--text-heading); margin-top: 4px;">🏃 Vận động: <strong>${escapeHTML(r.exercise_type)}</strong> (${r.exercise_duration || 0} phút)</div>` : ''}
        ${r.meals_summary ? `<div style="font-size: 0.8rem; color: var(--text-heading); margin-top: 4px;">🥗 Bữa ăn: ${escapeHTML(r.meals_summary)}</div>` : ''}
        ${r.discomfort ? `<div style="font-size: 0.78rem; color: #DC2626; margin-top: 4px;">⚠️ Triệu chứng: ${escapeHTML(r.discomfort)}</div>` : ''}
        ${r.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-style: italic;">"${escapeHTML(r.notes)}"</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: #DC2626;">⚠️ ${err.message}</div>`;
  }
}

// ==========================================
// 5. MENTAL HEALTH & EMOTIONAL WELLNESS
// ==========================================
function bindMoodEvents() {
  document.querySelectorAll('#moodPickerGrid .mood-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#moodPickerGrid .mood-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('selectedMood').value = btn.getAttribute('data-mood');
      document.getElementById('selectedEmoji').value = btn.getAttribute('data-emoji');
    });
  });

  document.getElementById('moodCheckinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const mood = document.getElementById('selectedMood').value;
      const emoji = document.getElementById('selectedEmoji').value;
      const stress_level = parseInt(document.getElementById('surveyStress').value);
      const anxiety_score = parseInt(document.getElementById('surveyAnxiety').value);
      const motivation_level = parseInt(document.getElementById('surveyMotivation').value);
      const connected_score = parseInt(document.getElementById('surveyConnected').value);
      const relaxed_score = parseInt(document.getElementById('surveyRelaxed').value);
      const emotional_notes = document.getElementById('moodNotes').value;
      const journal_entry = document.getElementById('moodJournalEntry').value;

      const res = await apiRequest('/api/mood', {
        method: 'POST',
        body: JSON.stringify({
          mood,
          emoji,
          stress_level,
          anxiety_score,
          motivation_level,
          connected_score,
          relaxed_score,
          emotional_notes,
          journal_entry
        })
      });

      showToast(res.message);
      if (res.supportiveMessage) {
        document.getElementById('dynamicSupportBox').innerText = `"${res.supportiveMessage}"`;
      }
      loadMentalHealth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadMentalHealth() {
  const container = document.getElementById('moodHistoryList');
  container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">⌛ Đang tải lịch sử cảm xúc...</div>`;

  try {
    const res = await apiRequest('/api/mood?limit=28');
    const records = res.records || [];

    // Render Mood Calendar
    renderMoodCalendar(records);

    if (records.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Chưa có bản ghi cảm xúc nào.</p>`;
      return;
    }

    container.innerHTML = records.map(m => `
      <div class="journal-entry-card">
        <div class="journal-date">
          <span>📅 ${m.checkin_date}</span>
          <span>${m.emoji || '✨'} ${m.mood}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 6px;">
          Căng thẳng: <strong>${m.stress_level || '--'}/5</strong> • Động lực: <strong>${m.motivation_level || '--'}/5</strong> • Kết nối: <strong>${m.connected_score || '--'}/5</strong>
        </div>
        ${m.journal_entry ? `<div class="journal-content">📖 "${escapeHTML(m.journal_entry)}"</div>` : ''}
        ${m.emotional_notes && !m.journal_entry ? `<div class="journal-content" style="font-style: italic;">"${escapeHTML(m.emotional_notes)}"</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: #DC2626;">⚠️ ${err.message}</div>`;
  }
}

// Render 14-day mini Mood Calendar
function renderMoodCalendar(records) {
  const calContainer = document.getElementById('moodCalendarContainer');
  if (!calContainer) return;

  const moodMap = new Map();
  records.forEach(r => moodMap.set(r.checkin_date, r));

  const today = new Date();
  const pastDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    pastDays.push(d.toISOString().split('T')[0]);
  }

  let html = `<div class="mood-calendar-grid">`;
  pastDays.forEach(dateStr => {
    const dayRecord = moodMap.get(dateStr);
    const dayLabel = dateStr.substring(8);
    html += `
      <div class="mood-cal-cell" title="${dateStr}: ${dayRecord ? dayRecord.mood : 'Chưa ghi'}">
        <span class="date-num">${dayLabel}</span>
        <span class="mood-icon">${dayRecord ? dayRecord.emoji : '⚪'}</span>
      </div>
    `;
  });
  html += `</div>`;
  calContainer.innerHTML = html;
}

// ==========================================
// 6. PERSONAL HEALTH TIMELINE
// ==========================================
async function loadTimeline(range = '30days') {
  const container = document.getElementById('timelineContainer');
  container.innerHTML = `<div style="text-align: center; padding: 32px; color: var(--text-muted);">⌛ Đang tải dòng thời gian...</div>`;

  try {
    const res = await apiRequest(`/api/timeline?range=${range}`);
    const timeline = res.timeline || [];

    if (timeline.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>Chưa có dữ liệu nào trong khoảng thời gian này.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = timeline.map(item => {
      const h = item.health;
      const m = item.mood;
      const tasks = item.tasks || [];

      return `
        <div class="timeline-node">
          <div class="timeline-dot"></div>
          <div class="timeline-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <strong style="font-size: 1rem; color: var(--text-heading);">📅 ${item.date}</strong>
              ${m ? `<span class="badge" style="background: var(--accent-light); color: var(--accent); font-size: 0.82rem;">${m.emoji || '✨'} ${m.mood}</span>` : ''}
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 8px;">
              ${h ? `
                <div style="font-size: 0.82rem; color: var(--text-muted);">
                  💤 Giấc ngủ: <strong>${h.sleep_duration ? h.sleep_duration + 'h' : '--'}</strong><br/>
                  💧 Nước uống: <strong>${h.water_intake ? h.water_intake + 'L' : '--'}</strong><br/>
                  🏃 Vận động: <strong>${h.exercise_status || 'Không'}</strong> ${h.exercise_type ? '(' + h.exercise_type + ')' : ''}
                </div>
              ` : '<div style="font-size: 0.82rem; color: var(--text-muted);">Chưa điểm danh thể chất</div>'}

              ${m ? `
                <div style="font-size: 0.82rem; color: var(--text-muted);">
                  ⚡ Căng thẳng: <strong>${m.stress_level || '--'}/5</strong><br/>
                  🌱 Động lực: <strong>${m.motivation_level || '--'}/5</strong><br/>
                  🧘 Thư thái: <strong>${m.relaxed_score || '--'}/5</strong>
                </div>
              ` : '<div style="font-size: 0.82rem; color: var(--text-muted);">Chưa phản chiếu tâm trạng</div>'}
            </div>

            ${tasks.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted);">
                Đã hoàn thành ${tasks.filter(tItem => tItem.status === 'completed').length} / ${tasks.length} công việc
              </div>
            ` : ''}

            ${(m && m.journal_entry) ? `
              <div style="margin-top: 8px; font-size: 0.82rem; color: var(--text-main); background: var(--bg-main); padding: 8px; border-radius: var(--radius-sm); border-left: 3px solid var(--primary);">
                📖 "${escapeHTML(m.journal_entry)}"
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    document.querySelectorAll('[data-timeline-range]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('[data-timeline-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadTimeline(btn.getAttribute('data-timeline-range'));
      };
    });
  } catch (err) {
    container.innerHTML = `<div style="color: #DC2626;">⚠️ ${err.message}</div>`;
  }
}

// ==========================================
// 7. STATISTICS & CHARTS
// ==========================================
async function loadStatistics(startDate = null, endDate = null) {
  loadWeeklyReport();

  let query = '/api/statistics?days=7';
  if (startDate && endDate) {
    query = `/api/statistics?startDate=${startDate}&endDate=${endDate}`;
  }

  try {
    const res = await apiRequest(query);
    const stats = res.stats;

    // Productivity Category Chart
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    if (AppState.charts.category) AppState.charts.category.destroy();

    const catLabels = Object.keys(stats.categoryCounts);
    const catData = Object.values(stats.categoryCounts);

    AppState.charts.category = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: catLabels.length > 0 ? catLabels : ['Chưa có công việc'],
        datasets: [{
          data: catData.length > 0 ? catData : [1],
          backgroundColor: catLabels.length > 0 ? ['#6C9CE8', '#A8D5BA', '#B8A5E8', '#FBBF24', '#38BDF8', '#94A3B8'] : ['#CBD5E1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });

    // Mood distribution Chart
    const ctxMood = document.getElementById('moodChart').getContext('2d');
    if (AppState.charts.mood) AppState.charts.mood.destroy();

    const moodLabels = Object.keys(stats.moodCounts);
    const moodData = Object.values(stats.moodCounts);

    AppState.charts.mood = new Chart(ctxMood, {
      type: 'pie',
      data: {
        labels: moodLabels.length > 0 ? moodLabels : ['Chưa có dữ liệu'],
        datasets: [{
          data: moodData.length > 0 ? moodData : [1],
          backgroundColor: moodLabels.length > 0 ? ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280'] : ['#CBD5E1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });

    // Sleep duration Trend Chart
    const ctxSleep = document.getElementById('sleepChart').getContext('2d');
    if (AppState.charts.sleep) AppState.charts.sleep.destroy();
    const sleepDates = stats.healthHistory.map(h => h.checkin_date.substring(5));
    const sleepHours = stats.healthHistory.map(h => h.sleep_duration || 0);

    AppState.charts.sleep = new Chart(ctxSleep, {
      type: 'bar',
      data: {
        labels: sleepDates.length > 0 ? sleepDates : ['Chưa có'],
        datasets: [{
          label: AppState.language === 'vi' ? 'Số giờ ngủ' : 'Hours Slept',
          data: sleepHours.length > 0 ? sleepHours : [0],
          backgroundColor: '#6C9CE8',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 12 } }
      }
    });

    // Stress & Motivation Line Chart
    const ctxStress = document.getElementById('stressChart').getContext('2d');
    if (AppState.charts.stress) AppState.charts.stress.destroy();
    const moodDates = stats.moodHistory.map(m => m.checkin_date.substring(5));
    const stressVals = stats.moodHistory.map(m => m.stress_level || 2);
    const motVals = stats.moodHistory.map(m => m.motivation_level || 4);

    AppState.charts.stress = new Chart(ctxStress, {
      type: 'line',
      data: {
        labels: moodDates.length > 0 ? moodDates : ['Chưa có'],
        datasets: [
          {
            label: AppState.language === 'vi' ? 'Căng thẳng (1-5)' : 'Stress (1-5)',
            data: stressVals.length > 0 ? stressVals : [0],
            borderColor: '#EF4444',
            tension: 0.3
          },
          {
            label: AppState.language === 'vi' ? 'Động lực (1-5)' : 'Motivation (1-5)',
            data: motVals.length > 0 ? motVals : [0],
            borderColor: '#10B981',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min: 1, max: 5 } }
      }
    });

    // Filter button handlers
    document.getElementById('btnApplyStatsFilter').onclick = () => {
      const s = document.getElementById('statsStartDate').value;
      const e = document.getElementById('statsEndDate').value;
      if (!s || !e) {
        showToast('Vui lòng chọn cả ngày bắt đầu và kết thúc', 'error');
        return;
      }
      loadStatistics(s, e);
    };

    document.getElementById('btnResetStatsFilter').onclick = () => {
      document.getElementById('statsStartDate').value = '';
      document.getElementById('statsEndDate').value = '';
      loadStatistics();
    };
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadWeeklyReport() {
  try {
    const res = await apiRequest('/api/reports/weekly');
    const rep = res.report;
    const summaryText = `
      "${rep.message}"<br/><br/>
      • <strong>${t('completedTasks')}:</strong> ${rep.completedTasks} / ${rep.totalTasks} (${rep.completionRate}%)<br/>
      • <strong>${AppState.language === 'vi' ? 'Giấc ngủ trung bình' : 'Average Sleep'}:</strong> ${rep.avgSleep} ${AppState.language === 'vi' ? 'giờ/ngày' : 'hours/day'}<br/>
      • <strong>${AppState.language === 'vi' ? 'Ngày có tâm trạng tích cực' : 'Positive Mood Days'}:</strong> ${rep.positiveMoodDays} / 7 ${AppState.language === 'vi' ? 'ngày' : 'days'}<br/>
      • <strong>${AppState.language === 'vi' ? 'Mức căng thẳng trung bình' : 'Average Stress'}:</strong> ${rep.avgStress} / 5<br/><br/>
      💡 <em>${rep.encouragement}</em>
    `;
    document.getElementById('weeklyReportSummaryText').innerHTML = summaryText;

    document.getElementById('btnRefreshWeeklyReport').onclick = () => {
      loadWeeklyReport();
      showToast(AppState.language === 'vi' ? 'Đã làm mới báo cáo.' : 'Report refreshed.');
    };
  } catch (e) {}
}

// ==========================================
// 8. MULTI-MODE AI WELLNESS ASSISTANT
// ==========================================
function bindAiChat() {
  const drawer = document.getElementById('aiChatDrawer');
  const openBtn = document.getElementById('openAiDrawerBtn');
  const closeBtn = document.getElementById('closeAiDrawerBtn');
  const form = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const msgArea = document.getElementById('aiChatMessages');

  openBtn.addEventListener('click', () => { drawer.classList.toggle('active'); });
  closeBtn.addEventListener('click', () => { drawer.classList.remove('active'); });

  // Mode buttons
  document.querySelectorAll('#aiModeTabs .ai-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#aiModeTabs .ai-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.aiMode = btn.getAttribute('data-ai-mode');
      
      const prompts = {
        schedule: AppState.language === 'vi' ? 'Hãy phân tích lịch trình hôm nay và đề xuất giờ nghỉ giúp tôi.' : 'Analyze my schedule today and suggest breaks.',
        wellness: AppState.language === 'vi' ? 'Gợi ý bài tập thở và cách giảm căng thẳng hiệu quả.' : 'Suggest breathing exercises and mindful relaxation tips.',
        insight: AppState.language === 'vi' ? 'Tổng hợp góc nhìn sức khỏe từ dữ liệu tuần qua của tôi.' : 'Summarize personal health insights from my recent logs.'
      };
      input.value = prompts[AppState.aiMode] || '';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;

    appendChatBubble('user', userMsg);
    input.value = '';

    const loadingBubble = appendChatBubble('assistant', AppState.language === 'vi' ? 'LifeCare AI đang suy nghĩ...' : 'LifeCare AI is reflecting...');

    try {
      const res = await apiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userMsg, mode: AppState.aiMode, language: AppState.language })
      });

      loadingBubble.remove();
      appendChatBubble('assistant', res.reply);

      if (res.suggestedTasks && res.suggestedTasks.length > 0) {
        const suggestionDiv = document.createElement('div');
        suggestionDiv.style.padding = '8px 12px';
        suggestionDiv.style.fontSize = '0.8rem';
        suggestionDiv.style.background = 'var(--primary-light)';
        suggestionDiv.style.borderRadius = 'var(--radius-sm)';
        suggestionDiv.style.marginTop = '6px';
        suggestionDiv.innerHTML = `
          <strong>${t('addAiTaskBtn')}:</strong> "${res.suggestedTasks[0].title}"
          <br/><button class="btn btn-primary" style="font-size: 0.72rem; padding: 4px 8px; margin-top: 4px;" onclick='addAiSuggestedTask(${JSON.stringify(res.suggestedTasks[0]).replace(/'/g, "&#39;")})'>+ Thêm vào Lịch</button>
        `;
        msgArea.appendChild(suggestionDiv);
        msgArea.scrollTop = msgArea.scrollHeight;
      }
    } catch (err) {
      loadingBubble.innerText = 'Lỗi kết nối: ' + err.message;
    }
  });
}

function appendChatBubble(role, text) {
  const msgArea = document.getElementById('aiChatMessages');
  const bubble = document.createElement('div');
  bubble.className = `chat-msg ${role}`;
  bubble.innerHTML = text.replace(/\n/g, '<br/>');
  msgArea.appendChild(bubble);
  msgArea.scrollTop = msgArea.scrollHeight;
  return bubble;
}

window.addAiSuggestedTask = async function(task) {
  try {
    await apiRequest('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: task.title,
        description: task.description || 'Generated by LifeCare AI',
        category: task.category || 'Rest',
        priority: task.priority || 'medium',
        date: new Date().toISOString().split('T')[0],
        start_time: '14:30',
        end_time: '14:45'
      })
    });
    showToast(AppState.language === 'vi' ? 'Đã thêm việc gợi ý vào lịch!' : 'Suggested task added to planner!');
    loadPlanner();
    if (AppState.activeView === 'dashboard') loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================
// 9. SETTINGS & PRIVACY CONTROLLER
// ==========================================
function bindSettings() {
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const full_name = document.getElementById('profFullName').value;
      const dob = document.getElementById('profDob').value;
      const gender = document.getElementById('profGender').value;
      const personal_goals = document.getElementById('profGoals').value;

      const res = await apiRequest('/api/user/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name, dob, gender, personal_goals })
      });

      AppState.user = res.user;
      updateUserUI();
      showToast(AppState.language === 'vi' ? 'Đã cập nhật hồ sơ.' : 'Profile updated.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const current_password = document.getElementById('curPassword').value;
      const new_password = document.getElementById('newPassword').value;

      await apiRequest('/api/user/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password, new_password })
      });

      document.getElementById('curPassword').value = '';
      document.getElementById('newPassword').value = '';
      showToast(AppState.language === 'vi' ? 'Mật khẩu đã được thay đổi an toàn.' : 'Password updated securely.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const remind_water = document.getElementById('setRemindWater').checked;
      const remind_break = document.getElementById('setRemindBreak').checked;
      const remind_health = document.getElementById('setRemindHealth').checked;
      const remind_mood = document.getElementById('setRemindMood').checked;
      const remind_tasks = document.getElementById('setRemindTasks').checked;
      const quiet_hours_start = document.getElementById('setQuietStart').value;
      const quiet_hours_end = document.getElementById('setQuietEnd').value;
      const notification_frequency = document.getElementById('setFrequency').value;
      const language = document.getElementById('setLanguage').value;

      await apiRequest('/api/user/settings', {
        method: 'PUT',
        body: JSON.stringify({
          remind_water,
          remind_break,
          remind_health,
          remind_mood,
          remind_tasks,
          quiet_hours_start,
          quiet_hours_end,
          notification_frequency,
          language
        })
      });

      applyLanguage(language);
      showToast(AppState.language === 'vi' ? 'Đã lưu tùy chọn thói quen.' : 'Preferences saved.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('btnExportData').addEventListener('click', () => {
    window.location.href = '/api/user/export';
  });

  document.getElementById('btnClearHealthHistory').addEventListener('click', async () => {
    if (confirm(AppState.language === 'vi' ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử sức khỏe và tâm trạng?' : 'Clear all health and mood logs?')) {
      try {
        await apiRequest('/api/user/clear-health', { method: 'POST' });
        showToast(AppState.language === 'vi' ? 'Đã xóa dữ liệu thành công.' : 'History cleared.');
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  document.getElementById('btnDeleteAccount').addEventListener('click', async () => {
    const confirmation = prompt(AppState.language === 'vi' ? 'Nhập chữ "DELETE" để xác nhận xóa vĩnh viễn tài khoản:' : 'Type "DELETE" to confirm permanent deletion:');
    if (confirmation === 'DELETE') {
      try {
        await apiRequest('/api/user/account', { method: 'DELETE' });
        alert(AppState.language === 'vi' ? 'Tài khoản của bạn đã được xóa hoàn toàn.' : 'Account deleted permanently.');
        localStorage.clear();
        location.reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  const notifModal = document.getElementById('notifModal');
  document.getElementById('notifBellBtn').addEventListener('click', async () => {
    notifModal.classList.add('active');
    try {
      const res = await apiRequest('/api/notifications');
      const container = document.getElementById('notifListContainer');
      const notifs = res.notifications || [];
      if (notifs.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">${AppState.language === 'vi' ? 'Không có thông báo mới.' : 'No new notifications.'}</p>`;
        return;
      }
      container.innerHTML = notifs.map(n => `
        <div style="background: var(--bg-main); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">${escapeHTML(n.title)}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">${escapeHTML(n.message)}</div>
          <div style="font-size: 0.72rem; color: var(--primary); margin-top: 4px;">⏰ ${n.notification_time}</div>
        </div>
      `).join('');
    } catch (e) {}
  });

  document.getElementById('notifModalClose').addEventListener('click', () => {
    notifModal.classList.remove('active');
  });
}

async function loadSettings() {
  if (AppState.user) {
    document.getElementById('profFullName').value = AppState.user.full_name || '';
    document.getElementById('profEmail').value = AppState.user.email || '';
    document.getElementById('profDob').value = AppState.user.dob || '';
    document.getElementById('profGender').value = AppState.user.gender || '';
    document.getElementById('profGoals').value = AppState.user.personal_goals || '';
  }

  try {
    const res = await apiRequest('/api/user/settings');
    const s = res.settings;
    if (s) {
      document.getElementById('setRemindWater').checked = !!s.remind_water;
      document.getElementById('setRemindBreak').checked = !!s.remind_break;
      document.getElementById('setRemindHealth').checked = !!s.remind_health;
      document.getElementById('setRemindMood').checked = !!s.remind_mood;
      document.getElementById('setRemindTasks').checked = !!s.remind_tasks;
      if (s.quiet_hours_start) document.getElementById('setQuietStart').value = s.quiet_hours_start;
      if (s.quiet_hours_end) document.getElementById('setQuietEnd').value = s.quiet_hours_end;
      if (s.notification_frequency) document.getElementById('setFrequency').value = s.notification_frequency;
      if (s.language) document.getElementById('setLanguage').value = s.language;
    }
  } catch (e) {}
}

// Utility: XSS prevention
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

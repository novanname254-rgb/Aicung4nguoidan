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
  deferredPwaPrompt: null,
  calendarAnchor: null, // ngày đang xem trong Kế hoạch (YYYY-MM-DD)
  routineAnchor: null,  // thứ Hai của tuần đang xem trong Thời gian biểu
  goals: [],
  settings: null
};

// Múi giờ của trình duyệt, gửi kèm mọi request để server tính "hôm nay" đúng.
const USER_TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Ho_Chi_Minh';
const L = (vi, en) => (AppState.language === 'vi' ? vi : en);
const PRIORITY_LABEL_VI = { high: 'CAO', medium: 'VỪA', low: 'THẤP' };
const RECURRING_VI = { daily: 'Hằng ngày', weekly: 'Hằng tuần', monthly: 'Hằng tháng' };
if (typeof window.tr !== 'function') window.tr = s => s;

// Ngày theo giờ địa phương (toISOString() là giờ UTC, ở Việt Nam trước 7h sáng sẽ lệch sang hôm qua).
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayLocal = () => localDateStr();

// I18N Helper
function t(key) {
  const dict = (window.I18N && window.I18N[AppState.language]) ? window.I18N[AppState.language] : (window.I18N ? window.I18N['vi'] : {});
  return dict[key] || key;
}

function applyLanguage(lang) {
  AppState.language = lang;
  localStorage.setItem('lifecare_lang', lang);
  document.documentElement.lang = lang;
  document.title = lang === 'vi' ? 'LifeCare – Cuộc Sống & Sự Cân Bằng' : 'LifeCare – Your Life, Your Balance';

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
  // Tiêu đề trang theo mục đang mở (phần tử này có data-i18n mặc định là "Bảng điều khiển")
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle && AppState.activeView) {
    const v = AppState.activeView;
    pageTitle.innerText = t('nav' + v.charAt(0).toUpperCase() + v.slice(1));
  }

  // Chữ chưa gắn data-i18n (giao diện mới, thông báo, dữ liệu mẫu) đi qua từ điển tự động
  if (window.I18nAuto) window.I18nAuto.refresh();

  // Re-render dynamic active views
  if (AppState.activeView === 'dashboard') loadDashboard();
  else if (AppState.activeView === 'planner') loadPlanner();
  else if (AppState.activeView === 'routine') loadRoutine();
  else if (AppState.activeView === 'goals') loadGoals();
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
    'X-Timezone': USER_TZ,
    'X-Language': AppState.language === 'en' ? 'en' : 'vi',
    ...(AppState.dataVersion ? { 'X-Data-Version': AppState.dataVersion } : {}),
    ...(AppState.token ? { 'Authorization': `Bearer ${AppState.token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });
    // Ghi nhớ phiên bản dữ liệu mới nhất đã thấy, để instance server khác không trả về bản cũ.
    const seenVersion = res.headers.get('X-Data-Version');
    if (seenVersion && (Number(seenVersion.split('-')[0]) || 0) >= (Number(String(AppState.dataVersion || '').split('-')[0]) || 0)) {
      AppState.dataVersion = seenVersion;
    }
    const data = await res.json();
    if (!res.ok) {
      // 401 có thể do instance server chưa kịp cập nhật phiên mới: thử lại một lần trước khi đăng xuất.
      if (res.status === 401 && AppState.token && !options._retried && !endpoint.startsWith('/api/auth/')) {
        await new Promise(r => setTimeout(r, 1200));
        return apiRequest(endpoint, { ...options, _retried: true });
      }
      if (res.status === 401 && AppState.token) {
        const wasGuest = AppState.user && AppState.user.is_guest;
        AppState.token = '';
        AppState.user = null;
        localStorage.removeItem('lifecare_token');
        updateUserUI();
        showAuthModal(true);
        if (wasGuest) showToast(L('Phiên khách đã kết thúc. Dữ liệu khách không được lưu lại.', 'Guest session ended; guest data was not kept.'), 'error');
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
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✓'}</span><span>${tr(message)}</span>`;
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
  bindPlanningUI();     // planning-ui.js: thời gian biểu, mục tiêu, gián đoạn, lịch tuần/ngày
  startReminderEngine(); // planning-ui.js: nhắc khi đến giờ mà chưa xác nhận hoàn thành

  // Apply initial language
  applyLanguage(AppState.language);

  // Phiên đăng nhập: có token thì kiểm tra lại, không thì cho người dùng chọn
  // đăng nhập / đăng ký (có lưu dữ liệu) hoặc tài khoản khách (không lưu).
  if (AppState.token) {
    try {
      const data = await apiRequest('/api/auth/me');
      onSignedIn(data.user, AppState.token);
    } catch (e) {
      showAuthModal(true);
    }
  } else {
    showAuthModal(true);
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
    routine: t('navRoutine'),
    goals: t('navGoals'),
    physical: t('navPhysical'),
    mental: t('navMental'),
    timeline: t('navTimeline'),
    statistics: t('navStatistics'),
    settings: t('navSettings')
  };
  document.getElementById('pageTitle').innerText = titles[viewName] || 'LifeCare';

  if (viewName === 'dashboard') loadDashboard();
  else if (viewName === 'planner') loadPlanner();
  else if (viewName === 'routine') loadRoutine();
  else if (viewName === 'goals') loadGoals();
  else if (viewName === 'physical') loadPhysicalHealth();
  else if (viewName === 'mental') loadMentalHealth();
  else if (viewName === 'timeline') loadTimeline('30days');
  else if (viewName === 'statistics') loadStatistics();
  else if (viewName === 'settings') loadSettings();
}

function updateUserUI() {
  const banner = document.getElementById('guestBanner');
  if (banner) banner.style.display = AppState.user && AppState.user.is_guest ? 'flex' : 'none';
  if (!AppState.user) return;
  document.getElementById('sidebarUserName').innerText = AppState.user.full_name;
  document.getElementById('sidebarUserEmail').innerText = AppState.user.is_guest
    ? L('Tài khoản khách · không lưu', 'Guest · not saved')
    : AppState.user.email;
  if (AppState.user.avatar) {
    document.getElementById('sidebarAvatar').src = AppState.user.avatar;
  }
}

// ==========================================
// 1. AUTHENTICATION CONTROLLER
// ==========================================
function bindAuthEvents() {
  const closeBtn = document.getElementById('authModalClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => showAuthModal(false));
  }
  const skipBtn = document.getElementById('skipAuthBtn');
  if (skipBtn) {
    skipBtn.addEventListener('click', async () => {
      skipBtn.disabled = true;
      try {
        const res = await apiRequest('/api/auth/guest', {
          method: 'POST',
          body: JSON.stringify({ sample_data: document.getElementById('guestSampleData').checked })
        });
        onSignedIn(res.user, res.token);
        showToast(L('Đang dùng tài khoản khách. Dữ liệu sẽ không được lưu.', 'Guest mode: nothing will be saved.'));
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        skipBtn.disabled = false;
      }
    });
  }
  document.getElementById('guestRegisterBtn')?.addEventListener('click', () => {
    showAuthModal(true);
    document.getElementById('showRegisterLink').click();
  });
  const modal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const title = document.getElementById('authModalTitle');

  document.getElementById('showRegisterLink').addEventListener('click', (e) => {
    e.preventDefault();
    // Đang là khách: cho chọn chuyển dữ liệu dùng thử sang tài khoản mới
    document.getElementById('guestMigrateRow').style.display = AppState.user && AppState.user.is_guest ? 'flex' : 'none';
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
      await endGuestSessionIfAny();
      onSignedIn(res.user, res.token);
      showToast(`${t('greetingMorning')}, ${res.user.full_name}!`);
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

      const keep_guest_data = document.getElementById('regKeepGuestData').checked;
      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ full_name, email, password, dob, gender, personal_goals, keep_guest_data })
      });

      // Dữ liệu khách đã được chuyển thì server đã xoá tài khoản khách; nếu không thì xoá ở đây.
      if (!res.migratedGuestData) await endGuestSessionIfAny();
      onSignedIn(res.user, res.token);
      showToast(res.migratedGuestData
        ? L('Đăng ký thành công! Dữ liệu dùng thử đã được chuyển sang và từ giờ sẽ được lưu.', 'Registered! Your trial data was moved over and will now be saved.')
        : L('Đăng ký thành công! Dữ liệu của bạn từ giờ sẽ được lưu.', 'Registration successful! Your data will be saved.'));
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
    const isGuest = AppState.user && AppState.user.is_guest;
    const question = isGuest
      ? L('Bạn đang dùng tài khoản khách. Đăng xuất sẽ xoá toàn bộ dữ liệu khách. Tiếp tục?', 'Signing out deletes all guest data. Continue?')
      : L('Bạn có chắc chắn muốn đăng xuất?', 'Are you sure you want to sign out?');
    if (confirm(question)) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      AppState.token = '';
      AppState.user = null;
      localStorage.removeItem('lifecare_token');
      updateUserUI();
      showAuthModal(true);
      showToast(AppState.language === 'vi' ? 'Đã đăng xuất.' : 'Signed out.');
    }
  });
}

function onSignedIn(user, token) {
  AppState.dataVersion = AppState.dataVersion || null;
  AppState.token = token;
  localStorage.setItem('lifecare_token', token);
  AppState.user = user;
  updateUserUI();
  showAuthModal(false);
  loadDashboard();
  afterLoginInit(); // planning-ui.js: nhắc việc, danh sách mục tiêu
}

/** Kết thúc phiên khách hiện tại (xoá dữ liệu khách trên server) trước khi đổi tài khoản. */
async function endGuestSessionIfAny() {
  if (AppState.user && AppState.user.is_guest && AppState.token) {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  }
}

function showAuthModal(show) {
  const modal = document.getElementById('authModal');
  // Chỉ cho đóng khi đã có phiên (đăng nhập hoặc khách); lần đầu phải chọn một cách sử dụng.
  const closeBtn = document.getElementById('authModalClose');
  if (closeBtn) closeBtn.style.display = AppState.user ? '' : 'none';
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
    const todayStr = todayLocal();
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
      document.getElementById('dashSleepQuality').innerText = `${t('sleepQuality').replace(/^\d+\.\s*/, '')}: ${tr(dash.healthStatus.latestPhysical.sleep_quality || 'Good')}`;
    } else {
      document.getElementById('dashSleepDuration').innerText = '--';
      document.getElementById('dashSleepQuality').innerText = t('pendingCheckin');
    }

    // Mood Metric
    if (dash.emotionalStatus.latestMood) {
      document.getElementById('dashMoodValue').innerText = `${dash.emotionalStatus.latestMood.emoji || '✨'} ${tr(dash.emotionalStatus.latestMood.mood)}`;
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
    loadGoalAlerts();
    maybePromptDailyCheckin(dash.healthStatus.todayCheckinCompleted);
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

  const todayStr = todayLocal();

  container.innerHTML = tasks.map(task => {
    const isOverdue = task.status !== 'completed' && task.date < todayStr;
    return `
      <div class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}">
        <input type="checkbox" class="task-checkbox" ${task.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${task.id}', this.checked)" />
        <div class="task-details">
          <div class="task-title">
            ${escapeHTML(task.title)}
            ${isOverdue ? `<span class="badge badge-overdue">${t('overdue')}</span>` : ''}
            ${task.recurring && task.recurring !== 'none' ? `<span class="badge badge-recurring">🔄 ${tr(RECURRING_VI[task.recurring] || task.recurring)}</span>` : ''}
          </div>
          <div class="task-meta">
            <span class="badge badge-${task.category.toLowerCase()}">${tr(task.category)}</span>
            <span class="priority-${task.priority}">${t('priorityLabel')}: ${L(PRIORITY_LABEL_VI[task.priority] || task.priority, task.priority.toUpperCase())}</span>
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
          ${tr(health.physical_condition || 'Good')} • ${health.sleep_duration || '--'}h • ${health.water_ml ? health.water_ml + ' ml' : '-- ml'}
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
          ${mood.emoji || ''} ${tr(mood.mood)} • ${AppState.language === 'vi' ? 'Căng thẳng' : 'Stress'}: ${mood.stress_level || 2}/5
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
      const moodSelect = document.getElementById('rapidMood');
      const mood = moodSelect.value;
      const sleep_duration = parseFloat(document.getElementById('rapidSleep').value);
      const stress_level = parseInt(document.getElementById('rapidStress').value);
      const energy_level = parseInt(document.getElementById('rapidEnergy').value);
      const motivation_level = parseInt(document.getElementById('rapidMotivation').value);
      const emoji = moodSelect.options[moodSelect.selectedIndex].text.split(' ')[0];

      await apiRequest('/api/checkin/quick', {
        method: 'POST',
        body: JSON.stringify({
          mood,
          emoji,
          sleep_duration,
          stress_level,
          energy_level,
          motivation_level,
          physical_condition: energy_level >= 4 ? 'Good' : energy_level <= 2 ? 'Tired' : 'Normal'
        })
      });

      closeRapid();
      document.getElementById('proactiveBanner').style.display = 'none';
      showToast(AppState.language === 'vi' ? 'Đã ghi nhận trạng thái hôm nay!' : 'Today\'s check-in saved!');
      loadDashboard();

      // AI so sánh với tâm lý nền rồi điều chỉnh nhẹ lịch hôm nay
      if (document.getElementById('rapidAiAdjust').checked) {
        const moodText = moodSelect.options[moodSelect.selectedIndex].text;
        sendAiMessage(
          L(`Kiểm tra trạng thái hôm nay: tâm trạng ${moodText}, ngủ khoảng ${sleep_duration} giờ, áp lực ${stress_level}/5, năng lượng ${energy_level}/5, ý chí/động lực ${motivation_level}/5. Hãy xem lịch hôm nay và điều chỉnh nhẹ nếu cần.`,
            `Today's check-in: mood ${moodText}, slept about ${sleep_duration} hours, pressure ${stress_level}/5, energy ${energy_level}/5, willpower/motivation ${motivation_level}/5. Please review today's plan and adjust it gently if needed.`),
          { intent: 'daily_adjust' }
        );
      }
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
      const goal_id = document.getElementById('taskGoal').value;
      const duration_minutes = document.getElementById('taskDuration').value;
      const deadline = document.getElementById('taskDeadline').value;

      if (id) {
        await apiRequest(`/api/tasks/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time, recurring, reminder_time, goal_id, duration_minutes, deadline })
        });
        showToast(AppState.language === 'vi' ? 'Đã cập nhật công việc.' : 'Task updated.');
      } else {
        const res = await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time, recurring, reminder_time, goal_id, duration_minutes, deadline })
        });
        showToast(AppState.language === 'vi' ? 'Đã tạo công việc mới.' : 'Task created.');
        if (res.overlapWarning) {
          alert('⚠️ ' + res.overlapWarning);
        }
      }

      taskModal.classList.remove('active');
      refreshActiveView();
      refreshReminderTasks();
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
    renderCalendar(); // planning-ui.js
    filterAndRenderTaskList();
    refreshGoalOptions();
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: #DC2626;">⚠️ Lỗi: ${err.message}</div>`;
  }
}

function openTaskModal(task = null, defaultDate = null, defaultStart = '', defaultEnd = '') {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('taskModalTitle');
  document.getElementById('taskIdInput').value = task ? task.id : '';
  document.getElementById('taskTitle').value = task ? task.title : '';
  document.getElementById('taskDesc').value = task ? (task.description || '') : '';
  document.getElementById('taskCategory').value = task ? task.category : 'Work';
  document.getElementById('taskPriority').value = task ? task.priority : 'medium';
  document.getElementById('taskDate').value = task ? task.date : (defaultDate || todayLocal());
  document.getElementById('taskStartTime').value = task ? (task.start_time || '') : defaultStart;
  document.getElementById('taskEndTime').value = task ? (task.end_time || '') : defaultEnd;
  refreshGoalOptions().then(() => { document.getElementById('taskGoal').value = task ? (task.goal_id || '') : ''; });
  document.getElementById('taskDuration').value = task ? (task.duration_minutes || '') : '';
  document.getElementById('taskDeadline').value = task ? (task.deadline || '') : '';
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
    refreshActiveView();
    refreshReminderTasks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (confirm(AppState.language === 'vi' ? 'Bạn có chắc chắn muốn xóa công việc này?' : 'Delete this task?')) {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      showToast(AppState.language === 'vi' ? 'Đã xóa công việc.' : 'Task removed.');
      refreshActiveView();
      refreshReminderTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

function filterAndRenderTaskList() {
  const container = document.getElementById('allTasksList');
  const search = document.getElementById('taskSearchInput').value.toLowerCase();
  const cat = document.getElementById('taskCategoryFilter').value;
  const prio = document.getElementById('taskPriorityFilter').value;
  const todayStr = todayLocal();

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
            ${tItem.recurring && tItem.recurring !== 'none' ? `<span class="badge badge-recurring">🔄 ${tr(RECURRING_VI[tItem.recurring] || tItem.recurring)}</span>` : ''}
          </div>
          <div class="task-meta">
            <span>📅 ${tItem.date}</span>
            ${tItem.start_time ? `<span>🕒 ${tItem.start_time} ${tItem.end_time ? '– ' + tItem.end_time : ''}</span>` : ''}
            <span class="badge badge-${tItem.category.toLowerCase()}">${tr(tItem.category)}</span>
            <span class="priority-${tItem.priority}">${t('priorityLabel')}: ${L(PRIORITY_LABEL_VI[tItem.priority] || tItem.priority, tItem.priority.toUpperCase())}</span>
            ${tItem.reminder_time ? `<span>⏰ ${L('Nhắc', 'Reminder')}: ${tItem.reminder_time}</span>` : ''}
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
      const checkin_date = document.getElementById('physDate').value || todayLocal();
      const physical_condition = document.getElementById('physCondition').value;
      const sleep_duration = document.getElementById('physSleepHours').value;
      const sleep_quality = document.getElementById('physSleepQuality').value;
      const exercise_status = document.getElementById('physExercise').value;
      const exercise_type = document.getElementById('physExerciseType').value;
      const exercise_duration = document.getElementById('physExerciseDuration').value;
      const meals_summary = document.getElementById('physMealsSummary').value;
      const water_ml = document.getElementById('physWater').value;
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
          water_ml,
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
  document.getElementById('physDate').value = todayLocal();
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
          <span style="color: var(--primary);">${tr(r.physical_condition || 'Good')}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
          💤 ${t('sleepHours')}: <strong>${r.sleep_duration ? r.sleep_duration + 'h' : '--'}</strong> (${tr(r.sleep_quality || 'Good')}) • 💧 ${L('Nước', 'Water')}: <strong>${r.water_ml ? r.water_ml + ' ml' : '--'}</strong> • ⚡ ${L('Năng lượng', 'Energy')}: <strong>${r.energy_level || '--'}/5</strong>
        </div>
        ${r.exercise_type ? `<div style="font-size: 0.8rem; color: var(--text-heading); margin-top: 4px;">🏃 ${L('Vận động', 'Activity')}: <strong>${escapeHTML(r.exercise_type)}</strong> (${r.exercise_duration || 0} ${L('phút', 'min')})</div>` : ''}
        ${r.meals_summary ? `<div style="font-size: 0.8rem; color: var(--text-heading); margin-top: 4px;">🥗 ${L('Dự kiến bữa ăn', 'Planned meals')}: ${escapeHTML(r.meals_summary)}</div>` : ''}
        ${r.discomfort ? `<div style="font-size: 0.78rem; color: #DC2626; margin-top: 4px;">⚠️ ${L('Triệu chứng', 'Symptoms')}: ${escapeHTML(tr(r.discomfort))}</div>` : ''}
        ${r.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-style: italic;">"${escapeHTML(tr(r.notes))}"</div>` : ''}
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
          <span>${m.emoji || '✨'} ${tr(m.mood)}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 6px;">
          ${L('Căng thẳng', 'Stress')}: <strong>${m.stress_level || '--'}/5</strong> • ${L('Động lực', 'Motivation')}: <strong>${m.motivation_level || '--'}/5</strong> • ${L('Kết nối', 'Connection')}: <strong>${m.connected_score || '--'}/5</strong>
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
    pastDays.push(localDateStr(d));
  }

  let html = `<div class="mood-calendar-grid">`;
  pastDays.forEach(dateStr => {
    const dayRecord = moodMap.get(dateStr);
    const dayLabel = dateStr.substring(8);
    html += `
      <div class="mood-cal-cell" title="${dateStr}: ${dayRecord ? tr(dayRecord.mood) : L('Chưa ghi', 'Not logged')}">
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
              ${m ? `<span class="badge" style="background: var(--accent-light); color: var(--accent); font-size: 0.82rem;">${m.emoji || '✨'} ${tr(m.mood)}</span>` : ''}
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 8px;">
              ${h ? `
                <div style="font-size: 0.82rem; color: var(--text-muted);">
                  💤 ${L('Giấc ngủ', 'Sleep')}: <strong>${h.sleep_duration ? h.sleep_duration + 'h' : '--'}</strong><br/>
                  💧 ${L('Nước uống', 'Water')}: <strong>${h.water_ml ? h.water_ml + ' ml' : '--'}</strong><br/>
                  🏃 ${L('Vận động', 'Activity')}: <strong>${tr(h.exercise_status || 'No')}</strong> ${h.exercise_type ? '(' + h.exercise_type + ')' : ''}
                </div>
              ` : `<div style="font-size: 0.82rem; color: var(--text-muted);">${L('Chưa điểm danh thể chất', 'No physical check-in')}</div>`}

              ${m ? `
                <div style="font-size: 0.82rem; color: var(--text-muted);">
                  ⚡ ${L('Căng thẳng', 'Stress')}: <strong>${m.stress_level || '--'}/5</strong><br/>
                  🌱 ${L('Động lực', 'Motivation')}: <strong>${m.motivation_level || '--'}/5</strong><br/>
                  🧘 ${L('Thư thái', 'Relaxation')}: <strong>${m.relaxed_score || '--'}/5</strong>
                </div>
              ` : `<div style="font-size: 0.82rem; color: var(--text-muted);">${L('Chưa phản chiếu tâm trạng', 'No mood reflection')}</div>`}
            </div>

            ${tasks.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted);">
                ${L('Đã hoàn thành', 'Completed')} ${tasks.filter(tItem => tItem.status === 'completed').length} / ${tasks.length} ${L('công việc', 'tasks')}
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
        labels: catLabels.length > 0 ? catLabels.map(tr) : [L('Chưa có công việc', 'No tasks yet')],
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
        labels: moodLabels.length > 0 ? moodLabels.map(tr) : [L('Chưa có dữ liệu', 'No data yet')],
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
        showToast(L('Vui lòng chọn cả ngày bắt đầu và kết thúc', 'Please choose both a start and end date'), 'error');
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;
    input.value = '';
    sendAiMessage(userMsg);
  });
}

/**
 * Gửi tin nhắn cho trợ lý AI (từ ô chat hoặc từ các nút: check-in, gián đoạn, chia nhỏ mục tiêu...).
 * intent: daily_adjust | disruption | goal_breakdown | allocate_free_time | behind_schedule
 */
let aiBusy = false;
async function sendAiMessage(userMsg, { intent = null } = {}) {
  const drawer = document.getElementById('aiChatDrawer');
  const msgArea = document.getElementById('aiChatMessages');
  drawer.classList.add('active');
  if (aiBusy) {
    showToast(L('Trợ lý đang trả lời tin trước, chờ chút nhé.', 'The assistant is still replying.'), 'error');
    return;
  }
  aiBusy = true;
  appendChatBubble('user', userMsg);
  const loadingBubble = appendChatBubble('assistant', L('LifeCare AI đang suy nghĩ...', 'LifeCare AI is reflecting...'));

  try {
    const res = await apiRequest('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: userMsg, mode: AppState.aiMode, language: AppState.language, intent })
    });

    loadingBubble.remove();
    const replyBubble = appendChatBubble('assistant', res.reply);

    // Lỗi tạm thời (VD hết hạn mức Groq trong phút này): cho bấm "Thử lại" với đúng câu hỏi cũ.
    if (res.type === 'error' && res.retryable) {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn-secondary small ai-retry-btn';
      retryBtn.textContent = L('↻ Thử lại', '↻ Retry');
      retryBtn.addEventListener('click', () => {
        retryBtn.disabled = true;
        replyBubble.remove();
        retryBtn.remove();
        msgArea.querySelectorAll('.chat-msg.user').forEach((b, i, all) => { if (i === all.length - 1) b.remove(); });
        sendAiMessage(userMsg, { intent });
      });
      msgArea.appendChild(retryBtn);
      msgArea.scrollTop = msgArea.scrollHeight;
    }

    // Trợ lý AI đã tự thay đổi dữ liệu: báo và tải lại màn hình đang mở.
    const c = res.tasksChanged;
    if (c && Object.values(c).some(Boolean)) {
      const parts = [];
      if (c.added) parts.push(L(`thêm ${c.added} việc`, `${c.added} added`));
      if (c.updated) parts.push(L(`sửa ${c.updated} việc`, `${c.updated} updated`));
      if (c.deleted) parts.push(L(`xoá ${c.deleted} việc`, `${c.deleted} deleted`));
      if (c.goals) parts.push(L('cập nhật mục tiêu', 'goals updated'));
      if (c.progress) parts.push(L('ghi tiến độ', 'progress logged'));
      if (c.disruptions) parts.push(L('ghi gián đoạn', 'disruption saved'));
      showToast(L('Đã cập nhật: ', 'Updated: ') + parts.join(', '));
      refreshActiveView();
      refreshReminderTasks();
    }

    if (res.suggestedTasks && res.suggestedTasks.length > 0) {
      const suggestionDiv = document.createElement('div');
      suggestionDiv.style.padding = '8px 12px';
      suggestionDiv.style.fontSize = '0.8rem';
      suggestionDiv.style.background = 'var(--primary-light)';
      suggestionDiv.style.borderRadius = 'var(--radius-sm)';
      suggestionDiv.style.marginTop = '6px';
      suggestionDiv.innerHTML = `
        <strong>${t('addAiTaskBtn')}:</strong> "${escapeHTML(res.suggestedTasks[0].title)}"
        <br/><button class="btn btn-primary" style="font-size: 0.72rem; padding: 4px 8px; margin-top: 4px;">+ Thêm vào Lịch</button>
      `;
      suggestionDiv.querySelector('button').addEventListener('click', () => addAiSuggestedTask(res.suggestedTasks[0]));
      msgArea.appendChild(suggestionDiv);
      msgArea.scrollTop = msgArea.scrollHeight;
    }
  } catch (err) {
    loadingBubble.innerText = L('Lỗi kết nối: ', 'Connection error: ') + err.message;
  } finally {
    aiBusy = false;
  }
}

/** Tải lại màn hình đang mở sau khi dữ liệu thay đổi. */
function refreshActiveView() {
  const v = AppState.activeView;
  if (v === 'dashboard') loadDashboard();
  else if (v === 'planner') loadPlanner();
  else if (v === 'routine') loadRoutine();
  else if (v === 'goals') loadGoals();
}

function appendChatBubble(role, text) {
  const msgArea = document.getElementById('aiChatMessages');
  const bubble = document.createElement('div');
  bubble.className = `chat-msg ${role}`;
  // Chữ thuần: chặn mọi HTML, chỉ đổi **đậm** và xuống dòng.
  const safe = String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  bubble.innerHTML = safe.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
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
        date: todayLocal(),
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
          language,
          remind_repeat_minutes: Number(document.getElementById('setRemindRepeat').value),
          remind_overdue: document.getElementById('setRemindOverdue').checked
        })
      });
      loadReminderSettings();

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
      if (s.remind_repeat_minutes) document.getElementById('setRemindRepeat').value = String(s.remind_repeat_minutes);
      document.getElementById('setRemindOverdue').checked = s.remind_overdue !== 0;
    }
  } catch (e) {}
  loadPsychForm(); // planning-ui.js
  updateNotifPermissionText();
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

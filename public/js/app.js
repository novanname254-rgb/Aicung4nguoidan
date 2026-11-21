/**
 * LifeCare – Your Life, Your Balance
 * Complete Client-Side Application Controller
 */

// Global state
const AppState = {
  token: localStorage.getItem('lifecare_token') || '',
  user: null,
  activeView: 'dashboard',
  tasks: [],
  notifications: [],
  calendarView: 'month', // 'month', 'week', 'day'
  charts: {},
  theme: localStorage.getItem('lifecare_theme') || 'light',
  deferredPwaPrompt: null
};

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
        // Token expired or invalid
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
  bindNavigation();
  bindAuthEvents();
  bindPlannerEvents();
  bindHealthEvents();
  bindMoodEvents();
  bindAiChat();
  bindSettings();
  bindProactiveBanner();

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
    // Attempt auto-login with pre-seeded demo user
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
        console.log('User PWA install response:', choice.outcome);
        AppState.deferredPwaPrompt = null;
      });
    }
  });
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
    // Update charts if loaded
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
  // Mobile drawer toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('appSidebar');
  mobileBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Nav links
  const links = document.querySelectorAll('.sidebar-nav .nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.getAttribute('data-view');
      navigateToView(view);
      sidebar.classList.remove('open');
    });
  });

  // Logo goes to dashboard
  document.getElementById('brandLogo').addEventListener('click', (e) => {
    e.preventDefault();
    navigateToView('dashboard');
  });

  // Dashboard quick triggers
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
    dashboard: 'Dashboard',
    planner: 'My Planner & Schedule',
    physical: 'Physical Health Check-in',
    mental: 'Mental Wellness & Mood Reflection',
    timeline: 'Personal Health Timeline',
    statistics: 'Statistics & Personal Reports',
    settings: 'Settings & Privacy'
  };
  document.getElementById('pageTitle').innerText = titles[viewName] || 'LifeCare';

  // Load view-specific data
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'planner') loadPlanner();
  if (viewName === 'physical') loadPhysicalHealth();
  if (viewName === 'mental') loadMentalHealth();
  if (viewName === 'timeline') loadTimeline('30days');
  if (viewName === 'statistics') loadStatistics();
  if (viewName === 'settings') loadSettings();
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

  // Switch between forms
  document.getElementById('showRegisterLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    forgotForm.style.display = 'none';
    title.innerText = 'Create your LifeCare Account';
  });

  document.getElementById('showLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    forgotForm.style.display = 'none';
    title.innerText = 'Sign In to LifeCare';
  });

  document.getElementById('showForgotLink').addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'none';
    forgotForm.style.display = 'block';
    title.innerText = 'Password Recovery';
  });

  document.getElementById('backToLoginLink').addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    forgotForm.style.display = 'none';
    loginForm.style.display = 'block';
    title.innerText = 'Sign In to LifeCare';
  });

  // Login Submit
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
      showToast(`Welcome back, ${res.user.full_name}!`);
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Register Submit
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
      showToast('Registration successful! Welcome to LifeCare.');
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Forgot Password Submit
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('forgotEmail').value;
      const res = await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showToast(res.message);
      if (res.demoResetToken) {
        alert(`DEMO MODE NOTICE:\nPassword reset token created:\n${res.demoResetToken}\n(In production this is delivered via secure email)`);
      }
      document.getElementById('backToLoginLink').click();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Logout
  document.getElementById('sidebarLogoutBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to sign out?')) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      } catch (e) {}
      AppState.token = '';
      AppState.user = null;
      localStorage.removeItem('lifecare_token');
      showAuthModal(true);
      showToast('Signed out successfully.');
    }
  });
}

function showAuthModal(show) {
  const modal = document.getElementById('authModal');
  if (show) {
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
  }
}

// ==========================================
// 2. MAIN DASHBOARD CONTROLLER
// ==========================================
async function loadDashboard() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await apiRequest(`/api/dashboard?date=${todayStr}`);
    const dash = data.data;

    // Greeting by time of day
    const hour = new Date().getHours();
    let timeGreeting = 'Good morning';
    let emoji = '🌅';
    if (hour >= 12 && hour < 17) {
      timeGreeting = 'Good afternoon';
      emoji = '☀️';
    } else if (hour >= 17) {
      timeGreeting = 'Good evening';
      emoji = '🌙';
    }

    const firstName = dash.user.full_name ? dash.user.full_name.split(' ')[0] : 'there';
    document.getElementById('welcomeGreeting').innerText = `${timeGreeting}, ${firstName}! ${emoji}`;

    const dateOptions = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString('en-US', dateOptions);

    // Metrics
    document.getElementById('dashCompletedTasks').innerText = dash.taskStats.completed;
    document.getElementById('dashRemainingTasks').innerText = dash.taskStats.remaining;
    document.getElementById('dashCompletionRate').innerText = `${dash.taskStats.completionRate}% of today's plan`;

    // Sleep Metric
    if (dash.healthStatus.latestPhysical && dash.healthStatus.latestPhysical.sleep_duration) {
      document.getElementById('dashSleepDuration').innerText = `${dash.healthStatus.latestPhysical.sleep_duration}h`;
      document.getElementById('dashSleepQuality').innerText = `Quality: ${dash.healthStatus.latestPhysical.sleep_quality || 'Good'}`;
    } else {
      document.getElementById('dashSleepDuration').innerText = '--';
      document.getElementById('dashSleepQuality').innerText = 'Check-in pending';
    }

    // Mood Metric
    if (dash.emotionalStatus.latestMood) {
      document.getElementById('dashMoodValue').innerText = `${dash.emotionalStatus.latestMood.emoji || '✨'} ${dash.emotionalStatus.latestMood.mood}`;
      document.getElementById('dashMoodSub').innerText = 'Last logged today';
    } else {
      document.getElementById('dashMoodValue').innerText = 'Pending';
      document.getElementById('dashMoodSub').innerText = 'Reflection waiting';
    }

    // Today's schedule rendering
    renderDashboardTasks(dash.todayTasks);

    // Health overview column
    renderDashboardHealthOverview(dash.healthStatus.latestPhysical, dash.emotionalStatus.latestMood);

    // Check proactive checkin banner status (Feature #1)
    if (dash.healthStatus.todayCheckinCompleted) {
      document.getElementById('proactiveBanner').style.display = 'none';
    } else {
      document.getElementById('proactiveBanner').style.display = 'flex';
    }

    // Feature #4: Smart Schedule Recommendation
    loadScheduleRecommendations();
  } catch (err) {
    console.error('Failed loading dashboard:', err);
  }
}

function renderDashboardTasks(tasks) {
  const container = document.getElementById('dashTodayTasksList');
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 8px;">🕊️ No tasks scheduled yet for today.</p>
        <p style="font-size: 0.85rem;">Take a moment to plan your key priorities or enjoy a restorative day.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tasks.map(task => `
    <div class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}">
      <input type="checkbox" class="task-checkbox" ${task.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${task.id}', this.checked)" />
      <div class="task-details">
        <div class="task-title">${escapeHTML(task.title)}</div>
        <div class="task-meta">
          <span class="badge badge-${task.category.toLowerCase()}">${task.category}</span>
          <span class="priority-${task.priority}">Priority: ${task.priority.toUpperCase()}</span>
          ${task.start_time ? `<span>🕒 ${task.start_time} ${task.end_time ? '– ' + task.end_time : ''}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderDashboardHealthOverview(health, mood) {
  const container = document.getElementById('dashHealthOverviewContent');
  if (!health && !mood) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.86rem;">No check-ins recorded yet today. Check-ins help track subtle patterns over time!</p>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
  if (health) {
    html += `
      <div style="background: var(--bg-main); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">Physical Vitality</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          Condition: <strong>${health.physical_condition || 'Good'}</strong> • Sleep: <strong>${health.sleep_duration || '--'}h</strong> • Water: <strong>${health.water_intake || '--'}L</strong>
        </div>
      </div>
    `;
  }
  if (mood) {
    html += `
      <div style="background: var(--bg-main); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">Emotional Balance</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          Mood: <strong>${mood.emoji || ''} ${mood.mood}</strong> • Stress Level: <strong>${mood.stress_level || 2}/5</strong>
        </div>
      </div>
    `;
  }
  html += `</div>`;
  container.innerHTML = html;
}

// Feature #4: Smart Schedule Recommendations
async function loadScheduleRecommendations() {
  try {
    const res = await apiRequest('/api/schedule/recommendations');
    const summaryEl = document.getElementById('scheduleRecSummary');
    if (res.recommendations && res.recommendations.length > 0) {
      summaryEl.innerText = res.recommendations[0];
    }
    document.getElementById('btnApplyScheduleRec').onclick = () => {
      alert(`LifeCare Schedule Balance Insight:\n\n${res.summary}\n\nKey Recommendations:\n${res.recommendations.map(r => '• ' + r).join('\n')}`);
    };
  } catch (e) {}
}

// Quick Dashboard Action Triggers
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

  // Submit rapid 30s checkin
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
      showToast('30-second check-in saved! Have a wonderful day.');
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

  // Task form submission
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

      if (id) {
        await apiRequest(`/api/tasks/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time })
        });
        showToast('Task updated successfully.');
      } else {
        await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({ title, description, category, priority, date, start_time, end_time })
        });
        showToast('New task added to schedule.');
      }

      taskModal.classList.remove('active');
      loadPlanner();
      if (AppState.activeView === 'dashboard') loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Calendar View Switchers (Month / Week / Day)
  document.querySelectorAll('.calendar-view-tabs .view-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calendar-view-tabs .view-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.calendarView = btn.getAttribute('data-cal-view');
      renderCalendar();
    });
  });

  // Filters
  document.getElementById('taskSearchInput').addEventListener('input', () => filterAndRenderTaskList());
  document.getElementById('taskCategoryFilter').addEventListener('change', () => filterAndRenderTaskList());
  document.getElementById('taskPriorityFilter').addEventListener('change', () => filterAndRenderTaskList());
}

async function loadPlanner() {
  try {
    const data = await apiRequest('/api/tasks');
    AppState.tasks = data.tasks || [];
    renderCalendar();
    filterAndRenderTaskList();
  } catch (err) {
    showToast(err.message, 'error');
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

  title.innerText = task ? 'Edit Task or Event' : 'Create Task or Event';
  modal.classList.add('active');
}

async function toggleTaskStatus(taskId, completed) {
  try {
    await apiRequest(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: completed ? 'completed' : 'pending' })
    });
    // Update local state
    const t = AppState.tasks.find(x => x.id === taskId);
    if (t) t.status = completed ? 'completed' : 'pending';
    if (AppState.activeView === 'dashboard') loadDashboard();
    if (AppState.activeView === 'planner') loadPlanner();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (confirm('Delete this task from your planner?')) {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      showToast('Task removed.');
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
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let html = `
      <div style="font-weight: 800; font-size: 1.1rem; color: var(--text-heading); margin-bottom: 12px;">
        ${monthNames[month]} ${year}
      </div>
      <div class="month-grid">
        <div class="month-day-header">Sun</div>
        <div class="month-day-header">Mon</div>
        <div class="month-day-header">Tue</div>
        <div class="month-day-header">Wed</div>
        <div class="month-day-header">Thu</div>
        <div class="month-day-header">Fri</div>
        <div class="month-day-header">Sat</div>
    `;

    // Empty offset slots
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
          ${dayTasks.length > 2 ? `<div style="font-size: 0.65rem; color: var(--primary); font-weight: 700;">+${dayTasks.length - 2} more</div>` : ''}
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
        <h4 style="margin-bottom: 12px;">Tasks for ${AppState.calendarView === 'day' ? 'Today (' + todayStr + ')' : 'Current Period'}</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${filtered.length === 0 ? '<p style="color: var(--text-muted);">No tasks scheduled in this view.</p>' : filtered.map(t => `
            <div class="task-item" style="margin-bottom: 0;">
              <input type="checkbox" class="task-checkbox" ${t.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${t.id}', this.checked)" />
              <div class="task-details">
                <div class="task-title">${escapeHTML(t.title)}</div>
                <div class="task-meta">
                  <span>📅 ${t.date}</span>
                  ${t.start_time ? `<span>🕒 ${t.start_time}</span>` : ''}
                  <span class="badge badge-${t.category.toLowerCase()}">${t.category}</span>
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

  const filtered = AppState.tasks.filter(t => {
    const matchSearch = t.title.toLowerCase().includes(search) || (t.description && t.description.toLowerCase().includes(search));
    const matchCat = cat === 'all' || t.category === cat;
    const matchPrio = prio === 'all' || t.priority === prio;
    return matchSearch && matchCat && matchPrio;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 24px 0;">No matching tasks found.</p>`;
    return;
  }

  container.innerHTML = filtered.map(t => `
    <div class="task-item ${t.status === 'completed' ? 'completed' : ''}">
      <input type="checkbox" class="task-checkbox" ${t.status === 'completed' ? 'checked' : ''} onchange="toggleTaskStatus('${t.id}', this.checked)" />
      <div class="task-details">
        <div class="task-title">${escapeHTML(t.title)}</div>
        <div class="task-meta">
          <span>📅 ${t.date}</span>
          ${t.start_time ? `<span>🕒 ${t.start_time} ${t.end_time ? '– ' + t.end_time : ''}</span>` : ''}
          <span class="badge badge-${t.category.toLowerCase()}">${t.category}</span>
          <span class="priority-${t.priority}">Priority: ${t.priority.toUpperCase()}</span>
        </div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="btn-icon" style="width: 32px; height: 32px;" onclick='openTaskModal(${JSON.stringify(t).replace(/'/g, "&#39;")})' title="Edit">✎</button>
        <button class="btn-icon" style="width: 32px; height: 32px; color: #DC2626;" onclick="deleteTask('${t.id}')" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

// ==========================================
// 4. PHYSICAL HEALTH CHECK-IN
// ==========================================
function bindHealthEvents() {
  // Energy Rating buttons 1 to 5
  document.querySelectorAll('#energyRatingGroup .rating-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#energyRatingGroup .rating-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('physEnergyLevel').value = btn.getAttribute('data-val');
    });
  });

  // Physical Form Submit
  document.getElementById('physicalCheckinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const checkin_date = document.getElementById('physDate').value || new Date().toISOString().split('T')[0];
      const physical_condition = document.getElementById('physCondition').value;
      const sleep_duration = parseFloat(document.getElementById('physSleepHours').value) || null;
      const sleep_quality = document.getElementById('physSleepQuality').value;
      const exercise_status = document.getElementById('physExercise').value;
      const water_intake = parseFloat(document.getElementById('physWater').value) || null;
      const energy_level = parseInt(document.getElementById('physEnergyLevel').value) || null;
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
          water_intake,
          energy_level,
          discomfort,
          notes
        })
      });

      showToast(res.message);
      if (res.adviceNotice) {
        alert(res.adviceNotice);
      }
      loadPhysicalHealth();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadPhysicalHealth() {
  document.getElementById('physDate').value = new Date().toISOString().split('T')[0];
  try {
    const res = await apiRequest('/api/health?limit=15');
    const records = res.records || [];
    const container = document.getElementById('physicalHistoryList');

    if (records.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">No health check-ins recorded yet.</p>`;
      return;
    }

    container.innerHTML = records.map(r => `
      <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">
          <span>📅 ${r.checkin_date}</span>
          <span style="color: var(--primary);">${r.physical_condition || 'Good'}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
          Sleep: <strong>${r.sleep_duration ? r.sleep_duration + 'h' : '--'}</strong> (${r.sleep_quality || 'Good'}) • Water: <strong>${r.water_intake ? r.water_intake + 'L' : '--'}</strong> • Energy: <strong>${r.energy_level || '--'}/5</strong>
        </div>
        ${r.discomfort ? `<div style="font-size: 0.78rem; color: #DC2626; margin-top: 4px;">Symptom note: ${escapeHTML(r.discomfort)}</div>` : ''}
        ${r.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px; font-style: italic;">"${escapeHTML(r.notes)}"</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 5. MENTAL HEALTH & EMOTIONAL WELLNESS
// ==========================================
function bindMoodEvents() {
  // Mood Picker Grid
  document.querySelectorAll('#moodPickerGrid .mood-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#moodPickerGrid .mood-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('selectedMood').value = btn.getAttribute('data-mood');
      document.getElementById('selectedEmoji').value = btn.getAttribute('data-emoji');
    });
  });

  // Mood Form Submit
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
          emotional_notes
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
  try {
    const res = await apiRequest('/api/mood?limit=15');
    const records = res.records || [];
    const container = document.getElementById('moodHistoryList');

    if (records.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">No emotional reflections recorded yet.</p>`;
      return;
    }

    container.innerHTML = records.map(m => `
      <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">
          <span>📅 ${m.checkin_date}</span>
          <span>${m.emoji || '✨'} ${m.mood}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
          Stress: <strong>${m.stress_level || '--'}/5</strong> • Motivation: <strong>${m.motivation_level || '--'}/5</strong> • Connected: <strong>${m.connected_score || '--'}/5</strong>
        </div>
        ${m.emotional_notes ? `<div style="font-size: 0.8rem; color: var(--text-main); margin-top: 6px; font-style: italic;">"${escapeHTML(m.emotional_notes)}"</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 6. PERSONAL HEALTH TIMELINE (Feature #3)
// ==========================================
async function loadTimeline(range = '30days') {
  try {
    const res = await apiRequest(`/api/timeline?range=${range}`);
    const timeline = res.timeline || [];
    const container = document.getElementById('timelineContainer');

    if (timeline.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No historical timeline milestones found for this range yet.</p>
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
                  💤 Sleep: <strong>${h.sleep_duration ? h.sleep_duration + 'h' : '--'}</strong><br/>
                  💧 Water: <strong>${h.water_intake ? h.water_intake + 'L' : '--'}</strong><br/>
                  🏃 Exercised: <strong>${h.exercise_status || 'No'}</strong>
                </div>
              ` : '<div style="font-size: 0.82rem; color: var(--text-muted);">No physical check-in</div>'}

              ${m ? `
                <div style="font-size: 0.82rem; color: var(--text-muted);">
                  ⚡ Stress Level: <strong>${m.stress_level || '--'}/5</strong><br/>
                  🌱 Motivation: <strong>${m.motivation_level || '--'}/5</strong><br/>
                  🧘 Relaxed Score: <strong>${m.relaxed_score || '--'}/5</strong>
                </div>
              ` : '<div style="font-size: 0.82rem; color: var(--text-muted);">No emotional log</div>'}
            </div>

            ${tasks.length > 0 ? `
              <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted);">
                Completed tasks on this day: ${tasks.filter(t => t.status === 'completed').length} / ${tasks.length}
              </div>
            ` : ''}

            ${(m && m.emotional_notes) ? `
              <div style="margin-top: 8px; font-size: 0.82rem; font-style: italic; color: var(--text-main); background: var(--bg-main); padding: 8px; border-radius: var(--radius-sm);">
                "${escapeHTML(m.emotional_notes)}"
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Range tab binders
    document.querySelectorAll('[data-timeline-range]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('[data-timeline-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadTimeline(btn.getAttribute('data-timeline-range'));
      };
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 7. STATISTICS & CHARTS
// ==========================================
async function loadStatistics() {
  try {
    // 1. Weekly report summary (Feature #5)
    loadWeeklyReport();

    // 2. Fetch raw series for Chart.js
    const res = await apiRequest('/api/statistics?days=7');
    const stats = res.stats;

    // Productivity Category Chart
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    if (AppState.charts.category) AppState.charts.category.destroy();
    AppState.charts.category = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: Object.keys(stats.categoryCounts),
        datasets: [{
          data: Object.values(stats.categoryCounts),
          backgroundColor: ['#6C9CE8', '#A8D5BA', '#B8A5E8', '#FBBF24', '#38BDF8', '#94A3B8']
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
    AppState.charts.mood = new Chart(ctxMood, {
      type: 'pie',
      data: {
        labels: Object.keys(stats.moodCounts),
        datasets: [{
          data: Object.values(stats.moodCounts),
          backgroundColor: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#6B7280']
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
        labels: sleepDates.length > 0 ? sleepDates : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Hours Slept',
          data: sleepHours.length > 0 ? sleepHours : [7.5, 7.0, 6.5, 8.0, 7.0, 6.0, 7.5],
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
        labels: moodDates.length > 0 ? moodDates : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Stress (1-5)',
            data: stressVals.length > 0 ? stressVals : [2, 2, 3, 1, 2, 4, 2],
            borderColor: '#EF4444',
            tension: 0.3
          },
          {
            label: 'Motivation (1-5)',
            data: motVals.length > 0 ? motVals : [4, 5, 3, 5, 4, 2, 4],
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
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Feature #5: Weekly Report Loader
async function loadWeeklyReport() {
  try {
    const res = await apiRequest('/api/reports/weekly');
    const rep = res.report;
    const summaryText = `
      "${rep.message}"<br/><br/>
      • <strong>Tasks Completed:</strong> ${rep.completedTasks} / ${rep.totalTasks} (${rep.completionRate}%)<br/>
      • <strong>Average Sleep:</strong> ${rep.avgSleep} hours/day<br/>
      • <strong>Positive Mood Days:</strong> ${rep.positiveMoodDays} out of 7 days<br/>
      • <strong>Average Stress Level:</strong> ${rep.avgStress} / 5<br/><br/>
      💡 <em>${rep.encouragement}</em>
    `;
    document.getElementById('weeklyReportSummaryText').innerHTML = summaryText;

    document.getElementById('btnRefreshWeeklyReport').onclick = () => {
      loadWeeklyReport();
      showToast('Weekly personal report refreshed.');
    };
  } catch (e) {}
}

// ==========================================
// 8. AI WELLNESS ASSISTANT (Feature #2)
// ==========================================
function bindAiChat() {
  const drawer = document.getElementById('aiChatDrawer');
  const openBtn = document.getElementById('openAiDrawerBtn');
  const closeBtn = document.getElementById('closeAiDrawerBtn');
  const form = document.getElementById('aiChatForm');
  const input = document.getElementById('aiChatInput');
  const msgArea = document.getElementById('aiChatMessages');

  openBtn.addEventListener('click', () => {
    drawer.classList.toggle('active');
  });
  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('active');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;

    // Append user message to chat UI
    appendChatBubble('user', userMsg);
    input.value = '';

    // Assistant loading state
    const loadingBubble = appendChatBubble('assistant', 'LifeCare AI is thinking with mindfulness...');

    try {
      const res = await apiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userMsg })
      });

      loadingBubble.remove();
      appendChatBubble('assistant', res.reply);

      // If suggested tasks are returned, offer to add them
      if (res.suggestedTasks && res.suggestedTasks.length > 0) {
        const suggestionDiv = document.createElement('div');
        suggestionDiv.style.padding = '8px 12px';
        suggestionDiv.style.fontSize = '0.8rem';
        suggestionDiv.style.background = 'var(--primary-light)';
        suggestionDiv.style.borderRadius = 'var(--radius-sm)';
        suggestionDiv.style.marginTop = '6px';
        suggestionDiv.innerHTML = `
          <strong>Suggested Habit Task:</strong> "${res.suggestedTasks[0].title}"
          <br/><button class="btn btn-primary" style="font-size: 0.72rem; padding: 4px 8px; margin-top: 4px;" onclick='addAiSuggestedTask(${JSON.stringify(res.suggestedTasks[0]).replace(/'/g, "&#39;")})'>+ Add to Today's Planner</button>
        `;
        msgArea.appendChild(suggestionDiv);
        msgArea.scrollTop = msgArea.scrollHeight;
      }
    } catch (err) {
      loadingBubble.innerText = 'Sorry, could not reach the wellness engine: ' + err.message;
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
        description: task.description || 'Generated by LifeCare AI Assistant',
        category: task.category || 'Rest',
        priority: task.priority || 'medium',
        date: new Date().toISOString().split('T')[0],
        start_time: '14:30',
        end_time: '14:45'
      })
    });
    showToast('Suggested task added to your planner!');
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
  // Update Profile Form
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
      showToast('Profile updated successfully.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Change Password Form
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
      showToast('Password updated securely.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Reminder Settings Form
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
          notification_frequency
        })
      });

      showToast('Notification & habit preferences saved.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Export Data (JSON)
  document.getElementById('btnExportData').addEventListener('click', () => {
    window.location.href = '/api/user/export';
  });

  // Clear Health & Mood History
  document.getElementById('btnClearHealthHistory').addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all physical check-ins and mood records? This action cannot be undone.')) {
      try {
        await apiRequest('/api/user/clear-health', { method: 'POST' });
        showToast('Health and mood history permanently cleared.');
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  // Delete Account
  document.getElementById('btnDeleteAccount').addEventListener('click', async () => {
    const confirmation = prompt('Type "DELETE" to permanently erase your account and all private records:');
    if (confirmation === 'DELETE') {
      try {
        await apiRequest('/api/user/account', { method: 'DELETE' });
        alert('Your LifeCare account has been completely erased.');
        localStorage.clear();
        location.reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  // Notification bell modal
  const notifModal = document.getElementById('notifModal');
  document.getElementById('notifBellBtn').addEventListener('click', async () => {
    notifModal.classList.add('active');
    try {
      const res = await apiRequest('/api/notifications');
      const container = document.getElementById('notifListContainer');
      const notifs = res.notifications || [];
      if (notifs.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">All caught up! No unread habit alerts.</p>';
        return;
      }
      container.innerHTML = notifs.map(n => `
        <div style="background: var(--bg-main); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-weight: 700; color: var(--text-heading); font-size: 0.88rem;">${escapeHTML(n.title)}</div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">${escapeHTML(n.message)}</div>
          <div style="font-size: 0.72rem; color: var(--primary); margin-top: 4px;">Scheduled: ${n.notification_time}</div>
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

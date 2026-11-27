/**
 * Màn hình "Tạo lịch trình" (PlanMate)
 * - Khung chat lớn toàn màn hình, AI hỏi lần lượt vài câu cố định, có thanh tiến độ và câu trả lời gợi ý.
 * - Giờ ngủ, giờ học/làm... điền bằng phiếu ngay trong khung chat, lưu vào tài khoản (/api/user/intake)
 *   nên lần sau không phải hỏi lại.
 * - AI lập BẢN NHÁP (không lưu). Người dùng xem bên phải, nhắn để sửa, bấm "Áp dụng vào thời gian biểu" mới lưu.
 * - Sau khi áp dụng vẫn chat tiếp được: lúc đó AI sửa thẳng vào lịch đã lưu.
 */
const CreateStudio = (() => {
  const ROLE = {
    student: ['Học sinh', 'School student'],
    university: ['Sinh viên', 'University student'],
    worker: ['Người đi làm', 'Working'],
    other: ['Khác', 'Other']
  };
  const FOCUS = {
    morning: ['Buổi sáng', 'Morning'],
    afternoon: ['Buổi chiều', 'Afternoon'],
    evening: ['Buổi tối', 'Evening'],
    night: ['Đêm khuya', 'Late night']
  };
  // Giờ mặc định của phiếu theo vai trò (người dùng sửa lại được)
  const ROLE_DEFAULTS = {
    student: { wake: '06:00', sleep: '22:30', busy_start: '07:00', busy_end: '11:30', busy_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    university: { wake: '07:00', sleep: '23:30', busy_start: '08:00', busy_end: '11:30', busy_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    worker: { wake: '06:30', sleep: '23:00', busy_start: '08:00', busy_end: '17:00', busy_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    other: { wake: '06:30', sleep: '23:00', busy_start: '', busy_end: '', busy_days: [] }
  };
  const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const lbl = pair => L(pair[0], pair[1]);
  const esc = s => escapeHTML(s == null ? '' : String(s));
  const minutesText = m => (m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m / 60} giờ`) : `${m} phút`);

  // Các câu hỏi cố định. saved = lưu vào tài khoản, lần sau bỏ qua.
  const STEPS = [
    { key: 'goal', label: ['Mục tiêu', 'Goal'], ask: ['Bạn muốn lên lịch cho mục tiêu gì?', 'What do you want to plan for?'] },
    { key: 'deadline', label: ['Thời hạn', 'Deadline'], ask: ['Khi nào bạn muốn đạt được mục tiêu này?', 'When do you want to reach it?'] },
    { key: 'role', label: ['Bạn là', 'You are'], ask: ['Bạn đang là…', 'You are…'], saved: true },
    { key: 'routine', label: ['Giờ giấc hằng ngày', 'Daily hours'], ask: ['Điền giờ ngủ và giờ học/làm của bạn. Mình sẽ không xếp việc vào những giờ này.', 'Fill in your sleep and school/work hours. Nothing will be scheduled there.'], saved: true },
    { key: 'focus', label: ['Giờ tập trung', 'Focus time'], ask: ['Bạn tập trung tốt nhất lúc nào, và mỗi lần được bao lâu?', 'When do you focus best, and for how long?'], saved: true },
    { key: 'daily', label: ['Thời gian mỗi ngày', 'Time per day'], ask: ['Mỗi ngày bạn dành được bao nhiêu thời gian cho mục tiêu này?', 'How much time a day can you give this goal?'], saved: true }
  ];

  const S = {
    open: false,
    stepIdx: 0,
    answers: {},     // goal, deadline, deadlineLabel
    intake: null,    // phiếu đã lưu (hoặc đang điền)
    draft: [],       // bản nháp AI đề xuất
    applied: false,  // đã áp dụng vào thời gian biểu
    busy: false,
    phase: 'ask'     // ask | review | chat
  };
  let root, msgs, input, form, side;

  // ------------------------------------------------------------ dựng khung
  function build() {
    root = document.createElement('div');
    root.className = 'studio';
    root.id = 'createStudio';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'studioTitle');
    root.innerHTML = `
      <header class="studio-top">
        <h2 id="studioTitle">${L('Tạo lịch trình', 'Create a schedule')}</h2>
        <button type="button" class="btn btn-secondary" data-studio="close">${L('Đóng', 'Close')}</button>
      </header>
      <div class="studio-body">
        <section class="studio-chat" aria-label="${L('Trò chuyện với AI', 'Chat with AI')}">
          <div class="studio-msgs" id="studioMsgs" aria-live="polite"></div>
          <form class="studio-input" id="studioForm">
            <input type="text" id="studioInput" class="form-control" autocomplete="off" placeholder="${L('Nhập câu trả lời, hoặc chọn gợi ý ở trên', 'Type an answer, or pick a suggestion above')}" />
            <button type="submit" class="btn btn-primary">${L('Gửi', 'Send')}</button>
          </form>
        </section>
        <aside class="studio-side" id="studioSide"></aside>
      </div>`;
    document.body.appendChild(root);
    msgs = root.querySelector('#studioMsgs');
    input = root.querySelector('#studioInput');
    form = root.querySelector('#studioForm');
    side = root.querySelector('#studioSide');
    root.querySelector('[data-studio="close"]').addEventListener('click', close);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      onText(text);
    });
  }

  async function open() {
    if (!root) build();
    S.open = true;
    S.stepIdx = 0;
    S.answers = {};
    S.draft = [];
    S.applied = false;
    S.phase = 'ask';
    msgs.innerHTML = '';
    root.classList.add('open');
    document.body.classList.add('studio-open');
    try {
      const r = await apiRequest('/api/user/intake');
      S.intake = r.intake || null;
    } catch (e) {
      S.intake = null;
    }
    computeSteps();
    const name = (AppState.user && AppState.user.full_name || '').split(' ').slice(-1)[0];
    bot(L(
      `Chào ${name || 'bạn'}! Mình sẽ hỏi ${stepsToAsk().length} câu ngắn rồi lập lịch cho bạn. Bạn có thể chọn gợi ý thay vì gõ.`,
      `Hi ${name || 'there'}! I'll ask ${stepsToAsk().length} short questions, then build your schedule. Pick a suggestion instead of typing if you like.`
    ));
    if (S.intake) savedIntakeNote();
    renderSide();
    askCurrent();
    setTimeout(() => input.focus(), 50);
  }

  function close() {
    if (!root) return;
    if (S.draft.length && !S.applied && !confirm(L('Bản nháp chưa được áp dụng sẽ mất. Đóng?', 'The draft has not been applied and will be lost. Close?'))) return;
    S.open = false;
    root.classList.remove('open');
    document.body.classList.remove('studio-open');
    document.getElementById('btnCreateSchedule')?.focus();
  }

  // Câu hỏi cần hỏi: bỏ các câu đã có trong phiếu đã lưu. Tính một lần khi mở (hoặc khi bấm "Sửa thông tin"),
  // không tính lại giữa chừng, nếu không trả lời xong một câu sẽ làm lệch thứ tự và bỏ sót câu sau.
  const computeSteps = () => { S.steps = STEPS.filter(s => !(s.saved && S.intake && intakeHas(s.key))); };
  const stepsToAsk = () => S.steps || STEPS;
  function intakeHas(key) {
    const i = S.intake || {};
    if (key === 'role') return !!i.role;
    if (key === 'routine') return !!(i.wake && i.sleep);
    if (key === 'focus') return !!(i.focus_time && i.focus_minutes);
    if (key === 'daily') return !!i.daily_minutes;
    return false;
  }

  // ------------------------------------------------------------ tin nhắn
  function bubble(role, html) {
    const el = document.createElement('div');
    el.className = `studio-msg ${role}`;
    el.innerHTML = html;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }
  const bot = text => bubble('bot', esc(text).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>'));
  const me = text => bubble('me', esc(text));

  function chips(options, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'studio-chips';
    options.forEach(o => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-chip';
      b.textContent = o.label;
      b.addEventListener('click', () => { wrap.remove(); onPick(o); });
      wrap.appendChild(b);
    });
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }
  const clearChips = () => msgs.querySelectorAll('.studio-chips').forEach(c => c.remove());

  function savedIntakeNote() {
    const i = S.intake;
    const parts = [];
    if (i.role) parts.push(lbl(ROLE[i.role]));
    if (i.wake && i.sleep) parts.push(L(`dậy ${i.wake}, ngủ ${i.sleep}`, `up ${i.wake}, bed ${i.sleep}`));
    if (i.busy_start && i.busy_end) parts.push(L(`bận ${i.busy_start}–${i.busy_end} ${daysText(i.busy_days)}`, `busy ${i.busy_start}–${i.busy_end} ${daysText(i.busy_days)}`));
    if (i.focus_time) parts.push(L(`tập trung ${lbl(FOCUS[i.focus_time]).toLowerCase()}, ${i.focus_minutes || 45} phút/lần`, `focus in the ${i.focus_time}, ${i.focus_minutes || 45} min`));
    if (i.daily_minutes) parts.push(L(`${minutesText(i.daily_minutes)} mỗi ngày`, `${i.daily_minutes} min a day`));
    const el = bubble('bot note', `${L('Mình dùng thông tin bạn đã lưu', 'Using your saved info')}: ${esc(parts.join('; '))}. <button type="button" class="link-btn" data-edit-intake>${L('Sửa thông tin', 'Edit info')}</button>`);
    el.querySelector('[data-edit-intake]').addEventListener('click', () => {
      S.intake = null;
      computeSteps();
      clearChips();
      msgs.querySelectorAll('.studio-form').forEach(f => f.remove());
      // hỏi lại các câu đã lưu, giữ các câu trả lời mục tiêu / thời hạn
      if (S.draft.length) bot(L('Sửa xong, bấm "Tạo lịch trình" để lập lại bản nháp.', 'When done, press "Create schedule" to rebuild the draft.'));
      S.stepIdx = Math.min(S.stepIdx, stepsToAsk().findIndex(s => s.saved));
      if (S.phase !== 'ask') S.phase = 'ask';
      renderSide();
      askCurrent();
    });
  }
  function daysText(days) {
    if (!days || !days.length) return '';
    const k = days.join(',');
    if (k === 'mon,tue,wed,thu,fri') return L('T2–T6', 'Mon–Fri');
    if (k === 'mon,tue,wed,thu,fri,sat') return L('T2–T7', 'Mon–Sat');
    if (days.length === 7) return L('cả tuần', 'every day');
    return days.map(d => DAY_SHORT[d]).join(', ');
  }

  // ------------------------------------------------------------ hỏi từng câu
  function askCurrent() {
    const list = stepsToAsk();
    if (S.stepIdx >= list.length) return finishQuestions();
    const step = list[S.stepIdx];
    bot(lbl(step.ask));
    if (step.key === 'goal') {
      chips([
        L('Ôn thi cuối kỳ', 'Study for finals'), L('Luyện IELTS lên 6.5', 'IELTS to 6.5'), L('Tập thể dục đều đặn', 'Exercise regularly'),
        L('Đọc sách mỗi ngày', 'Read every day'), L('Học lập trình cơ bản', 'Learn basic coding')
      ].map(t => ({ label: t, value: t })), o => onText(o.value));
      input.placeholder = L('Ví dụ: ôn thi THPT môn Toán, đạt 8 điểm', 'E.g. pass the maths exam with 8/10');
    } else if (step.key === 'deadline') {
      chips([
        { label: L('1 tuần', '1 week'), days: 7 }, { label: L('2 tuần', '2 weeks'), days: 14 },
        { label: L('1 tháng', '1 month'), days: 30 }, { label: L('3 tháng', '3 months'), days: 90 },
        { label: L('Chưa có hạn', 'No deadline'), days: null }
      ], o => {
        me(o.label);
        S.answers.deadline = o.days ? addDaysStr(todayLocal(), o.days) : '';
        S.answers.deadlineLabel = o.label;
        next();
      });
      input.placeholder = L('Hoặc gõ ngày, ví dụ 30/12', 'Or type a date, e.g. 12/30');
    } else if (step.key === 'role') {
      chips(Object.entries(ROLE).map(([k, v]) => ({ label: lbl(v), value: k })), o => {
        me(o.label);
        S.intake = { ...(S.intake || {}), role: o.value };
        next();
      });
      input.placeholder = L('Chọn một gợi ý ở trên', 'Pick one above');
    } else if (step.key === 'routine') {
      routineForm();
      input.placeholder = L('Điền phiếu ở trên rồi bấm Lưu', 'Fill the form above, then Save');
    } else if (step.key === 'focus') {
      focusForm();
      input.placeholder = L('Chọn ở phiếu trên', 'Choose in the form above');
    } else if (step.key === 'daily') {
      chips([30, 60, 90, 120, 180].map(m => ({ label: minutesText(m), value: m })), o => {
        me(o.label);
        S.intake = { ...(S.intake || {}), daily_minutes: o.value };
        saveIntake();
        next();
      });
      input.placeholder = L('Hoặc gõ số phút, ví dụ 45', 'Or type minutes, e.g. 45');
    }
    renderSide();
  }

  function next() {
    S.stepIdx++;
    renderSide();
    askCurrent();
  }

  // Câu trả lời gõ tay
  function onText(text) {
    if (S.busy) return;
    if (S.phase !== 'ask') return chat(text);
    const step = stepsToAsk()[S.stepIdx];
    if (!step) return chat(text);
    clearChips();
    if (step.key === 'goal') {
      me(text);
      S.answers.goal = text;
      if (S.redoGoal) { // đổi lại mục tiêu sau khi AI báo không thực tế: các câu khác giữ nguyên
        S.redoGoal = false;
        S.stepIdx = stepsToAsk().length;
        return finishQuestions();
      }
      return next();
    }
    if (step.key === 'deadline') {
      me(text);
      const m = text.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
      if (m) {
        const today = todayLocal();
        let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(today.slice(0, 4));
        const iso = d => `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
        if (!m[3] && iso() < today) y += 1;
        S.answers.deadline = iso();
      } else {
        S.answers.deadline = '';
      }
      S.answers.deadlineLabel = text;
      return next();
    }
    if (step.key === 'daily') {
      const n = Number((text.match(/\d+/) || [])[0]);
      const minutes = /giờ|h|tiếng|hour/i.test(text) ? n * 60 : n;
      if (!(minutes >= 10 && minutes <= 720)) {
        bot(L('Bạn nhập giúp mình số phút trong khoảng 10 đến 720 nhé.', 'Please enter 10 to 720 minutes.'));
        return askCurrent();
      }
      me(text);
      S.intake = { ...(S.intake || {}), daily_minutes: minutes };
      saveIntake();
      return next();
    }
    // Câu dùng phiếu / gợi ý: nhắc lại cách trả lời
    me(text);
    bot(L('Bạn chọn ở phiếu hoặc gợi ý ở trên giúp mình nhé.', 'Please use the form or suggestions above.'));
    askCurrent();
  }

  // ------------------------------------------------------------ phiếu điền ngay trong khung chat
  function routineForm() {
    const d = { ...ROLE_DEFAULTS[(S.intake && S.intake.role) || 'student'], ...(S.intake || {}) };
    const box = document.createElement('form');
    box.className = 'studio-form';
    box.innerHTML = `
      <div class="sf-row">
        <label>${L('Thức dậy', 'Wake up')}<input type="time" name="wake" class="form-control" value="${esc(d.wake)}" required /></label>
        <label>${L('Đi ngủ', 'Bedtime')}<input type="time" name="sleep" class="form-control" value="${esc(d.sleep)}" required /></label>
      </div>
      <div class="sf-row">
        <label>${L('Bận học / làm từ', 'Busy from')}<input type="time" name="busy_start" class="form-control" value="${esc(d.busy_start)}" /></label>
        <label>${L('đến', 'to')}<input type="time" name="busy_end" class="form-control" value="${esc(d.busy_end)}" /></label>
      </div>
      <fieldset class="sf-days"><legend>${L('Những ngày bận', 'Busy days')}</legend>
        ${DAY_ORDER.map(k => `<label class="sf-day"><input type="checkbox" name="days" value="${k}" ${(d.busy_days || []).includes(k) ? 'checked' : ''} /><span>${DAY_SHORT[k]}</span></label>`).join('')}
      </fieldset>
      <p class="sf-hint">${L('Để trống giờ bận nếu bạn không đi học hay đi làm cố định.', 'Leave busy hours empty if you have no fixed classes or work.')}</p>
      <button type="submit" class="btn btn-primary">${L('Lưu giờ giấc', 'Save hours')}</button>`;
    box.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(box);
      const busyStart = f.get('busy_start'), busyEnd = f.get('busy_end');
      if (busyStart && busyEnd && busyEnd <= busyStart) {
        bot(L('Giờ kết thúc bận phải sau giờ bắt đầu.', 'Busy end must be after busy start.'));
        return;
      }
      S.intake = {
        ...(S.intake || {}),
        wake: f.get('wake'), sleep: f.get('sleep'),
        busy_start: busyStart || null, busy_end: busyEnd || null,
        busy_days: busyStart && busyEnd ? f.getAll('days') : []
      };
      box.remove();
      me(L(`Dậy ${S.intake.wake}, ngủ ${S.intake.sleep}`, `Up ${S.intake.wake}, bed ${S.intake.sleep}`) +
        (S.intake.busy_start ? L(`; bận ${S.intake.busy_start}–${S.intake.busy_end} ${daysText(S.intake.busy_days)}`, `; busy ${S.intake.busy_start}–${S.intake.busy_end} ${daysText(S.intake.busy_days)}`) : ''));
      saveIntake();
      next();
    });
    msgs.appendChild(box);
    msgs.scrollTop = msgs.scrollHeight;
    box.querySelector('input').focus();
  }

  function focusForm() {
    const cur = S.intake || {};
    const box = document.createElement('form');
    box.className = 'studio-form';
    box.innerHTML = `
      <fieldset class="sf-pills"><legend>${L('Tập trung tốt nhất', 'Best focus')}</legend>
        ${Object.entries(FOCUS).map(([k, v]) => `<label><input type="radio" name="focus_time" value="${k}" ${(cur.focus_time || 'evening') === k ? 'checked' : ''} /><span>${lbl(v)}</span></label>`).join('')}
      </fieldset>
      <fieldset class="sf-pills"><legend>${L('Mỗi lần tập trung được', 'Each focus session')}</legend>
        ${[25, 45, 60, 90].map(m => `<label><input type="radio" name="focus_minutes" value="${m}" ${(cur.focus_minutes || 45) === m ? 'checked' : ''} /><span>${m} ${L('phút', 'min')}</span></label>`).join('')}
      </fieldset>
      <button type="submit" class="btn btn-primary">${L('Lưu', 'Save')}</button>`;
    box.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(box);
      S.intake = { ...(S.intake || {}), focus_time: f.get('focus_time'), focus_minutes: Number(f.get('focus_minutes')) };
      box.remove();
      me(`${lbl(FOCUS[S.intake.focus_time])}, ${S.intake.focus_minutes} ${L('phút mỗi lần', 'min per session')}`);
      saveIntake();
      next();
    });
    msgs.appendChild(box);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function saveIntake() {
    try {
      const r = await apiRequest('/api/user/intake', { method: 'PUT', body: JSON.stringify({ intake: S.intake }) });
      if (r.user && AppState.user) AppState.user.psych_profile = r.user.psych_profile;
    } catch (e) {
      showToast(L('Chưa lưu được thông tin: ', 'Could not save your info: ') + e.message, 'error');
    }
  }

  // ------------------------------------------------------------ tạo bản nháp
  function finishQuestions() {
    S.phase = 'review';
    renderSide();
    const a = S.answers;
    bot(L(
      `Đủ thông tin rồi. Mình sẽ lập lịch cho **${a.goal}**${a.deadline ? `, hạn ${fmtDMY(a.deadline)}` : ''}, mỗi ngày khoảng ${minutesText(S.intake.daily_minutes || 60)}.`,
      `Got it. I'll plan **${a.goal}**${a.deadline ? `, due ${a.deadline}` : ''}, about ${S.intake.daily_minutes || 60} min a day.`
    ));
    const wrap = document.createElement('div');
    wrap.className = 'studio-chips';
    wrap.innerHTML = `<button type="button" class="btn btn-primary">${L('Tạo lịch trình', 'Create schedule')}</button>`;
    wrap.querySelector('button').addEventListener('click', () => { wrap.remove(); generate(); });
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    input.placeholder = L('Hoặc dặn thêm, ví dụ: không học sau 22h', 'Or add a note, e.g. no study after 10pm');
  }

  async function generate(extraNote = '') {
    const a = S.answers;
    const i = S.intake || {};
    const msg = [
      `Mục tiêu: ${a.goal}`,
      `Thời hạn: ${a.deadline || 'chưa có'}${a.deadlineLabel ? ` (${a.deadlineLabel})` : ''}`,
      `Thời gian mỗi ngày cho mục tiêu: ${i.daily_minutes || 60} phút`,
      'Hãy lập bản nháp lịch 7 ngày tới.',
      extraNote ? `Ghi chú thêm: ${extraNote}` : ''
    ].filter(Boolean).join('\n');
    await ask(msg, { silentUser: !extraNote });
  }

  /** Gửi một lượt cho AI. Trước khi áp dụng: chế độ bản nháp. Sau khi áp dụng: sửa thẳng lịch đã lưu. */
  async function ask(message, { silentUser = false } = {}) {
    if (S.busy) return;
    S.busy = true;
    form.querySelector('button').disabled = true;
    const wait = bubble('bot typing', `<span class="typing-dots"><i></i><i></i><i></i></span> ${L('Đang lập lịch…', 'Planning…')}`);
    try {
      const draftMode = !S.applied;
      const res = await apiRequest('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          mode: 'schedule',
          language: AppState.language,
          intent: draftMode ? 'create_schedule' : null,
          draft: draftMode ? S.draft : undefined,
          plan: { goal: S.answers.goal, deadline: S.answers.deadline, daily_minutes: (S.intake || {}).daily_minutes, period_days: 7 }
        })
      });
      wait.remove();
      bot(res.reply || '');
      if (draftMode && Array.isArray(res.draftTasks)) {
        S.draft = res.draftTasks.map(({ id, ...t }) => t);
        if (S.draft.length) S.phase = 'review';
      }
      // Chưa có bản nháp (VD mục tiêu không thực tế): cho đổi mục tiêu bằng một nút
      if (draftMode && !S.draft.length) {
        const wrap = document.createElement('div');
        wrap.className = 'studio-chips';
        wrap.innerHTML = `<button type="button" class="studio-chip">${L('Đổi mục tiêu', 'Change goal')}</button>`;
        wrap.querySelector('button').addEventListener('click', () => {
          wrap.remove();
          S.redoGoal = true;
          S.phase = 'ask';
          S.stepIdx = 0;
          S.answers.goal = '';
          renderSide();
          askCurrent();
        });
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
      }
      if (!draftMode) {
        const c = res.tasksChanged;
        if (c && Object.values(c).some(Boolean)) {
          refreshActiveView();
          if (typeof refreshReminderTasks === 'function') refreshReminderTasks();
          renderAppliedWeek();
        }
      }
      renderSide();
    } catch (e) {
      wait.remove();
      bot(L('Không kết nối được: ', 'Connection error: ') + e.message);
    } finally {
      S.busy = false;
      form.querySelector('button').disabled = false;
      input.focus();
    }
  }

  function chat(text) {
    me(text);
    if (!S.answers.goal) S.answers.goal = text;
    if (!S.draft.length && !S.applied) return generate(text);
    ask(text);
  }

  async function apply() {
    if (!S.draft.length || S.busy) return;
    S.busy = true;
    const btn = side.querySelector('[data-apply]');
    if (btn) { btn.disabled = true; btn.textContent = L('Đang áp dụng…', 'Applying…'); }
    try {
      const r = await apiRequest('/api/plan/apply', { method: 'POST', body: JSON.stringify({ tasks: S.draft }) });
      S.applied = true;
      S.phase = 'chat';
      const skipped = r.skipped || [];
      bot(L(
        `Đã áp dụng ${r.added} việc vào thời gian biểu${r.blocksCreated ? ` và tạo ${r.blocksCreated} khung giờ cố định từ giờ giấc của bạn` : ''}.` +
          (skipped.length ? `\n${skipped.length} việc bị bỏ qua vì trùng giờ: ${skipped.map(s => s.title).join(', ')}.` : '') +
          '\nBạn vẫn có thể nhắn tiếp để đổi giờ, thêm hay bớt việc. Mình sẽ sửa thẳng vào lịch.',
        `Applied ${r.added} tasks${r.blocksCreated ? ` and created ${r.blocksCreated} fixed blocks from your hours` : ''}.` +
          (skipped.length ? `\n${skipped.length} skipped because of overlaps: ${skipped.map(s => s.title).join(', ')}.` : '') +
          '\nKeep chatting to move, add or remove tasks. I will edit the schedule directly.'
      ));
      input.placeholder = L('Ví dụ: dời buổi thứ Ba sang 20:00', 'E.g. move Tuesday’s session to 20:00');
      showToast(L('Đã áp dụng vào thời gian biểu.', 'Applied to your timetable.'), 'success');
      refreshActiveView();
      if (typeof refreshReminderTasks === 'function') refreshReminderTasks();
      renderSide();
      renderAppliedWeek();
    } catch (e) {
      showToast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = L('Áp dụng vào thời gian biểu', 'Apply to timetable'); }
    } finally {
      S.busy = false;
    }
  }

  // ------------------------------------------------------------ cột bên phải: tiến độ câu hỏi / bản nháp
  function renderSide() {
    if (!side) return;
    if (S.phase === 'ask') return renderProgress();
    if (S.applied) return; // renderAppliedWeek vẽ
    if (!S.draft.length) return renderProgress();
    renderDraft();
  }

  function stepValue(key) {
    const i = S.intake || {};
    const a = S.answers;
    if (key === 'goal') return a.goal;
    if (key === 'deadline') return a.deadlineLabel ? `${a.deadlineLabel}${a.deadline ? ` (${fmtDMY(a.deadline)})` : ''}` : '';
    if (key === 'role') return i.role ? lbl(ROLE[i.role]) : '';
    if (key === 'routine') return i.wake && i.sleep ? L(`Dậy ${i.wake}, ngủ ${i.sleep}`, `Up ${i.wake}, bed ${i.sleep}`) + (i.busy_start ? `; ${i.busy_start}–${i.busy_end} ${daysText(i.busy_days)}` : '') : '';
    if (key === 'focus') return i.focus_time ? `${lbl(FOCUS[i.focus_time])}, ${i.focus_minutes} ${L('phút', 'min')}` : '';
    if (key === 'daily') return i.daily_minutes ? minutesText(i.daily_minutes) : '';
    return '';
  }

  function renderProgress() {
    const done = STEPS.filter(s => stepValue(s.key)).length;
    const total = STEPS.length;
    const current = stepsToAsk()[S.stepIdx];
    const r = 26, c = 2 * Math.PI * r;
    side.innerHTML = `
      <div class="sp-head">
        <svg class="sp-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="${r}" class="sp-ring-bg"/>
          <circle cx="32" cy="32" r="${r}" class="sp-ring-fg" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - done / total)}"/>
          <text x="32" y="37" text-anchor="middle">${done}/${total}</text>
        </svg>
        <div>
          <h3>${done === total ? L('Đã đủ thông tin', 'All set') : L('Lịch của bạn đang thành hình', 'Your schedule is taking shape')}</h3>
          <p>${L(`Đã trả lời ${done} trên ${total} câu`, `${done} of ${total} answered`)}</p>
        </div>
      </div>
      <ol class="sp-steps">
        ${STEPS.map(s => {
          const v = stepValue(s.key);
          const isCur = current && current.key === s.key && S.phase === 'ask';
          return `<li class="${v ? 'done' : ''} ${isCur ? 'current' : ''}">
            <span class="sp-dot" aria-hidden="true">${v ? '✓' : ''}</span>
            <div><strong>${lbl(s.label)}</strong><span>${v ? esc(v) : isCur ? L('Đang hỏi', 'Asking now') : L('Sẽ hỏi', 'Coming up')}</span>${s.saved && v ? `<em>${L('Đã lưu cho lần sau', 'Saved for next time')}</em>` : ''}</div>
          </li>`;
        }).join('')}
      </ol>`;
  }

  function groupByDate(list) {
    const by = {};
    list.forEach(t => (by[t.date] = by[t.date] || []).push(t));
    Object.values(by).forEach(arr => arr.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }

  function renderDraft() {
    const total = S.draft.reduce((m, t) => m + (t.duration_minutes || (t.start_time && t.end_time ? hmToMin(t.end_time) - hmToMin(t.start_time) : 0)), 0);
    side.innerHTML = `
      <div class="sd-head">
        <h3>${L('Bản nháp lịch trình', 'Draft schedule')}</h3>
        <p>${L(`${S.draft.length} buổi, tổng ${minutesText(total)}. Chưa lưu.`, `${S.draft.length} sessions, ${total} min in total. Not saved yet.`)}</p>
      </div>
      <div class="sd-days">
        ${groupByDate(S.draft).map(([date, items]) => `
          <section class="sd-day">
            <h4>${DAY_LONG[dayKeyOf(date)]} <span>${fmtDM(date)}</span></h4>
            <ul>${items.map(t => `<li><time>${esc(t.start_time || '')}${t.end_time ? '–' + esc(t.end_time) : ''}</time><span>${esc(t.title)}</span></li>`).join('')}</ul>
          </section>`).join('')}
      </div>
      <div class="sd-apply">
        <p>${L('Xem lại các buổi trên. Muốn đổi gì thì nhắn bên trái, ví dụ "bỏ buổi Chủ nhật". Thấy ổn thì bấm:', 'Check the sessions. To change something, message on the left, e.g. "drop Sunday". When it looks right:')}</p>
        <button type="button" class="btn btn-primary btn-apply" data-apply>${L('Áp dụng vào thời gian biểu', 'Apply to timetable')}</button>
      </div>`;
    side.querySelector('[data-apply]').addEventListener('click', apply);
  }

  /** Sau khi áp dụng: hiện các việc tuần này (đã lưu) để người dùng thấy AI sửa thẳng vào lịch. */
  async function renderAppliedWeek() {
    if (!S.applied || !side) return;
    const start = todayLocal();
    const end = addDaysStr(start, 6);
    let tasks = [];
    try {
      const r = await apiRequest(`/api/schedule?start=${start}&end=${end}`);
      tasks = (r.days || []).flatMap(d => d.tasks.filter(t => t.start_time));
    } catch (e) {}
    side.innerHTML = `
      <div class="sd-head">
        <h3>${L('Đã áp dụng', 'Applied')}</h3>
        <p>${L('Lịch 7 ngày tới, cập nhật mỗi khi bạn nhắn AI sửa.', 'Next 7 days, updated as you ask the AI for changes.')}</p>
      </div>
      <div class="sd-days">
        ${groupByDate(tasks).map(([date, items]) => `
          <section class="sd-day">
            <h4>${DAY_LONG[dayKeyOf(date)]} <span>${fmtDM(date)}</span></h4>
            <ul>${items.map(t => `<li class="${t.status === 'completed' ? 'done' : ''}"><time>${esc(t.start_time)}${t.end_time ? '–' + esc(t.end_time) : ''}</time><span>${esc(t.title)}</span></li>`).join('')}</ul>
          </section>`).join('') || `<p class="muted-text">${L('Chưa có việc nào.', 'No tasks yet.')}</p>`}
      </div>
      <div class="sd-apply">
        <button type="button" class="btn btn-secondary" data-goto-routine>${L('Mở thời gian biểu', 'Open timetable')}</button>
      </div>`;
    side.querySelector('[data-goto-routine]').addEventListener('click', () => {
      S.draft = [];
      close();
      navigateToView('routine');
    });
  }

  return { open, close, isOpen: () => S.open };
})();

// ================================================================ phiếu giờ giấc trong khung chat AI (nút ✨ trên thanh trên cùng)
// Khi người dùng chưa điền giờ ngủ / giờ học, chế độ "Lịch Trình" hiện phiếu ngay trong khung chat,
// để AI khỏi hỏi từng mốc giờ và người dùng khỏi phải gõ.
async function maybeShowDrawerIntakeForm() {
  const area = document.getElementById('aiChatMessages');
  if (!area || area.querySelector('.drawer-intake')) return;
  let intake = null;
  try { intake = (await apiRequest('/api/user/intake')).intake; } catch (e) { return; }
  if (intake && intake.wake && intake.sleep) return;
  const box = document.createElement('form');
  box.className = 'studio-form drawer-intake';
  box.innerHTML = `
    <p class="sf-title">${L('Cho mình biết giờ giấc của bạn để không xếp việc vào giờ ngủ hay giờ học:', 'Tell me your hours so nothing lands on sleep or class time:')}</p>
    <div class="sf-row">
      <label>${L('Thức dậy', 'Wake up')}<input type="time" name="wake" class="form-control" value="06:30" required /></label>
      <label>${L('Đi ngủ', 'Bedtime')}<input type="time" name="sleep" class="form-control" value="23:00" required /></label>
    </div>
    <div class="sf-row">
      <label>${L('Bận từ', 'Busy from')}<input type="time" name="busy_start" class="form-control" value="07:00" /></label>
      <label>${L('đến', 'to')}<input type="time" name="busy_end" class="form-control" value="11:30" /></label>
    </div>
    <fieldset class="sf-days"><legend>${L('Những ngày bận', 'Busy days')}</legend>
      ${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k, i) => `<label class="sf-day"><input type="checkbox" name="days" value="${k}" ${i < 5 ? 'checked' : ''} /><span>${DAY_SHORT[k]}</span></label>`).join('')}
    </fieldset>
    <button type="submit" class="btn btn-primary">${L('Lưu giờ giấc', 'Save hours')}</button>`;
  box.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(box);
    const bs = f.get('busy_start'), be = f.get('busy_end');
    const next = { ...(intake || {}), wake: f.get('wake'), sleep: f.get('sleep'), busy_start: bs || null, busy_end: be || null, busy_days: bs && be ? f.getAll('days') : [] };
    try {
      const r = await apiRequest('/api/user/intake', { method: 'PUT', body: JSON.stringify({ intake: next }) });
      if (r.user && AppState.user) AppState.user.psych_profile = r.user.psych_profile;
      box.remove();
      appendChatBubble('assistant', L('Đã lưu giờ giấc. Giờ bạn cứ nhắn việc cần xếp, mình sẽ tránh các giờ này.', 'Saved. Tell me what to schedule and I will avoid those hours.'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  area.appendChild(box);
  area.scrollTop = area.scrollHeight;
}

function bindCreateStudio() {
  document.querySelectorAll('[data-open-create]').forEach(b => b.addEventListener('click', () => CreateStudio.open()));
  document.getElementById('openAiDrawerBtn')?.addEventListener('click', () => setTimeout(() => {
    if (document.getElementById('aiChatDrawer')?.classList.contains('active') && AppState.aiMode === 'schedule') maybeShowDrawerIntakeForm();
  }, 0));
  document.querySelector('#aiModeTabs [data-ai-mode="schedule"]')?.addEventListener('click', maybeShowDrawerIntakeForm);
}
document.addEventListener('DOMContentLoaded', bindCreateStudio);

// ================================================================ GỢI Ý NÊN LÀM GÌ TRONG MỖI KHUNG GIỜ
// Bấm vào một công việc / khung giờ (ăn trưa, nghỉ, ngủ, tập...) để xem nên làm gì cho đúng và đủ.
const TASK_TIPS = [
  { test: /ăn sáng|breakfast/i, type: 'breakfast', title: ['Bữa sáng nên ăn gì', 'What to eat for breakfast'], vi: [
    'Uống 1 cốc nước ngay khi thức dậy.',
    'Có đạm và tinh bột chậm: bánh mì trứng, phở, xôi ít mỡ, yến mạch với sữa.',
    'Thêm một ít trái cây (chuối, cam) để có vitamin.',
    'Không bỏ bữa sáng, kể cả khi vội: một hộp sữa và bánh mì vẫn hơn là nhịn.'
  ], en: ['Drink a glass of water when you wake up.', 'Have protein and slow carbs: eggs on toast, pho, oats with milk.', 'Add some fruit.', "Don't skip it, even when in a hurry."] },
  { test: /ăn trưa|lunch/i, type: 'lunch', title: ['Bữa trưa nên ăn gì', 'What to eat for lunch'], vi: [
    'Chia đĩa: nửa đĩa rau, một phần tư đạm (cá, thịt nạc, trứng, đậu phụ), một phần tư cơm hoặc tinh bột.',
    'Uống 1 cốc nước, hạn chế nước ngọt và trà sữa.',
    'Ăn chậm trong 15–20 phút, không vừa ăn vừa xem điện thoại.',
    'Nghỉ 10–15 phút sau khi ăn, tránh vận động mạnh ngay.'
  ], en: ['Half the plate vegetables, a quarter protein, a quarter rice or carbs.', 'Drink water, skip sugary drinks.', 'Eat slowly, 15–20 minutes, away from your phone.', 'Rest 10–15 minutes afterwards.'] },
  { test: /ăn tối|dinner/i, type: 'dinner', title: ['Bữa tối nên ăn gì', 'What to eat for dinner'], vi: [
    'Ăn trước giờ ngủ ít nhất 2–3 tiếng.',
    'Nhiều rau, đạm vừa phải, ít dầu mỡ và đồ chiên.',
    'Tránh cà phê, trà đặc và đồ ngọt buổi tối để ngủ ngon hơn.'
  ], en: ['Eat at least 2–3 hours before bed.', 'Plenty of vegetables, moderate protein, little fried food.', 'Avoid coffee, strong tea and sweets in the evening.'] },
  { test: /ngủ|sleep/i, type: 'sleep', title: ['Để ngủ ngon', 'For better sleep'], vi: [
    'Tắt màn hình 30 phút trước khi ngủ, để điện thoại xa giường.',
    'Phòng tối, mát và yên tĩnh.',
    'Ngủ đủ 8–10 tiếng nếu là học sinh, 7–9 tiếng nếu là người lớn.',
    'Đi ngủ và thức dậy cùng giờ mỗi ngày, kể cả cuối tuần.'
  ], en: ['Screens off 30 minutes before bed.', 'Dark, cool, quiet room.', '8–10 hours for teens, 7–9 for adults.', 'Same bedtime and wake time every day.'] },
  { test: /nghỉ|giải lao|break|rest/i, type: 'rest', title: ['Nghỉ thế nào cho đúng', 'How to take a good break'], vi: [
    'Đứng dậy đi lại, vươn vai 2–3 phút.',
    'Nhìn ra xa khoảng 20 giây để mắt được nghỉ.',
    'Uống vài ngụm nước.',
    'Tránh lướt mạng xã hội, vì rất dễ kéo dài quá giờ.'
  ], en: ['Stand up, walk and stretch for 2–3 minutes.', 'Look far away for about 20 seconds.', 'Have some water.', 'Skip social media; it easily runs over.'] },
  { test: /giải trí|leisure|chơi/i, type: 'leisure', title: ['Giải trí thế nào cho hồi sức', 'Leisure that recharges you'], vi: [
    'Nếu đã nhìn màn hình nhiều, chọn việc không màn hình: đọc truyện, nghe nhạc, trò chuyện với gia đình.',
    'Đặt giờ kết thúc trước khi bắt đầu chơi game hay xem phim.',
    'Gần giờ ngủ thì chọn hoạt động nhẹ nhàng.'
  ], en: ['After lots of screen time, pick something screen-free.', 'Set an end time before gaming or watching.', 'Near bedtime, choose something calm.'] },
  { test: /tập|vận động|thể dục|chạy|gym|bơi|exercise|workout|run/i, type: 'exercise', title: ['Buổi tập nên làm gì', 'What to do in this workout'], vi: [
    'Khởi động 5 phút: xoay khớp, chạy nhẹ tại chỗ.',
    '20–30 phút chính: chạy bộ, nhảy dây, đạp xe hoặc bài tập cơ thể (hít đất, squat, plank).',
    'Giãn cơ 5 phút khi kết thúc.',
    'Uống nước trước và sau khi tập; không tập nặng ngay sau bữa ăn.'
  ], en: ['Warm up 5 minutes.', '20–30 minutes: jog, skip rope, cycle or bodyweight moves.', 'Stretch 5 minutes at the end.', 'Drink water before and after; not right after a meal.'] },
  { test: /học|ôn|bài|ielts|toeic|sat|thi|study|homework|revise/i, type: 'study', title: ['Học sao cho hiệu quả', 'How to make this study session count'], vi: [
    'Dọn bàn, để điện thoại ở phòng khác hoặc bật chế độ không làm phiền.',
    'Chia phiên theo sức tập trung của bạn, nghỉ 5 phút giữa các phiên.',
    'Làm phần khó nhất trước khi còn tỉnh táo.',
    'Cuối buổi, tự tóm tắt 3 ý chính hoặc làm vài câu kiểm tra nhanh.'
  ], en: ['Clear the desk, phone away or on Do Not Disturb.', 'Work in focus-sized sessions with 5-minute breaks.', 'Do the hardest part first.', 'End by summarising 3 key points or a quick self-test.'] }
];
const TIP_BY_BLOCK = { sleep: 'sleep', leisure: 'leisure', exercise: 'exercise', study: 'study', extra_class: 'study', school: 'study' };
const TIP_BY_CATEGORY = { Study: 'study', Exercise: 'exercise', Rest: 'rest' };

function findTip({ title = '', block_type = null, category = null }) {
  const byText = TASK_TIPS.find(t => t.test.test(title));
  if (byText) return byText;
  if (block_type === 'meal') return TASK_TIPS.find(t => t.type === 'lunch');
  const type = TIP_BY_BLOCK[block_type] || TIP_BY_CATEGORY[category];
  return type ? TASK_TIPS.find(t => t.type === type) : null;
}

function renderTipBox(formId, info, timeText) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelector('.tip-box')?.remove();
  const tip = findTip(info);
  if (!tip) return;
  const box = document.createElement('div');
  box.className = 'tip-box';
  const items = AppState.language === 'en' ? tip.en : tip.vi;
  box.innerHTML = `
    <h4>💡 ${escapeHTML(L(tip.title[0], tip.title[1]))}</h4>
    <ul>${items.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>
    <button type="button" class="link-btn">${L('Hỏi AI gợi ý riêng cho mình', 'Ask the AI for personal tips')}</button>`;
  box.querySelector('button').addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    const name = info.title || L(tip.title[0], tip.title[1]);
    sendAiMessage(L(
      `Gợi ý cụ thể cho mình nên làm gì trong "${name}"${timeText ? ` (${timeText})` : ''}, dựa trên sức khoẻ và lịch hôm nay của mình. Trả lời ngắn gọn.`,
      `Give me specific tips for "${name}"${timeText ? ` (${timeText})` : ''} based on my health and today's schedule. Keep it short.`
    ));
  });
  form.prepend(box);
}

// Gắn vào form sửa công việc / khung giờ có sẵn (hàm gốc ở app.js và planning-ui.js)
(function wrapModalsWithTips() {
  if (typeof openTaskModal === 'function') {
    const orig = openTaskModal;
    openTaskModal = function (task = null, ...rest) {
      orig(task, ...rest);
      document.getElementById('taskForm')?.querySelector('.tip-box')?.remove();
      if (task) renderTipBox('taskForm', { title: task.title, category: task.category }, task.start_time ? `${task.start_time}${task.end_time ? '–' + task.end_time : ''}` : '');
    };
    window.openTaskModal = openTaskModal;
  }
  if (typeof openBlockModal === 'function') {
    const orig = openBlockModal;
    openBlockModal = function (block = null) {
      orig(block);
      document.getElementById('blockForm')?.querySelector('.tip-box')?.remove();
      if (block) renderTipBox('blockForm', { title: block.label || '', block_type: block.block_type }, `${block.start_time}–${block.end_time}`);
    };
    window.openBlockModal = openBlockModal;
  }
})();

// ================================================================ NHẮC UỐNG NƯỚC
// Bật/tắt ở Cài đặt ("Nhắc uống nước"). Trong giờ thức (theo giờ dậy/ngủ đã lưu, mặc định 7:00–22:00),
// khoảng mỗi 90 phút nhắc một cốc 250 ml, mục tiêu 2.000 ml mỗi ngày. Bấm "Đã uống" để cộng vào
// lượng nước hôm nay ở mục Sức khoẻ thể chất. Không nhắc trong giờ yên tĩnh.
const Water = {
  GLASS_ML: 250,
  GOAL_ML: 2000,
  EVERY_MIN: 90,
  timer: null,
  state() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem('lifecare_water') || 'null'); } catch (e) {}
    if (!st || st.date !== todayLocal()) st = { date: todayLocal(), ml: 0, last: 0, snoozeUntil: 0 };
    return st;
  },
  save(st) { try { localStorage.setItem('lifecare_water', JSON.stringify(st)); } catch (e) {} },
  wakeWindow() {
    let i = null;
    try { i = (JSON.parse((AppState.user && AppState.user.psych_profile) || '{}') || {}).intake; } catch (e) {}
    const wake = hmToMin((i && i.wake) || '07:00');
    const sleep = hmToMin((i && i.sleep) || '22:00');
    return { start: wake + 30, end: (sleep > wake ? sleep : 1440) - 60 }; // không nhắc ngay khi vừa dậy hay sắp ngủ
  },
  /** Lấy lượng nước đã ghi hôm nay (người dùng có thể đã nhập ở mục Sức khoẻ thể chất). */
  async syncFromServer(st) {
    try {
      const r = await apiRequest('/api/health?limit=3');
      const today = (r.records || []).find(h => h.checkin_date === todayLocal());
      if (today && Number(today.water_ml) > st.ml) st.ml = Number(today.water_ml);
    } catch (e) {}
    return st;
  },
  async check() {
    const s = AppState.settings || {};
    if (!AppState.token || s.remind_water === 0 || (typeof inQuietHours === 'function' && inQuietHours(s))) return;
    const st = Water.state();
    if (st.ml >= Water.GOAL_ML) return;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const w = Water.wakeWindow();
    if (nowMin < w.start || nowMin > w.end) return;
    if (Date.now() < st.snoozeUntil) return;
    if (st.last && Date.now() - st.last < Water.EVERY_MIN * 60000) return;
    // Đúng giờ: tới lúc này trong ngày lẽ ra đã uống bao nhiêu
    const expected = Math.min(Water.GOAL_ML, Math.round(((nowMin - w.start) / Math.max(60, w.end - w.start)) * Water.GOAL_ML));
    st.last = Date.now(); // đặt trước để lần kiểm tra sau (1 phút) không gọi máy chủ lặp lại
    Water.save(st);
    await Water.syncFromServer(st);
    Water.save(st);
    if (st.ml >= Water.GOAL_ML || st.ml >= expected + Water.GLASS_ML) return; // đã uống đủ / đi trước tiến độ
    Water.show(st);
  },
  show(st) {
    const stack = document.getElementById('reminderStack');
    if (!stack) return;
    stack.querySelector('[data-reminder="water"]')?.remove();
    const card = document.createElement('div');
    card.className = 'reminder-card water';
    card.dataset.reminder = 'water';
    card.innerHTML = `
      <div class="reminder-title">💧 ${L('Đến giờ uống nước', 'Time for water')}</div>
      <div class="reminder-task">${L(`Uống một cốc ${Water.GLASS_ML} ml. Hôm nay: ${st.ml}/${Water.GOAL_ML} ml.`, `Have a ${Water.GLASS_ML} ml glass. Today: ${st.ml}/${Water.GOAL_ML} ml.`)}</div>
      <div class="btn-row">
        <button type="button" class="btn btn-primary small" data-w="drank">${L('Đã uống', 'Done')}</button>
        <button type="button" class="btn btn-secondary small" data-w="snooze">${L('Nhắc lại sau 20′', 'Remind in 20′')}</button>
        <button type="button" class="btn-icon small" data-w="close" title="${L('Đóng', 'Close')}">✕</button>
      </div>`;
    card.querySelector('[data-w="drank"]').addEventListener('click', () => { card.remove(); Water.drank(); });
    card.querySelector('[data-w="snooze"]').addEventListener('click', () => {
      const s2 = Water.state();
      s2.snoozeUntil = Date.now() + 20 * 60000;
      s2.last = 0;
      Water.save(s2);
      card.remove();
    });
    card.querySelector('[data-w="close"]').addEventListener('click', () => card.remove());
    stack.prepend(card);
    while (stack.children.length > 3) stack.lastChild.remove();
    if (typeof alertReminder === 'function') alertReminder(`💧 ${L('Đến giờ uống nước', 'Time for water')}`, L(`Uống một cốc ${Water.GLASS_ML} ml (${st.ml}/${Water.GOAL_ML} ml hôm nay).`, `Have ${Water.GLASS_ML} ml (${st.ml}/${Water.GOAL_ML} ml today).`), 'water');
  },
  async drank() {
    const st = Water.state();
    st.ml += Water.GLASS_ML;
    st.last = Date.now();
    Water.save(st);
    // Cộng vào lượng nước của check-in sức khoẻ hôm nay (giữ nguyên các mục khác)
    try {
      const r = await apiRequest('/api/health?limit=3');
      const today = (r.records || []).find(h => h.checkin_date === todayLocal());
      const saved = today && Number(today.water_ml) ? Number(today.water_ml) : 0;
      st.ml = Math.max(st.ml, saved + Water.GLASS_ML);
      Water.save(st);
      await apiRequest('/api/health', { method: 'POST', body: JSON.stringify({ ...(today || {}), checkin_date: todayLocal(), water_ml: st.ml }) });
      if (AppState.activeView === 'physical' && typeof loadPhysicalHealth === 'function') loadPhysicalHealth();
    } catch (e) {}
    showToast(st.ml >= Water.GOAL_ML
      ? L(`Tuyệt! Bạn đã uống đủ ${st.ml} ml hôm nay.`, `Great, ${st.ml} ml today. Goal reached.`)
      : L(`Đã ghi ${st.ml}/${Water.GOAL_ML} ml hôm nay.`, `Logged ${st.ml}/${Water.GOAL_ML} ml today.`), 'success');
  },
  start() {
    if (Water.timer) return;
    Water.timer = setInterval(Water.check, 60000);
    setTimeout(Water.check, 5000);
  }
};
document.addEventListener('DOMContentLoaded', () => Water.start());

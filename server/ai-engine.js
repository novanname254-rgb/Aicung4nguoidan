/**
 * LifeCare Multi-Mode AI Wellness Assistant Engine
 * 
 * Supports:
 * 1. Schedule Assistant: detects heavy blocks, overlaps, suggests break buffers
 * 2. Wellness Assistant: relaxation techniques, hydration & mindful recovery
 * 3. Personal Insight: data-driven reflections on sleep, mood patterns & task completion
 * 4. General Mindful Conversation
 * 
 * Strict Guidelines:
 * - Uses ONLY authorized user context (tasks, health, mood history)
 * - NEVER provides clinical diagnoses or prescribes medical treatments
 * - Immediate crisis intervention resources for signs of self-harm
 * - Compatible with optional Gemini API (process.env.GEMINI_API_KEY) while keeping server-side security (keys never exposed to frontend)
 */

const https = require('node:https');

// Helper to check crisis/emergency keywords
function checkCrisisOrEmergency(lower) {
  const crisisKeywords = [
    'suicide', 'kill myself', 'end my life', 'harm myself', 'want to die', 
    'tự tử', 'muốn chết', 'tự hại', 'kết thúc cuộc đời', 'không muốn sống'
  ];
  for (const kw of crisisKeywords) {
    if (lower.includes(kw)) {
      return {
        isCrisis: true,
        reply: `💙 **Chúng tôi luôn bên bạn và bạn không hề đơn độc trong lúc này.** / **We care about you, and you do not have to go through this alone.**\n\nNếu bạn đang cảm thấy quá tải, suy sụp hoặc có suy nghĩ tự làm tổn thương bản thân, xin hãy liên hệ ngay với người thân hoặc các tổ chức hỗ trợ khẩn cấp 24/7:\n\n- **Việt Nam:** Đường dây nóng Sức khỏe Tinh thần: **1900 9095** hoặc Cấp cứu Y tế: **115**.\n- **Hoa Kỳ & Quốc tế:** Gọi hoặc nhắn tin **988** (Suicide & Crisis Lifeline - hoàn toàn miễn phí & bảo mật) hoặc nhắn HOME tới 741741.\n- **Tìm kiếm hỗ trợ toàn cầu:** Truy cập [findahelpline.com](https://findahelpline.com/) hoặc [Befrienders Worldwide](https://www.befrienders.org/).\n\n*Hãy trò chuyện với ai đó ngay hôm nay. LifeCare là công cụ hỗ trợ thói quen và không thể thay thế can thiệp y tế khẩn cấp.*`,
        type: 'crisis_alert'
      };
    }
  }

  const medicalKeywords = [
    'chest pain', 'heart attack', 'diagnose', 'disease', 'cancer',
    'đau ngực', 'khó thở dữ dội', 'chẩn đoán bệnh', 'ung thư', 'bệnh viện cấp cứu'
  ];
  if (medicalKeywords.some(kw => lower.includes(kw))) {
    return {
      isMedical: true,
      reply: `🩺 **Lưu ý Sức Khỏe & Y Tế / Health & Medical Notice**\n\nLifeCare là ứng dụng tự quản lý lối sống, thói quen và ghi nhận cảm xúc bản thân. **Hệ thống tuyệt đối không đưa ra chẩn đoán bệnh tật, không diễn giải triệu chứng lâm sàng và không kê đơn thuốc.**\n\nNếu bạn đang gặp các cơn đau cấp tính dữ dội, khó thở, tức ngực hoặc triệu chứng kéo dài, xin hãy tham khảo ý kiến bác sĩ chuyên khoa hoặc đến cơ sở y tế gần nhất kịp thời. Sức khỏe của bạn là ưu tiên hàng đầu!`,
      type: 'medical_disclaimer'
    };
  }

  return null;
}

/**
 * Generate AI Wellness Response
 * @param {string} userMessage - Prompt from user
 * @param {object} context - User context { user, recentHealth, recentMood, tasks, mode, language }
 */
async function generateAIWellnessReply(userMessage, context = {}) {
  const msg = (userMessage || '').trim();
  const lower = msg.toLowerCase();
  const { user, recentHealth, recentMood, tasks, mode = 'general', language = 'vi' } = context;

  // 1. Safety check
  const safetyCheck = checkCrisisOrEmergency(lower);
  if (safetyCheck) return safetyCheck;

  // 2. Schedule Assistant Mode
  if (mode === 'schedule' || lower.includes('schedule') || lower.includes('lịch') || lower.includes('thời gian biểu') || lower.includes('bận')) {
    const analysis = analyzeScheduleBalance(tasks || [], language);
    return {
      reply: language === 'vi' 
        ? `🗓️ **Trợ Lý Lịch Trình Thông Minh (Schedule Assistant):**\n\n${analysis.summary}\n\n**Gợi ý cân bằng công việc & nghỉ ngơi:**\n${analysis.recommendations.map(r => `• ${r}`).join('\n')}`
        : `🗓️ **Schedule Assistant Recommendation:**\n\n${analysis.summary}\n\n**Actionable Advice for your Day:**\n${analysis.recommendations.map(r => `• ${r}`).join('\n')}`,
      type: 'schedule_recommendation',
      suggestedTasks: analysis.suggestedTasks
    };
  }

  // 3. Personal Insight Mode
  if (mode === 'insight' || lower.includes('insight') || lower.includes('phân tích') || lower.includes('xu hướng') || lower.includes('trend') || lower.includes('pattern')) {
    const insight = buildPersonalInsight(tasks || [], recentHealth || [], recentMood || [], language);
    return {
      reply: insight.text,
      type: 'personal_insight'
    };
  }

  // 4. Wellness Assistant Mode / Stress / Sleep
  if (mode === 'wellness' || lower.includes('stress') || lower.includes('mệt') || lower.includes('tired') || lower.includes('áp lực') || lower.includes('ngủ') || lower.includes('sleep')) {
    if (language === 'vi') {
      return {
        reply: `🌿 **Trợ Lý Sức Khỏe & Thư Giãn (Wellness Assistant):**\n\nHãy hít một hơi thật sâu. Bạn không cần phải giải quyết mọi việc cùng một lúc!\n\n1. **Kỹ thuật thở 4-7-8:** Hít vào bằng mũi 4 giây, giữ nhẹ 7 giây, thở ra từ từ bằng miệng 8 giây. Thực hiện 3 lần để kích hoạt hệ thần kinh phó giao cảm giúp nhịp tim dịu lại.\n2. **Tối ưu năng lượng:** Xem lại các đầu việc hôm nay. Công việc nào có thể lùi sang ngày mai? Hãy cho phép bản thân nghỉ ngơi.\n3. **Giãn cách màn hình:** Rời xa màn hình điện thoại hoặc máy tính trong 10 phút, uống một ly nước ấm và nhìn ra xa.\n\n*Bạn có muốn tôi thêm một khoảng nghỉ phục hồi 15 phút vào lịch hôm nay không?*`,
        type: 'stress_relief',
        suggestedTasks: [
          {
            title: 'Nghỉ ngơi chủ động & Thở 4-7-8',
            description: '10 phút thư giãn không dùng màn hình để giảm tải thần kinh',
            category: 'Rest',
            priority: 'high',
            durationMinutes: 15
          }
        ]
      };
    } else {
      return {
        reply: `🌿 **Wellness Assistant:**\n\nTake a gentle, deep breath. You do not have to solve everything at once!\n\n1. **4-7-8 Breathing Technique:** Inhale through your nose for 4s, hold gently for 7s, exhale completely through your mouth for 8s. Repeat 3 times to calm your nervous system.\n2. **Energy Audit:** Check today's tasks. Which one can be safely postponed to tomorrow? Give yourself permission to prioritize rest.\n3. **Screen Detox:** Step away from all screens for 10 minutes, sip a glass of water, and look outside.\n\n*Would you like me to add a quick 15-minute relaxation break into your planner today?*`,
        type: 'stress_relief',
        suggestedTasks: [
          {
            title: 'Mindful 4-7-8 Breath & Rest',
            description: '10 minutes of screen-free breathwork to calm autonomic nervous system',
            category: 'Rest',
            priority: 'high',
            durationMinutes: 15
          }
        ]
      };
    }
  }

  // 5. Try Gemini API if server key is configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiReply = await queryGeminiAPI(msg, context);
      if (geminiReply) {
        return {
          reply: geminiReply,
          type: 'gemini_response'
        };
      }
    } catch (e) {
      console.warn('Gemini API call failed, falling back to local wellness heuristics:', e.message);
    }
  }

  // 6. Default Mindful Response
  const firstName = (user && user.full_name) ? user.full_name.split(' ')[0] : (language === 'vi' ? 'bạn' : 'friend');
  if (language === 'vi') {
    return {
      reply: `Xin chào ${firstName}! 👋 Tôi là Trợ Lý AI Đồng Hành Sức Khỏe LifeCare.\n\nTôi có thể hỗ trợ bạn theo 3 chế độ:\n1. 🗓️ **Trợ lý Lịch trình (Schedule Assistant):** Phân tích sự cân bằng công việc - học tập và đề xuất giờ nghỉ.\n2. 🌿 **Trợ lý Thư giãn (Wellness Assistant):** Hướng dẫn bài tập thở, mẹo ngủ ngon và giải tỏa áp lực.\n3. 📊 **Góc nhìn Cá nhân (Personal Insight):** Tổng hợp xu hướng cảm xúc, giấc ngủ và tỷ lệ hoàn thành mục tiêu dựa trên dữ liệu bạn ghi nhận.\n\nHôm nay bạn cảm thấy thế nào? Hãy chia sẻ hoặc chọn một chế độ để bắt đầu nhé!`,
      type: 'general_guidance'
    };
  }

  return {
    reply: `Hello ${firstName}! 👋 I am your LifeCare AI Wellness Assistant.\n\nI can assist you across 3 specialized capabilities:\n1. 🗓️ **Schedule Assistant:** Balancing intense study/work sessions with restorative buffers.\n2. 🌿 **Wellness Assistant:** Breathing exercises, sleep hygiene, and stress mitigation tips.\n3. 📊 **Personal Insight:** Reflecting on your sleep, mood patterns, and task velocity based only on your authorized logs.\n\nHow are you feeling today? Feel free to ask or choose a mode above!`,
    type: 'general_guidance'
  };
}

/**
 * Schedule Assistant Engine
 * Detects overlapping tasks and long work stretches
 */
function analyzeScheduleBalance(tasks = [], lang = 'vi') {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.date === todayStr);

  const workAndStudy = todayTasks.filter(t => t.category === 'Work' || t.category === 'Study');
  const restAndExercise = todayTasks.filter(t => t.category === 'Rest' || t.category === 'Exercise');

  const recommendations = [];
  const suggestedTasks = [];

  // Overlap detection
  const overlaps = detectScheduleOverlaps(todayTasks);
  if (overlaps.length > 0) {
    if (lang === 'vi') {
      recommendations.push(`⚠️ **Phát hiện trùng lịch:** "${overlaps[0].task1.title}" và "${overlaps[0].task2.title}" cùng diễn ra vào khoảng ${overlaps[0].task1.start_time || ''}. Bạn nên điều chỉnh thời gian.`);
    } else {
      recommendations.push(`⚠️ **Schedule Overlap:** "${overlaps[0].task1.title}" and "${overlaps[0].task2.title}" conflict around ${overlaps[0].task1.start_time || ''}. Consider re-timing.`);
    }
  }

  if (todayTasks.length === 0) {
    return {
      summary: lang === 'vi' 
        ? 'Bạn chưa có nhiệm vụ nào cho ngày hôm nay. Đây là khoảng thời gian tuyệt vời để lập kế hoạch thảnh thơi và cân bằng!'
        : 'You have no scheduled tasks for today. It is a great canvas to intentionally plan a balanced blend of focus and self-care!',
      recommendations: lang === 'vi'
        ? [
            'Thêm 1-2 nhiệm vụ quan trọng nhất để duy trì tiến độ.',
            'Lên lịch 20 phút đi bộ hoặc vận động nhẹ nhàng.',
            'Dành buổi tối cho các hoạt động thư giãn.'
          ]
        : [
            'Add 1-2 primary priority tasks for meaningful progress.',
            'Schedule a 20-minute physical walk or movement break.',
            'Block out designated unwind time this evening.'
          ],
      suggestedTasks: [
        { title: lang === 'vi' ? 'Phiên tập trung buổi sáng' : 'Morning Focus Session', category: 'Study', priority: 'medium', start_time: '09:00', end_time: '11:00' },
        { title: lang === 'vi' ? 'Uống nước & Đi dạo nhẹ' : 'Hydration & Light Walk', category: 'Rest', priority: 'low', start_time: '11:15', end_time: '11:35' }
      ]
    };
  }

  // Workload check
  if (workAndStudy.length >= 4 && restAndExercise.length === 0) {
    if (lang === 'vi') {
      recommendations.push('⚠️ Bạn có nhiều khối công việc/học tập liên tục mà chưa có khoảng nghỉ hay vận động.');
      recommendations.push('💧 Đề xuất: Thêm 15 phút uống nước và duỗi cơ sau mỗi 90 phút tập trung.');
      recommendations.push('🚶 Đề xuất: Đi dạo 20 phút ngoài trời để giảm hormone căng thẳng Cortisol.');
    } else {
      recommendations.push('⚠️ You have multiple intensive work/study blocks without scheduled physical recovery.');
      recommendations.push('💧 Recommendation: Insert a 15-minute hydration and posture-stretch break.');
      recommendations.push('🚶 Recommendation: Take a 20-minute brisk walk outdoors to reset cortisol levels.');
    }
    suggestedTasks.push({
      title: lang === 'vi' ? 'Nghỉ giải lao 15p & Uống nước' : 'Mindful 15-min Break & Hydration',
      description: lang === 'vi' ? 'Rời màn hình, uống nước và duỗi cơ cổ vai gáy' : 'Step away from screen, drink water and stretch arms/neck',
      category: 'Rest',
      priority: 'high',
      start_time: '14:30',
      end_time: '14:45'
    });
  } else {
    if (lang === 'vi') {
      recommendations.push('✅ Lịch trình hôm nay phân bổ khá hợp lý.');
      recommendations.push('💧 Đừng quên uống đủ 2000 - 2500 ml nước trong ngày.');
    } else {
      recommendations.push('✅ Today\'s schedule appears balanced.');
      recommendations.push('💧 Remember to drink at least 2000 - 2500 ml of fresh water today.');
    }
  }

  return {
    summary: lang === 'vi'
      ? `Đã phân tích ${todayTasks.length} nhiệm vụ hôm nay (${workAndStudy.length} việc tập trung, ${restAndExercise.length} việc chăm sóc sức khỏe).`
      : `Analyzed ${todayTasks.length} tasks today (${workAndStudy.length} focus tasks, ${restAndExercise.length} wellness/rest tasks).`,
    recommendations,
    suggestedTasks
  };
}

/**
 * Overlap Detection Helper
 */
function detectScheduleOverlaps(tasks = []) {
  const timedTasks = tasks.filter(t => t.start_time && t.end_time);
  const overlaps = [];

  for (let i = 0; i < timedTasks.length; i++) {
    for (let j = i + 1; j < timedTasks.length; j++) {
      const a = timedTasks[i];
      const b = timedTasks[j];
      if (a.date === b.date) {
        if ((a.start_time < b.end_time) && (a.end_time > b.start_time)) {
          overlaps.push({ task1: a, task2: b });
        }
      }
    }
  }
  return overlaps;
}

/**
 * Personal Insight Builder
 */
function buildPersonalInsight(tasks = [], healthRecords = [], moodRecords = [], lang = 'vi') {
  const totalTasks = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const compRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  let avgSleep = 0;
  if (healthRecords.length > 0) {
    const totalSleep = healthRecords.reduce((acc, h) => acc + (parseFloat(h.sleep_duration) || 0), 0);
    avgSleep = Math.round((totalSleep / healthRecords.length) * 10) / 10;
  }

  let avgStress = 0;
  if (moodRecords.length > 0) {
    const totalStress = moodRecords.reduce((acc, m) => acc + (parseInt(m.stress_level) || 0), 0);
    avgStress = Math.round((totalStress / moodRecords.length) * 10) / 10;
  }

  if (lang === 'vi') {
    return {
      text: `📊 **Góc Nhìn Cá Nhân Dựa Trên Dữ Liệu Của Bạn (Personal Insight):**\n\n• **Hiệu suất công việc:** Bạn đã hoàn thành **${completed}/${totalTasks}** nhiệm vụ (${compRate}%).\n• **Thời lượng ngủ trung bình:** **${avgSleep || 7} giờ/ngày**. ${avgSleep < 7 ? 'Giấc ngủ của bạn hơi ít hơn mức khuyến nghị 7-8h.' : 'Bạn đang duy trì giấc ngủ rất tích cực!'}\n• **Mức độ căng thẳng trung bình:** **${avgStress || 2}/5**. ${avgStress >= 3.5 ? 'Gần đây mức căng thẳng có dấu hiệu tăng, hãy ưu tiên các quãng nghỉ ngơi chủ động.' : 'Chỉ số tâm lý đang ở trạng thái khá ổn định và tích cực.'}\n\n💡 *Lời khuyên:* Sự nhất quán nhỏ mỗi ngày mang lại kết quả lâu bền hơn là những đợt gắng sức quá mức.`
    };
  }

  return {
    text: `📊 **Personal Insights Based on Your Authorized Logs:**\n\n• **Task Velocity:** Completed **${completed}/${totalTasks}** tasks (${compRate}% completion).\n• **Average Sleep:** **${avgSleep || 7} hrs/night**. ${avgSleep < 7 ? 'Your sleep duration is slightly below the 7-8h recommended baseline.' : 'Great job maintaining restorative sleep!'}\n• **Average Stress:** **${avgStress || 2}/5**. ${avgStress >= 3.5 ? 'Elevated stress observed; consider scheduling micro-breaks.' : 'Emotional balance is steady and resilient.'}\n\n💡 *Insight:* Sustainable consistency beats bursts of overexertion every time.`
  };
}

/**
 * Feature #5: Weekly Personal Report Generator
 */
function buildWeeklyReportData(tasks = [], healthRecords = [], moodRecords = [], lang = 'vi') {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Sleep stats
  let avgSleep = 7.2;
  if (healthRecords.length > 0) {
    const totalSleep = healthRecords.reduce((acc, h) => acc + (parseFloat(h.sleep_duration) || 0), 0);
    avgSleep = Math.round((totalSleep / healthRecords.length) * 10) / 10;
  }

  // Mood stats
  const positiveMoods = ['Happy', 'Excited', 'Relaxed'];
  let positiveMoodDays = 0;
  let totalStress = 0;
  moodRecords.forEach(m => {
    if (positiveMoods.includes(m.mood)) positiveMoodDays++;
    totalStress += (parseInt(m.stress_level) || 3);
  });
  const avgStress = moodRecords.length > 0 ? Math.round((totalStress / moodRecords.length) * 10) / 10 : 2.5;

  let message = lang === 'vi'
    ? `Bạn đã có một tuần nỗ lực không ngừng! Cân bằng giữa học tập, công việc và sức khỏe là một hành trình dài hạn.`
    : `You made steady progress this week! Balancing personal goals with mental and physical recovery is a marathon, not a sprint.`;
    
  let encouragement = lang === 'vi'
    ? `Tuần tới, hãy thử lên lịch các khoảng nghỉ ngắn cùng lúc với việc lên lịch họp hay học tập nhé!`
    : `Next week, consider scheduling your wellness breaks right alongside your work meetings!`;

  if (completionRate >= 80) {
    message = lang === 'vi'
      ? `Năng suất ấn tượng trong tuần qua với ${completionRate}% nhiệm vụ được hoàn thành xuất sắc!`
      : `Outstanding productivity this week with an impressive ${completionRate}% task completion!`;
    encouragement = lang === 'vi'
      ? `Bạn đã tập trung rất tốt. Hãy nhớ tự thưởng cho mình khoảng thời gian thư giãn trọn vẹn!`
      : `You maintained strong focus. Make sure you celebrate your victories and allow your mind to fully recharge!`;
  } else if (avgStress >= 3.5) {
    message = lang === 'vi'
      ? `Hệ thống nhận thấy mức độ căng thẳng tuần này cao hơn thông thường. Đó là điều hoàn toàn tự nhiên khi đối mặt với nhiều áp lực.`
      : `We noticed higher stress levels recorded this week. It is completely natural to experience challenging weeks.`;
    encouragement = lang === 'vi'
      ? `Trong tuần tới, hãy thử giảm bớt 20% các việc không cấp bách để tạo khoảng thở cho bản thân.`
      : `For next week, try trimming 20% of non-essential tasks to create breathing space for yourself.`;
  }

  return {
    totalTasks,
    completedTasks,
    completionRate,
    avgSleep,
    positiveMoodDays: Math.min(positiveMoodDays, 7),
    avgStress,
    message,
    encouragement
  };
}

/**
 * Optional Gemini API Server-Side Call
 */
function queryGeminiAPI(userPrompt, context) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return resolve(null);

    const systemInstruction = `You are LifeCare AI Wellness Assistant. You provide compassionate, practical advice on time management, productivity balance, restorative sleep, hydration, and mindful relaxation. NEVER diagnose diseases or mental disorders. If user indicates danger or self-harm, advise contacting emergency services immediately. Respond in ${context.language === 'vi' ? 'Vietnamese' : 'English'}. Keep responses friendly, concise, and structured with bullet points.`;

    const postData = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemInstruction}\n\nUser Message: ${userPrompt}` }
          ]
        }
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.candidates && json.candidates[0] && json.candidates[0].content) {
            resolve(json.candidates[0].content.parts[0].text);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', (e) => resolve(null));
    req.write(postData);
    req.end();
  });
}

module.exports = {
  checkCrisisOrEmergency,
  generateAIWellnessReply,
  analyzeScheduleBalance,
  detectScheduleOverlaps,
  buildPersonalInsight,
  buildWeeklyReportData
};

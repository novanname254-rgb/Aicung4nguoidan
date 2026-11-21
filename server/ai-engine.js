/**
 * LifeCare Intelligent Rules & Heuristics Engine
 * Provides:
 * 1. AI Wellness Assistant conversational responses & schedule recommendations
 * 2. Schedule analysis: consecutive work hours, hydration breaks, walk suggestions
 * 3. Weekly automated personal report generation with encouraging summary
 * 4. Safety triage & compassionate boundary checks (No medical diagnosis)
 */

function generateAIWellnessReply(userMessage, context = {}) {
  const msg = (userMessage || '').trim();
  const lower = msg.toLowerCase();
  const { user, recentHealth, recentMood, tasks } = context;

  // 1. Safety & Crisis check (Compassionate, emergency boundary)
  const crisisKeywords = ['suicide', 'kill myself', 'end my life', 'harm myself', 'tự tử', 'muốn chết', 'tự hại'];
  for (const kw of crisisKeywords) {
    if (lower.includes(kw)) {
      return {
        reply: `💙 **We care about you, and you do not have to go through this alone.**\n\nIf you are feeling overwhelmed or experiencing thoughts of harming yourself, please immediately reach out to a trusted professional or emergency support right now:\n\n- **In the US:** Call or text **988** (Suicide & Crisis Lifeline - free, confidential, 24/7) or text HOME to 741741.\n- **In Vietnam:** Call **1900 9095** (Health Hotline) or **115** (Emergency Medical).\n- **International:** Visit [Befrienders Worldwide](https://www.befrienders.org/) or [findahelpline.com](https://findahelpline.com/) to connect with immediate confidential support in your country.\n\n*Please talk to someone who can support you today. LifeCare is an organizational tool and cannot provide medical or crisis intervention.*`,
        type: 'crisis_alert'
      };
    }
  }

  // 2. Health & Medical Symptom Disclaimer check
  const medicalKeywords = ['chest pain', 'heart attack', 'diagnose', 'disease', 'đau ngực', 'khó thở', 'chẩn đoán bệnh', 'ung thư', 'bệnh viện'];
  if (medicalKeywords.some(kw => lower.includes(kw))) {
    return {
      reply: `🩺 **Health & Medical Guidance Notice**\n\nLifeCare is designed for personal habit organization, mindfulness, and general wellness self-reflection. **We do not diagnose diseases, interpret clinical symptoms, or prescribe treatments.**\n\nIf you are experiencing acute physical distress, severe chest discomfort, breathing difficulties, or persistent painful symptoms, please consult a qualified physician or contact local medical services promptly. Your safety is paramount!`,
      type: 'medical_disclaimer'
    };
  }

  // 3. Smart Schedule Recommendation query (Feature #4)
  if (lower.includes('schedule') || lower.includes('lịch') || lower.includes('recommend') || lower.includes('gợi ý') || lower.includes('busy') || lower.includes('bận')) {
    const analysis = analyzeScheduleBalance(tasks || []);
    return {
      reply: `🗓️ **Smart Schedule Balance Recommendation:**\n\n${analysis.summary}\n\n**Actionable Advice for your Day:**\n${analysis.recommendations.map(r => `• ${r}`).join('\n')}`,
      type: 'schedule_recommendation',
      suggestedTasks: analysis.suggestedTasks
    };
  }

  // 4. Weekly Report Analysis query (Feature #5)
  if (lower.includes('report') || lower.includes('báo cáo') || lower.includes('summary') || lower.includes('tổng kết') || lower.includes('week') || lower.includes('tuần')) {
    const report = buildWeeklyReportData(tasks || [], recentHealth || [], recentMood || []);
    return {
      reply: `📊 **Your LifeCare Weekly Wellness Overview:**\n\n${report.message}\n\n**Weekly Metrics Summary:**\n• **Tasks Completed:** ${report.completedTasks} / ${report.totalTasks} (${report.completionRate}%)\n• **Average Sleep:** ${report.avgSleep} hrs/day\n• **Positive Mood Days:** ${report.positiveMoodDays} / 7 days\n• **Average Stress Level:** ${report.avgStress}/5\n\n💡 *${report.encouragement}*`,
      type: 'weekly_report'
    };
  }

  // 5. Stress, Exhaustion & Overwhelm
  if (lower.includes('stress') || lower.includes('mệt') || lower.includes('tired') || lower.includes('áp lực') || lower.includes('burnout') || lower.includes('anxious') || lower.includes('lo lắng')) {
    return {
      reply: `🌿 **Take a deep breath. You don't have to solve everything all at once.**\n\nWhen stress or exhaustion kicks in, your nervous system is asking for a reset:\n1. **The 4-7-8 Breathing Technique:** Inhale through your nose for 4s, hold gently for 7s, exhale completely through your mouth for 8s. Repeat 3 times to engage the parasympathetic calming response.\n2. **Energy Audit:** Look at today's tasks. Which one can be safely postponed to tomorrow? Give yourself permission to prioritize rest.\n3. **Screen Detox:** Step away from your laptop or phone for 10 minutes. Sip cool water and look out a window.\n\nWould you like me to add a quick 15-minute relaxation break into your planner today?`,
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

  // 6. Sleep & Physical Vitality
  if (lower.includes('sleep') || lower.includes('ngủ') || lower.includes('water') || lower.includes('nước') || lower.includes('mất ngủ') || lower.includes('insomnia')) {
    return {
      reply: `🌙 **Restorative Sleep & Hydration Tips:**\n\n• **Sleep Hygiene:** Try turning off blue-light devices at least 45 minutes before bedtime. A cooler bedroom environment (around 19-21°C / 66-70°F) promotes deeper delta-wave sleep.\n• **Hydration Balance:** Aim to sip water evenly throughout the day rather than chugging late in the evening.\n• **Wind-down routine:** Gentle stretching or reading a physical book signals melatonin release.\n\nRemember: Rest is not a reward for work; it is an essential foundation for living!`,
      type: 'wellness_tip'
    };
  }

  // 7. Positive vibes / Celebrations
  if (lower.includes('happy') || lower.includes('vui') || lower.includes('great') || lower.includes('tuyệt') || lower.includes('done') || lower.includes('hoàn thành')) {
    return {
      reply: `✨ **That's wonderful! Celebrating your momentum and positive energy!**\n\nAcknowledging little wins trains the brain to cultivate lasting resilience. Take a moment to savor this feeling, celebrate what you achieved today, and stay grounded.\n\nKeep shining and enjoying the journey! 🌟`,
      type: 'positive_reinforcement'
    };
  }

  // Default holistic coaching response
  const userName = (user && user.full_name) ? user.full_name.split(' ')[0] : 'friend';
  return {
    reply: `Hello ${userName}! 👋 I am your LifeCare AI Wellness Assistant.\n\nI can help you with:\n1. **Smart Schedule Optimization:** Balancing study, work, movement, and designated rest breaks.\n2. **Stress & Mindful Recovery:** Breathing methods, restorative micro-breaks, and grounding prompts.\n3. **Wellness Reflections:** Reviewing your sleep, hydration, and mood trends across the week.\n\nHow are you feeling physically and mentally today? Feel free to ask me anything or request a schedule review!`,
    type: 'general_guidance'
  };
}

/**
 * Feature #4: Smart Schedule Recommendation Engine
 * Analyzes tasks for long stretches of work/study without breaks.
 */
function analyzeScheduleBalance(tasks = []) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.date === todayStr);

  const workAndStudy = todayTasks.filter(t => t.category === 'Work' || t.category === 'Study');
  const restAndExercise = todayTasks.filter(t => t.category === 'Rest' || t.category === 'Exercise');

  const recommendations = [];
  const suggestedTasks = [];

  if (todayTasks.length === 0) {
    return {
      summary: 'You have no scheduled tasks for today. It is a great canvas to intentionally plan a balanced blend of focus and self-care!',
      recommendations: [
        'Add 1-2 primary priority tasks for meaningful progress.',
        'Schedule a 20-minute physical walk or movement break.',
        'Block out designated unwind time this evening.'
      ],
      suggestedTasks: [
        { title: 'Morning Focus Session', category: 'Study', priority: 'medium', start_time: '09:00', end_time: '11:00' },
        { title: 'Hydration & Light Walk', category: 'Rest', priority: 'low', start_time: '11:15', end_time: '11:35' }
      ]
    };
  }

  // Workload check
  if (workAndStudy.length >= 4 && restAndExercise.length === 0) {
    recommendations.push('⚠️ You have several high-focus work/study blocks without any scheduled rest or physical recovery.');
    recommendations.push('💧 Recommendation: Insert a 15-minute hydration and posture-stretch break between intensive sessions.');
    recommendations.push('🚶 Recommendation: Take a 20-minute brisk walk outdoors to reset cortisol levels.');
    suggestedTasks.push({
      title: 'Mindful 15-min Break & Hydration',
      description: 'Step away from screen, drink water and stretch arms/neck',
      category: 'Rest',
      priority: 'high',
      start_time: '14:30',
      end_time: '14:45'
    });
  } else if (workAndStudy.length >= 3) {
    recommendations.push('✅ Good focus lineup today. Remember the Pomodoro principle: 50 minutes focus followed by 10 minutes screen-free rest.');
    recommendations.push('🌱 Avoid stacking back-to-back deadlines without a lunch buffer.');
  } else {
    recommendations.push('✨ Your current task balance looks gentle and manageable!');
    recommendations.push('🌟 Keep protecting your evening hours for restorative sleep.');
  }

  // Hydration check
  recommendations.push('💧 Remember to drink at least 2.0 - 2.5 Liters of fresh water today.');

  return {
    summary: `Found ${todayTasks.length} tasks scheduled for today (${workAndStudy.length} focus tasks, ${restAndExercise.length} wellness/rest tasks).`,
    recommendations,
    suggestedTasks
  };
}

/**
 * Feature #5: Weekly Personal Report Generator
 */
function buildWeeklyReportData(tasks = [], healthRecords = [], moodRecords = []) {
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

  let message = `You made steady progress this week! Balancing personal goals with mental and physical recovery is a marathon, not a sprint.`;
  let encouragement = `Next week, consider scheduling your wellness breaks right alongside your work meetings!`;

  if (completionRate >= 80) {
    message = `Outstanding productivity this week with an impressive ${completionRate}% task completion!`;
    encouragement = `You maintained strong focus. Make sure you celebrate your victories and allow your mind to fully recharge!`;
  } else if (avgStress >= 3.5) {
    message = `We noticed higher stress levels recorded this week. It is completely natural to experience challenging weeks.`;
    encouragement = `For next week, try trimming 20% of non-essential tasks to create breathing space for yourself.`;
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

module.exports = {
  generateAIWellnessReply,
  analyzeScheduleBalance,
  buildWeeklyReportData
};

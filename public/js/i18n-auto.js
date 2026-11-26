/**
 * LifeCare – dịch tự động phần chữ chưa gắn data-i18n.
 *
 * - Từ điển cụm từ Việt ↔ Anh (PHRASES) dùng cho chữ tĩnh trong index.html, chữ do JS tạo ra,
 *   thông báo từ server và dữ liệu mẫu.
 * - Mỗi nút chữ (text node) và thuộc tính placeholder/title/aria-label được ghi nhớ bản gốc,
 *   nên đổi qua lại hai ngôn ngữ nhiều lần vẫn đúng.
 * - MutationObserver dịch luôn phần giao diện được vẽ lại sau này (danh sách, toast, modal...).
 * - Biểu tượng / số ở đầu và cuối chuỗi được giữ nguyên: "😴 Ngủ nghỉ" → "😴 Sleep".
 * - Không dịch nội dung trò chuyện với AI và phần tử có [data-no-translate].
 *
 * Hàm dùng chung: tr(text) – dịch một chuỗi sang ngôn ngữ đang chọn.
 */
(function () {
  // [Tiếng Việt, English]
  const PHRASES = [
    // ---------------------------------------------------------------- Đăng nhập / tài khoản khách
    ['Đăng nhập / Đăng ký', 'Sign in / Register'],
    ['dữ liệu được lưu và mã hoá', 'your data is saved and encrypted'],
    ['Tài khoản khách', 'Guest account'],
    ['dùng thử ngay,', 'try it right away,'],
    ['không lưu dữ liệu', 'no data is saved'],
    ['hoặc', 'or'],
    ['Dùng tài khoản khách (không lưu dữ liệu)', 'Use a guest account (no data saved)'],
    ['Có sẵn dữ liệu mẫu để xem thử', 'Include sample data to explore'],
    ['Chuyển dữ liệu đang dùng thử (tài khoản khách) sang tài khoản mới', 'Move the data from this guest session into the new account'],
    ['Nhập email đã đăng ký của bạn để nhận hướng dẫn khôi phục mật khẩu an toàn.', 'Enter your registered email to receive secure password recovery instructions.'],
    ['Bạn đang dùng', 'You are using'],
    ['tài khoản khách', 'a guest account'],
    ['dữ liệu', 'data is'],
    ['không được lưu', 'not saved'],
    ['và sẽ mất khi đăng xuất hoặc sau 24 giờ.', 'and will be lost when you sign out or after 24 hours.'],
    ['Tạo tài khoản để lưu', 'Create an account to save'],
    ['Khách', 'Guest'],
    ['Tối thiểu 6 ký tự', 'At least 6 characters'],
    ['e.g. Nguyễn Văn An', 'e.g. Alex Nguyen'],
    ['e.g. Ngủ 8h, đi bộ hằng ngày, giảm căng thẳng', 'e.g. Sleep 8h, walk daily, reduce stress'],
    ['Đổi ngôn ngữ', 'Switch language'],
    ['Đã đăng xuất.', 'Signed out.'],
    ['Phiên khách đã kết thúc.', 'Guest session ended.'],

    // ---------------------------------------------------------------- Bảng điều khiển
    ['Chào buổi sáng', 'Good morning'],
    ['Chào buổi chiều', 'Good afternoon'],
    ['Chào buổi tối', 'Good evening'],
    ['"Sự cân bằng không phải tự nhiên có, mà do chính bạn tạo ra."', '"Balance is not something you find, it is something you create."'],
    ['"Hãy hít thở chậm lại. Sự cân bằng là làm đúng việc với tốc độ vừa vặn và bền bỉ."', '"Slow down and breathe. Balance means doing the right things at a steady, sustainable pace."'],
    ['"Hãy cho phép bản thân nghỉ ngơi. Sự cân bằng và an yên nội tại quan trọng hơn mọi sự hối hả."', '"Allow yourself to rest. Inner balance and calm matter more than any rush."'],
    ['Đang tải...', 'Loading...'],
    ['Báo gián đoạn', 'Report disruption'],
    ['Khai báo sự cố, nghỉ học, việc phát sinh...', 'Report an incident, cancelled class, new work...'],
    ['Đang tính toán chỉ số dựa trên giấc ngủ, vận động và cảm xúc...', 'Calculating your score from sleep, activity and mood...'],
    ['h ngủ', 'h sleep'],
    ['Năng lượng', 'Energy'],
    ['Căng thẳng', 'Stress'],
    ['Căng thẳng', 'Stressed'],
    ['VD: 7.5', 'e.g. 7.5'],
    ['Đang phân tích thời gian biểu...', 'Analyzing your schedule...'],
    ['mục tiêu ngày', 'of daily plan'],
    ['Công việc đang chờ', 'Pending tasks'],
    ['Chưa điểm danh', 'Not checked in'],
    ['Cân bằng', 'Balanced'],
    ['Ghi nhận gần nhất', 'Latest record'],
    ['Ghi nhận hôm nay', 'Logged today'],
    ['Hôm nay', 'Today'],
    ['Lịch trình hôm nay phân bổ khá hợp lý.', 'Today\'s schedule is well balanced.'],
    ['Tuần trước', 'Previous week'],
    ['Tuần sau', 'Next week'],
    ['Trước', 'Previous'],
    ['Sau', 'Next'],

    // ---------------------------------------------------------------- Kế hoạch
    ['Tìm kiếm công việc...', 'Search tasks...'],
    ['Thuộc mục tiêu', 'Part of goal'],
    ['— Không thuộc mục tiêu nào —', '— Not part of a goal —'],
    ['Thời lượng (phút)', 'Duration (minutes)'],
    ['Hạn chót', 'Deadline'],
    ['Học tập', 'Study'],
    ['Công việc', 'Work'],
    ['Thể thao', 'Exercise'],
    ['Cá nhân', 'Personal'],
    ['Nghỉ ngơi', 'Rest'],
    ['Khác', 'Other'],
    ['Cao', 'High'],
    ['Vừa', 'Medium'],
    ['Thấp', 'Low'],

    // ---------------------------------------------------------------- Thời gian biểu
    ['Thời gian biểu cố định', 'Fixed weekly routine'],
    ['Chia ngày thành các khung giờ: ngủ nghỉ, ăn uống, đi học, học thêm, giải trí, tập luyện, tự học. Chỉ cần thiết lập một lần, lịch tự lặp lại cho các tuần sau. Thời gian còn trống được AI phân bổ theo mục tiêu và thói quen của bạn.',
      'Split your day into time blocks: sleep, meals, school, extra classes, leisure, exercise and self-study. Set it up once and it repeats every week. AI fills the free time based on your goals and habits.'],
    ['+ Thêm khung giờ', '+ Add time block'],
    ['AI phân bổ giờ trống', 'AI: fill free time'],
    ['Thiết lập nhanh một lần', 'Quick one-time setup'],
    ['Chọn một mẫu rồi chỉnh lại cho hợp với bạn.', 'Pick a template, then adjust it to suit you.'],
    ['Học sinh (THCS/THPT)', 'Middle/high school student'],
    ['Sinh viên', 'University student'],
    ['Người đi làm', 'Working professional'],
    ['Cả tuần', 'All week'],
    ['Thay thời gian biểu hiện tại', 'Replace current routine'],
    ['Áp dụng', 'Apply'],
    ['Tuần này theo khung giờ', 'This week by time block'],
    ['Xóa kế hoạch', 'Delete plans'],
    ['Các khung giờ đã thiết lập', 'Your time blocks'],
    ['Ngủ nghỉ', 'Sleep'],
    ['Ăn uống', 'Meals'],
    ['Đi học / đi làm', 'School / work'],
    ['Học thêm', 'Extra class'],
    ['Giải trí', 'Leisure'],
    ['Tập luyện', 'Exercise'],
    ['Tự học', 'Self-study'],
    ['Loại', 'Type'],
    ['Tên hiển thị', 'Display name'],
    ['VD: Học thêm Toán', 'e.g. Extra math class'],
    ['Bắt đầu', 'Start'],
    ['Kết thúc', 'End'],
    ['(qua đêm được)', '(can pass midnight)'],
    ['Áp dụng cho các ngày', 'Apply to days'],
    ['Lưu khung giờ', 'Save time block'],
    ['Thêm khung giờ', 'Add time block'],
    // Nhãn khung giờ trong các mẫu có sẵn
    ['Ngủ', 'Sleep'],
    ['Ăn sáng', 'Breakfast'],
    ['Ăn trưa', 'Lunch'],
    ['Ăn trưa & nghỉ', 'Lunch & break'],
    ['Ăn tối', 'Dinner'],
    ['Lên lớp', 'Classes'],
    ['Học trên lớp', 'Classes at school'],
    ['Vận động', 'Physical activity'],
    ['Giờ làm việc', 'Working hours'],
    ['Học / phát triển bản thân', 'Learning / self-development'],
    ['Giải trí & gia đình', 'Leisure & family'],
    // Xoá kế hoạch
    ['Xóa tất cả kế hoạch', 'Delete all plans'],
    ['Xóa nhiều kế hoạch cùng một lúc', 'Delete several plans at once'],
    ['Chọn các kế hoạch muốn xóa trong tuần này.', 'Choose which plans to delete this week.'],
    ['Khung giờ cố định (ngủ, ăn, đi học...) không bị xóa.', 'Fixed time blocks (sleep, meals, school...) are not deleted.'],
    ['Kéo thả công việc hoặc khung giờ sang ngày, giờ khác để sắp xếp lại; kéo mép trên/dưới để đổi giờ bắt đầu/kết thúc. Kéo một nhãn ở trên xuống lưới để thêm mới. Bấm vào khung giờ để sửa.', 'Drag a task or time block to another day or time to rearrange it; drag its top/bottom edge to change the start/end time. Drag a label above onto the grid to add one. Click a block to edit it.'],
    ['Chọn tất cả', 'Select all'],
    ['← Quay lại', '← Back'],
    ['Xóa mục đã chọn', 'Delete selected'],

    // ---------------------------------------------------------------- Mục tiêu
    ['Mục tiêu lớn & tiến độ', 'Big goals & progress'],
    ['AI chia mục tiêu lớn thành việc cụ thể (thời lượng, ưu tiên, hạn). Mọi lần hoàn thành, kể cả học/làm thêm ngoài lịch, đều được ghi lại để dự báo bạn xong sớm hay trễ hơn dự kiến.',
      'AI breaks big goals into concrete tasks (duration, priority, deadline). Every completion, including extra work outside the plan, is logged to forecast whether you will finish early or late.'],
    ['+ Mục tiêu mới', '+ New goal'],
    ['Mục tiêu mới', 'New goal'],
    ['Nhật ký tiến độ gần đây', 'Recent progress log'],
    ['Tên mục tiêu', 'Goal name'],
    ['VD: Ôn thi IELTS đạt 6.5', 'e.g. Reach IELTS 6.5'],
    ['Mô tả', 'Description'],
    ['(trình độ hiện tại, yêu cầu cụ thể...)', '(current level, specific requirements...)'],
    ['Mô tả mục tiêu của bạn...', 'Describe your goal...'],
    ['Tổng thời lượng dự kiến (giờ)', 'Estimated total time (hours)'],
    ['Để trống: AI ước lượng', 'Leave blank: AI estimates'],
    ['Ưu tiên', 'Priority'],
    ['Trạng thái', 'Status'],
    ['Đang thực hiện', 'In progress'],
    ['Tạm dừng', 'Paused'],
    ['Đã xong', 'Done'],
    ['Nhờ AI chia nhỏ thành công việc cụ thể và xếp vào giờ trống', 'Ask AI to break it into tasks and schedule them in free time'],
    ['Lưu mục tiêu', 'Save goal'],
    ['+ Ghi thêm tiến độ', '+ Log extra progress'],
    ['Ghi thêm tiến độ', 'Log extra progress'],
    ['Bạn đã học/làm nhiều hơn lịch? Ghi lại để % hoàn thành và dự báo được cập nhật.', 'Did more than planned? Log it so the completion % and forecast update.'],
    ['Số phút', 'Minutes'],
    ['Ghi chú', 'Note'],
    ['VD: làm thêm 2 đề luyện', 'e.g. did 2 extra practice tests'],
    ['Lưu', 'Save'],
    ['Ghi chú chi tiết mục tiêu...', 'Goal details...'],
    ['e.g. Ôn tập nghiên cứu khoa học', 'e.g. Review research notes'],

    // ---------------------------------------------------------------- Gián đoạn
    ['Báo gián đoạn lịch trình', 'Report a schedule disruption'],
    ['AI sẽ cân nhắc ưu tiên, hạn chót và thời gian còn lại để xếp lại, không đơn giản dồn hết sang ngày mai.', 'AI weighs priority, deadlines and remaining time to re-plan, instead of just pushing everything to tomorrow.'],
    ['Loại gián đoạn', 'Disruption type'],
    ['Sự cố (ốm, hỏng xe, việc gia đình...)', 'Incident (illness, broken bike, family matter...)'],
    ['Nghỉ học / lớp bị huỷ', 'Day off / class cancelled'],
    ['Công việc phát sinh', 'New unplanned work'],
    ['Không thể thực hiện nhiệm vụ trong khoảng này', 'Unable to do tasks in this period'],
    ['Sự cố', 'Incident'],
    ['Nghỉ học', 'Class cancelled'],
    ['Việc phát sinh', 'New work'],
    ['Không thể thực hiện', 'Unavailable'],
    ['Ngày', 'Date'],
    ['Cả ngày', 'All day'],
    ['Từ', 'From'],
    ['Đến', 'To'],
    ['(việc phát sinh là gì, mất bao lâu, hạn khi nào...)', '(what came up, how long it takes, when it is due...)'],
    ['VD: Phải làm bài tập nhóm gấp khoảng 2 tiếng, nộp tối thứ 6', 'e.g. Urgent group assignment, about 2 hours, due Friday night'],
    ['Nhờ AI sắp xếp lại các việc bị ảnh hưởng ngay', 'Ask AI to re-plan the affected tasks now'],
    ['Lưu gián đoạn', 'Save disruption'],

    // ---------------------------------------------------------------- Kiểm tra nhanh hằng ngày
    ['Kiểm tra nhanh trạng thái hôm nay', 'Quick check-in for today'],
    ['30 giây. AI so sánh với tâm lý nền của bạn rồi điều chỉnh nhẹ lịch hôm nay.', '30 seconds. AI compares it with your baseline and gently adjusts today\'s plan.'],
    ['Tâm trạng của bạn ngay lúc này?', 'How is your mood right now?'],
    ['Vui vẻ', 'Happy'],
    ['Thư thái', 'Relaxed'],
    ['Hào hứng', 'Excited'],
    ['Bình thường', 'Normal'],
    ['Mệt mỏi', 'Tired'],
    ['Buồn', 'Sad'],
    ['Lo âu', 'Anxious'],
    ['Quá tải', 'Overwhelmed'],
    ['Đêm qua bạn ngủ thế nào?', 'How did you sleep last night?'],
    ['Ngủ ngon và đủ giấc (~7.5h)', 'Slept well and enough (~7.5h)'],
    ['Tương đối (~6h)', 'Okay (~6h)'],
    ['Chập chờn hoặc thiếu ngủ (~5h)', 'Restless or short sleep (~5h)'],
    ['Ngủ sâu và thư thái (~8.5h)', 'Deep, restful sleep (~8.5h)'],
    ['Bạn có đang chịu áp lực lớn nào không?', 'Are you under a lot of pressure?'],
    ['Rất thoải mái, không áp lực', 'Very relaxed, no pressure'],
    ['Áp lực nhẹ, kiểm soát tốt', 'Mild pressure, under control'],
    ['Hơi căng thẳng', 'A bit stressed'],
    ['Khá nhiều áp lực', 'Quite a lot of pressure'],
    ['Năng lượng cơ thể', 'Physical energy'],
    ['Kiệt sức', 'Exhausted'],
    ['Mệt', 'Tired'],
    ['Tạm ổn', 'Okay'],
    ['Khoẻ', 'Healthy'],
    ['Tràn đầy', 'Full of energy'],
    ['Ý chí / động lực hôm nay', 'Willpower / motivation today'],
    ['Không muốn làm gì', 'Don\'t feel like doing anything'],
    ['Uể oải', 'Sluggish'],
    ['Có động lực', 'Motivated'],
    ['Rất quyết tâm', 'Very determined'],
    ['Để AI điều chỉnh nhẹ lịch hôm nay theo trạng thái này', 'Let AI gently adjust today\'s plan to this state'],
    ['Hoàn Thành Trong 30 Giây', 'Done in 30 seconds'],

    // ---------------------------------------------------------------- Trợ lý AI
    ['Lịch Trình', 'Schedule'],
    ['Thư Giãn', 'Wellness'],
    ['Góc Nhìn', 'Insights'],
    ['Nhập câu hỏi hoặc chọn chế độ ở trên...', 'Type a question or pick a mode above...'],
    ['Thử lại', 'Retry'],

    // ---------------------------------------------------------------- Sức khoẻ thể chất / tinh thần
    ['e.g. Đi bộ, yoga, gym, chạy bộ...', 'e.g. Walking, yoga, gym, running...'],
    ['VD: Sáng: yến mạch + trứng, Trưa: cơm, rau, cá, Tối: salad ức gà', 'e.g. Breakfast: oats + eggs, Lunch: rice, vegetables, fish, Dinner: chicken salad'],
    ['e.g. mỏi vai gáy do ngồi lâu, đau đầu nhẹ, không có...', 'e.g. stiff neck from sitting, mild headache, none...'],
    ['Ghi chú thêm về cảm giác cơ thể...', 'More notes about how your body feels...'],
    ['Hãy viết ra những suy nghĩ, điều bạn biết ơn hoặc điều đang trăn trở hôm nay...', 'Write down your thoughts, what you are grateful for or what is on your mind today...'],
    ['Nước', 'Water'],
    ['Nước uống', 'Water'],
    ['Triệu chứng', 'Symptoms'],
    ['Động lực', 'Motivation'],
    ['Kết nối', 'Connection'],
    ['Chưa ghi', 'Not logged'],
    ['Giấc ngủ', 'Sleep'],
    ['Có', 'Yes'],
    ['Không', 'No'],
    ['Tốt', 'Good'],
    ['Rất tốt', 'Very Good'],
    ['Trung bình', 'Average'],
    ['Kém', 'Poor'],
    ['Rất kém', 'Very Poor'],
    ['Không khoẻ', 'Unwell'],

    // ---------------------------------------------------------------- Báo cáo
    ['7 ngày gần nhất', 'Last 7 days'],
    ['Đang tổng hợp báo cáo tuần của bạn...', 'Compiling your weekly report...'],

    // ---------------------------------------------------------------- Cài đặt
    ['Tâm lý & ý chí nền (cố định)', 'Baseline psychology & willpower (fixed)'],
    ['Đây là "con người thường ngày" của bạn. Mỗi ngày bạn làm một bài kiểm tra nhanh trạng thái, AI so sánh với mốc này để điều chỉnh nhẹ lịch hôm đó.',
      'This is your "everyday self". Each day you take a quick check-in, and AI compares it with this baseline to gently adjust that day\'s plan.'],
    ['Sức bền ý chí', 'Willpower stamina'],
    ['Dễ bỏ cuộc', 'Gives up easily'],
    ['Cần nhắc nhiều', 'Needs many reminders'],
    ['Khá kiên trì', 'Fairly persistent'],
    ['Rất kỷ luật', 'Very disciplined'],
    ['Khả năng chịu áp lực', 'Stress tolerance'],
    ['Rất dễ căng thẳng', 'Gets stressed very easily'],
    ['Hơi dễ căng thẳng', 'Gets stressed somewhat easily'],
    ['Khá vững', 'Fairly resilient'],
    ['Rất vững', 'Very resilient'],
    ['Điều thúc đẩy bạn nhất', 'What motivates you most'],
    ['Mục tiêu dài hạn', 'Long-term goals'],
    ['Phần thưởng ngắn hạn', 'Short-term rewards'],
    ['Áp lực hạn chót', 'Deadline pressure'],
    ['Sự ghi nhận của người khác', 'Recognition from others'],
    ['Niềm vui / sự tò mò', 'Fun / curiosity'],
    ['Giờ tập trung tốt nhất', 'Best focus time'],
    ['Buổi sáng', 'Morning'],
    ['Buổi chiều', 'Afternoon'],
    ['Buổi tối', 'Evening'],
    ['Đêm khuya', 'Late night'],
    ['Tập trung liền tối đa (phút)', 'Longest focus stretch (minutes)'],
    ['Ghi chú về bản thân', 'Notes about yourself'],
    ['(không bắt buộc)', '(optional)'],
    ['VD: hay trì hoãn việc khó, học tốt khi có bạn học cùng...', 'e.g. I put off hard tasks, I study better with a partner...'],
    ['Lưu tâm lý nền', 'Save baseline'],
    ['Nhắc lại nếu chưa xác nhận hoàn thành sau', 'Remind again if not confirmed done after'],
    ['phút', 'minutes'],
    ['Cảnh báo khi mục tiêu có nguy cơ không kịp', 'Warn me when a goal is at risk of missing its deadline'],
    ['Thông báo trình duyệt: đang kiểm tra...', 'Browser notifications: checking...'],
    ['Bật thông báo trình duyệt', 'Enable browser notifications'],

    // ---------------------------------------------------------------- Dữ liệu mẫu (để dữ liệu mẫu cũ bằng tiếng Anh cũng hiển thị đúng)
    ['Hoàn thành báo cáo nghiên cứu', 'Finish the research report'],
    ['Báo cáo 20 trang về kiến trúc cơ sở dữ liệu phân tán', '20-page report on distributed database architecture'],
    ['Đọc và tóm tắt 3 bài báo chính', 'Read and summarize 3 key papers'],
    ['Lập dàn ý báo cáo', 'Outline the report'],
    ['Viết phần 1: Tổng quan', 'Write part 1: Overview'],
    ['Viết phần 2: So sánh kiến trúc', 'Write part 2: Architecture comparison'],
    ['Đọc thêm tài liệu ngoài kế hoạch', 'Extra reading outside the plan'],
    ['Yoga buổi sáng & thiền thở', 'Morning Yoga & Breathing Meditation'],
    ['Giãn cơ nhẹ 20 phút và bài thở 4-7-8', 'Gentle 20-min vinyasa stretch and 4-7-8 deep breathing routine'],
    ['Đọc bài báo về kiến trúc hệ thống', 'Review System Architecture Paper'],
    ['Phân tích đánh đổi của cơ sở dữ liệu phân tán và ghi tóm tắt', 'Analyze distributed database trade-offs and draft summary notes'],
    ['Ăn trưa chánh niệm & uống nước', 'Mindful Lunch & Hydration Break'],
    ['Ăn xa màn hình và uống một cốc nước lớn', 'Eat away from screens and drink a large glass of water'],
    ['Họp nhóm dự án', 'Team Product Sync & Standup'],
    ['Thống nhất việc cần giao trong tuần và gỡ vướng mắc', 'Align on sprint deliverables and unblock dependencies'],
    ['Đi dạo buổi tối ở công viên', 'Evening Walk in Community Park'],
    ['Thư giãn không điện thoại, hít thở không khí trong lành', 'Unwind without phone, get fresh air and sunshine'],
    ['Viết nhật ký trên LifeCare', 'Reflect & Journal in LifeCare'],
    ['Ghi 3 điều biết ơn và ghi lại tâm trạng', 'Write down 3 things I am grateful for and log mood'],
    ['Nộp báo cáo thí nghiệm', 'Submit Bi-weekly Lab Report'],
    ['Hoàn thiện tài liệu tham khảo và nộp PDF', 'Finalize references and submit PDF to portal'],
    ['Đạp xe 30 phút', '30-minute Cardio Cycling'],
    ['Tập trong nhà, giữ nhịp tim vùng 2', 'Indoor trainer session maintaining zone 2 cardio'],
    ['Đi chợ: rau xanh & trái cây', 'Grocery Restock: Fresh Greens & Fruits'],
    ['Mua dâu, rau chân vịt, hạnh nhân và sữa yến mạch', 'Buy berries, spinach, almonds and oat milk'],
    ['Ngủ đủ giấc, yoga buổi sáng rất sảng khoái.', 'Felt well rested, morning yoga felt invigorating.'],
    ['Năng lượng tốt suốt buổi chiều.', 'Good energy throughout the afternoon.'],
    ['Cần đứng dậy vận động thường xuyên hơn.', 'Need to stand up more frequently.'],
    ['Rất nhiều năng lượng sau 8 tiếng ngủ ngon!', 'Super energized today after solid 8h sleep!'],
    ['Nhịp độ đều, uống nước đầy đủ.', 'Steady pace, hydrated regularly.'],
    ['Thức khuya đọc sách, thấy uể oải.', 'Stayed up reading late, felt sluggish.'],
    ['Hồi phục tốt, đi bộ nhanh ngoài trời.', 'Recovered well, took a brisk outdoor walk.'],
    ['Hơi cứng lưng dưới vì ngồi lâu', 'Slight lower back stiffness from sitting'],
    ['Đau đầu nhẹ buổi tối', 'Mild headache in evening'],
    ['Thấy cân bằng và vững vàng. Kế hoạch hôm nay rõ ràng.', 'Feeling centered and balanced. Clear plan for today.'],
    ['Nói chuyện vui với bạn bè và xong một cột mốc dự án.', 'Had great talk with friends and finished project milestone.'],
    ['Hơi kiệt sức vì họp liên tục. Cần đi ngủ sớm.', 'A bit drained from back-to-back meetings. Need early bedtime.'],
    ['Nhận được góp ý tích cực về đề cương nghiên cứu.', 'Received positive feedback on research proposal.'],
    ['Một ngày làm việc bình thường, giữ được bình tĩnh.', 'Standard productive day, kept calm.'],
    ['Thấy hơi trễ hạn, tự nhắc mình hít thở sâu.', 'Felt a bit behind on deadlines, reminded myself to breathe.'],
    ['Dành thời gian chất lượng ngoài thiên nhiên.', 'Spent quality time outdoors in nature.'],
    ['Nhắc uống nước 💧', 'Daily Hydration Check 💧'],
    ['Uống một cốc nước để cơ thể tỉnh táo và tập trung.', 'Drink a fresh glass of water to keep your body vibrant and focused.'],
    ['Sắp tới: Họp nhóm dự án 📅', 'Upcoming: Team Product Sync 📅'],
    ['Bắt đầu sau 30 phút, lúc 14:00.', 'Starting in 30 minutes at 14:00.'],

    // ---------------------------------------------------------------- Thông báo từ server
    ['Chưa đăng nhập.', 'Not signed in.'],
    ['Phiên đăng nhập đã hết hạn.', 'Unauthorized.'],
    ['Không tìm thấy đường dẫn API.', 'API route not found'],
    ['Email này đã có tài khoản.', 'An account with this email already exists.'],
    ['Cần nhập mật khẩu hiện tại và mật khẩu mới.', 'Current and new password are required.'],
    ['Cần danh sách ids hoặc khoảng ngày start/end hợp lệ.', 'A list of ids or a valid start/end date range is required.'],
    ['Đã ghi nhận khảo sát thể chất hôm nay!', 'Daily physical check-in recorded!'],
    ['Vui lòng nhập email.', 'Email is required.'],
    ['Cần nhập email, mật khẩu và họ tên.', 'Email, password and full name are required.'],
    ['Đã lưu nhật ký cảm xúc.', 'Emotional reflection saved.'],
    ['Mức năng lượng phải là số nguyên từ 1 đến 5.', 'Energy level must be an integer between 1 and 5.'],
    ['Thời gian tập phải từ 0 đến 1440 phút.', 'Exercise duration must be between 0 and 1440 minutes.'],
    ['Đã xoá vĩnh viễn lịch sử sức khoẻ và tâm trạng.', 'Health and mood history permanently cleared.'],
    ['Nếu email này có trong hệ thống, hướng dẫn đặt lại mật khẩu đã được tạo.', 'If this email exists in our records, password reset instructions have been generated.'],
    ['Mật khẩu hiện tại không đúng.', 'Incorrect current password.'],
    ['Email hoặc mật khẩu không đúng.', 'Invalid email or password.'],
    ['Không có gì để cập nhật.', 'Nothing to update.'],
    ['Không tìm thấy bản ghi.', 'Record not found.'],
    ['Không tìm thấy gián đoạn.', 'Disruption not found.'],
    ['Không tìm thấy khung giờ.', 'Time block not found.'],
    ['Không tìm thấy mục tiêu.', 'Goal not found.'],
    ['Đăng xuất thành công.', 'Logged out successfully.'],
    ['Loại gián đoạn không hợp lệ.', 'Invalid disruption type.'],
    ['Lượng nước phải từ 0 đến 10000 ml.', 'Water must be between 0 and 10000 ml.'],
    ['Vui lòng nhập tin nhắn.', 'Message is required.'],
    ['Vui lòng chọn tâm trạng.', 'Mood selection is required.'],
    ['Mẫu không tồn tại.', 'Template does not exist.'],
    ['Ngày không hợp lệ.', 'Invalid date.'],
    ['Nhập đủ giờ bắt đầu và kết thúc (kết thúc sau bắt đầu), hoặc chọn cả ngày.', 'Enter both start and end time (end after start), or choose all day.'],
    ['Đã đổi mật khẩu thành công.', 'Password changed successfully.'],
    ['Đã tạo mã đặt lại mật khẩu. Khi chạy thật, mã sẽ được gửi qua email.', 'Password reset token generated successfully. In production, this would be delivered via verified email.'],
    ['Đã cập nhật mật khẩu. Bạn có thể đăng nhập.', 'Password updated successfully. You may now log in.'],
    ['Vui lòng nhập cả email và mật khẩu.', 'Please provide both email and password.'],
    ['Đã cập nhật hồ sơ.', 'Profile updated successfully.'],
    ['Đã điểm danh nhanh! Chúc bạn một ngày cân bằng.', 'Quick check-in completed in under a minute! Have a balanced day.'],
    ['Mã đặt lại không hợp lệ hoặc đã hết hạn.', 'Reset token is invalid or has expired.'],
    ['Đã lưu cài đặt.', 'Settings saved successfully.'],
    ['Thời gian ngủ phải là số từ 0 đến 24 giờ.', 'Sleep duration must be a valid number between 0 and 24 hours.'],
    ['Số phút phải từ 1 đến 1440.', 'Minutes must be between 1 and 1440.'],
    ['Đã tạo công việc.', 'Task created successfully.'],
    ['Đã xóa công việc.', 'Task deleted successfully.'],
    ['Không tìm thấy công việc.', 'Task not found or unauthorized.'],
    ['Đã cập nhật công việc.', 'Task updated successfully.'],
    ['Thời lượng phải từ 1 đến 1440 phút.', 'Duration must be between 1 and 1440 minutes.'],
    ['Cần có tiêu đề và nội dung.', 'Title and message required.'],
    ['Cần có tên, loại và ngày.', 'Title, category, and date are required.'],
    ['Cần có mã và mật khẩu mới.', 'Token and new password are required.'],
    ['Tài khoản và toàn bộ dữ liệu đã được xoá vĩnh viễn.', 'Your account and all associated data have been permanently removed.'],
    ['Đang dùng tài khoản khách. Dữ liệu sẽ không được lưu.', 'Using a guest account. Data will not be saved.'],
    ['Chọn ít nhất một ngày trong tuần.', 'Choose at least one day of the week.'],
    ['Giờ bắt đầu và kết thúc không được trùng nhau.', 'Start and end time cannot be the same.'],
    ['Giờ phải có dạng HH:MM.', 'Time must be in HH:MM format.'],
    ['Hạn chót không hợp lệ.', 'Invalid deadline.'],
    ['Loại khung giờ không hợp lệ.', 'Invalid time block type.'],
    ['Mức ưu tiên không hợp lệ.', 'Invalid priority.'],
    ['Thời lượng dự kiến không hợp lệ.', 'Invalid estimated duration.'],
    ['Trạng thái không hợp lệ.', 'Invalid status.'],
    ['Tên mục tiêu không được để trống.', 'Goal name cannot be empty.'],
    ['Công việc không hợp lệ.', 'Task must be an object.'],
    ['Ngày phải có dạng YYYY-MM-DD.', 'date must be a real date in YYYY-MM-DD.'],
    ['Hạn chót phải có dạng YYYY-MM-DD.', 'deadline must be YYYY-MM-DD.'],
    ['Thời lượng phải là số nguyên từ 1 đến 1440.', 'duration_minutes must be an integer between 1 and 1440.'],
    ['Cần có tên công việc.', 'title is required.'],
    ['Lưu ý sức khoẻ: Nếu bạn thấy không khoẻ, đau kéo dài hoặc căng thẳng nặng, hãy nhớ LifeCare không thay thế lời khuyên y tế. Hãy đi khám bác sĩ.',
      'Friendly Health Note: If you feel unwell or experience persistent pain or acute distress, remember that LifeCare does not replace medical advice. Please consult a qualified physician or healthcare provider.'],

    // ---------------------------------------------------------------- Nút / tiêu đề chung trong tiếng Anh gốc
    ['Đăng xuất', 'Logout'],
    ['Trò chuyện với trợ lý AI', 'Chat with AI Wellness Assistant'],
    ['Thông báo', 'Notifications'],
    ['Đổi giao diện sáng/tối', 'Toggle Theme'],
    ['Sửa', 'Edit'],
    ['Xoá', 'Delete'],
    ['Xóa', 'Delete'],
    ['Đóng', 'Close'],
    ['Huỷ', 'Cancel'],
    ['Hằng ngày', 'Daily'],
    ['Hằng tuần', 'Weekly'],
    ['Hằng tháng', 'Monthly'],
  ];

  // Mẫu có phần thay đổi (số, tên...). Mỗi mục: [regex tiếng Việt, mẫu tiếng Anh, regex tiếng Anh, mẫu tiếng Việt]
  const PATTERNS = [
    [/^Không thể tải dữ liệu: (.+)$/, 'Could not load data: $1', /^Could not load data: (.+)$/, 'Không thể tải dữ liệu: $1'],
    [/^Lỗi máy chủ: (.+)$/, 'Internal server error: $1', /^Internal server error: (.+)$/, 'Lỗi máy chủ: $1'],
    [/^Không kết nối được nơi lưu dữ liệu: (.+)$/, 'Could not reach the data store: $1', /^Could not reach the data store: (.+)$/, 'Không kết nối được nơi lưu dữ liệu: $1'],
    [/^Đã xử lý nhưng chưa lưu được dữ liệu: (.+)$/, 'Processed but the data could not be saved: $1', /^Processed but the data could not be saved: (.+)$/, 'Đã xử lý nhưng chưa lưu được dữ liệu: $1'],
    [/^Trùng lịch với "(.+)" \((.+)\)$/, 'Schedule overlap detected with "$1" ($2)', /^Schedule overlap detected with "(.+)" \((.+)\)$/, 'Trùng lịch với "$1" ($2)'],
    [/^Đã hoàn thành (\d+) \/ (\d+) công việc$/, 'Completed $1 / $2 tasks', /^Completed (\d+) \/ (\d+) tasks$/, 'Đã hoàn thành $1 / $2 công việc'],
    [/^(.+): Chưa ghi$/, '$1: Not logged', /^(.+): Not logged$/, '$1: Chưa ghi'],
  ];

  // ---------------------------------------------------------------- dựng từ điển
  // "Lõi" của chuỗi: bỏ biểu tượng / số / dấu câu ở hai đầu để "😴 Ngủ nghỉ" và "Ngủ nghỉ" dùng chung một mục.
  function splitCore(s) {
    const m = s.match(/^([^\p{L}]*)([\s\S]*?)([^\p{L}]*)$/u);
    return m ? [m[1], m[2], m[3]] : ['', s, ''];
  }
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const VI2EN = new Map();
  const EN2VI = new Map();
  for (const [vi, en] of PHRASES) {
    const v = norm(vi), e = norm(en);
    // Lưu cả chuỗi đầy đủ lẫn phần lõi, chuỗi đầy đủ được ưu tiên khi tra.
    if (!VI2EN.has(v)) VI2EN.set(v, e);
    if (!EN2VI.has(e)) EN2VI.set(e, v);
    const vc = splitCore(v)[1], ec = splitCore(e)[1];
    if (vc && ec) {
      if (!VI2EN.has(vc)) VI2EN.set(vc, ec);
      if (!EN2VI.has(ec)) EN2VI.set(ec, vc);
    }
  }

  const currentLang = () => (window.AppState && AppState.language) || localStorage.getItem('lifecare_lang') || 'vi';

  /** Dịch một chuỗi sang ngôn ngữ đích; trả lại nguyên văn nếu không có trong từ điển. */
  function translate(text, lang = currentLang()) {
    if (text == null) return text;
    const s = String(text);
    if (!/\p{L}/u.test(s)) return s;
    const map = lang === 'en' ? VI2EN : EN2VI;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    const body = norm(s);
    if (map.has(body)) return lead + map.get(body) + trail;
    const [pre, core, post] = splitCore(body);
    if (core && map.has(core)) return lead + pre + map.get(core) + post + trail;
    for (const [viRe, enOut, enRe, viOut] of PATTERNS) {
      const re = lang === 'en' ? viRe : enRe;
      const out = lang === 'en' ? enOut : viOut;
      const m = body.match(re);
      if (m) return lead + out.replace(/\$(\d)/g, (_, i) => translate(m[i], lang)) + trail;
      if (core) {
        const mc = core.match(re);
        if (mc) return lead + pre + out.replace(/\$(\d)/g, (_, i) => translate(mc[i], lang)) + post + trail;
      }
    }
    return s;
  }

  // ---------------------------------------------------------------- dịch DOM, nhớ bản gốc
  const textOrig = new WeakMap(); // text node -> { orig, written }
  const attrOrig = new WeakMap(); // element -> { [attr]: { orig, written } }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP_SELECTOR = 'script,style,textarea,[contenteditable],[data-no-translate],#aiChatMessages';
  const ATTR_SKIP_SELECTOR = '[contenteditable],[data-no-translate],#aiChatMessages';

  function translateTextNode(node, lang) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) return;
    const cur = node.nodeValue;
    let rec = textOrig.get(node);
    if (!rec || rec.written !== cur) { rec = { orig: cur, written: cur }; textOrig.set(node, rec); }
    const next = translate(rec.orig, lang);
    if (next !== cur) { rec.written = next; node.nodeValue = next; }
  }

  function translateAttrs(el, lang) {
    if (el.closest(ATTR_SKIP_SELECTOR)) return; // placeholder của ô nhập vẫn được dịch
    let recs = attrOrig.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      if (!recs) { recs = {}; attrOrig.set(el, recs); }
      let rec = recs[a];
      if (!rec || rec.written !== cur) rec = recs[a] = { orig: cur, written: cur };
      const next = translate(rec.orig, lang);
      if (next !== cur) { rec.written = next; el.setAttribute(a, next); }
    }
  }

  let applying = false;
  function translateTree(root, lang = currentLang()) {
    if (!root) return;
    applying = true;
    try {
      if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root, lang); return; }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      const start = root.nodeType === Node.DOCUMENT_NODE ? root.body : root;
      if (!start) return;
      if (start.nodeType === Node.ELEMENT_NODE) translateAttrs(start, lang);
      const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.TEXT_NODE) translateTextNode(n, lang);
        else translateAttrs(n, lang);
      }
    } finally { applying = false; }
  }

  const observer = new MutationObserver(mutations => {
    if (applying) return;
    const lang = currentLang();
    for (const m of mutations) {
      if (m.type === 'childList') m.addedNodes.forEach(n => translateTree(n, lang));
      else if (m.type === 'characterData') translateTree(m.target, lang);
      else if (m.type === 'attributes') translateAttrs(m.target, lang);
    }
  });

  function start() {
    translateTree(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Hộp thoại gốc của trình duyệt cũng đi qua từ điển
  const nativeConfirm = window.confirm.bind(window);
  const nativeAlert = window.alert.bind(window);
  window.confirm = msg => nativeConfirm(translate(msg));
  window.alert = msg => nativeAlert(translate(msg));

  window.tr = text => translate(text);
  window.I18nAuto = { translate, translateTree, refresh: () => translateTree(document.body) };
})();

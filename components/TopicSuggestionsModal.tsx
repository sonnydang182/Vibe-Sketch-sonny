import React, { useState, useMemo } from 'react';
import { Language } from '../types';

interface CategoryDef {
  id: string;
  emoji: string;
  labels: Record<Language, string>;
  topics: Record<Language, string[]>;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'psychology',
    emoji: '🧠',
    labels: {
      Vietnamese: 'Tâm lý học',
      English: 'Psychology',
      Japanese: '心理学',
    },
    topics: {
      Vietnamese: [
        'Tại sao bạn luôn trì hoãn dù biết là sai',
        'Hiệu ứng Dunning-Kruger: Càng kém càng tự tin',
        'Hội chứng kẻ giả mạo (Imposter Syndrome)',
        'Tại sao chúng ta sợ bị từ chối hơn cả thất bại',
        'Cơ chế phòng vệ tâm lý của não bộ',
        'Hiệu ứng tâm lý đám đông',
        'Ám ảnh hoàn hảo (Perfectionism) phá huỷ bạn',
        'Bí mật về não bộ khi bạn rảnh rỗi',
        'Tại sao người tử tế lại hay bị tổn thương',
        'Sức mạnh của thói quen vô thức',
      ],
      English: [
        'Why you always procrastinate even when you know better',
        'The Dunning-Kruger Effect: The less you know, the more confident',
        'Impostor Syndrome explained',
        'Why we fear rejection more than failure',
        'Your brain’s hidden defense mechanisms',
        'The psychology of crowd behavior',
        'How perfectionism is quietly ruining you',
        'What your brain does when you’re bored',
        'Why kind people get hurt the most',
        'The hidden power of unconscious habits',
      ],
      Japanese: [
        'なぜ分かっていても先延ばししてしまうのか',
        'ダニング・クルーガー効果：無知ほど自信満々',
        'インポスター症候群の正体',
        'なぜ失敗より「拒絶」を恐れるのか',
        '脳の心理的防衛メカニズム',
        '群衆心理の仕組み',
        '完璧主義があなたを壊している',
        '退屈な時に脳の中で起きていること',
        'なぜ優しい人ほど傷つくのか',
        '無意識の習慣が持つ本当の力',
      ],
    },
  },
  {
    id: 'success',
    emoji: '🏆',
    labels: {
      Vietnamese: 'Thành công & Sự nghiệp',
      English: 'Success & Career',
      Japanese: '成功とキャリア',
    },
    topics: {
      Vietnamese: [
        '90% kế hoạch của bạn bị bỏ dở vì lý do này',
        'Sự thật phũ phàng về "đam mê công việc"',
        'Tại sao người giỏi nhất không phải lúc nào cũng thắng',
        '3 thói quen âm thầm phá huỷ sự nghiệp của bạn',
        'Quy tắc 10.000 giờ có thật sự đúng?',
        'Cách phá vỡ vùng an toàn mà không sợ hãi',
        'Bí quyết của những người luôn được thăng chức',
        'Kỹ năng quan trọng nhất ở thế kỷ 21',
        'Tại sao 80% nhân viên ghét sếp của họ',
        'Networking: Đừng làm sai cách này',
      ],
      English: [
        'Why 90% of your plans never get finished',
        'The harsh truth about "follow your passion"',
        'Why the most talented don’t always win',
        '3 habits silently killing your career',
        'Is the 10,000-hour rule actually real?',
        'How to break out of your comfort zone',
        'What people who always get promoted do differently',
        'The most important skill of the 21st century',
        'Why 80% of employees hate their boss',
        'Networking: Stop doing it the wrong way',
      ],
      Japanese: [
        '計画の9割が途中で消える本当の理由',
        '「好きを仕事に」の残酷な真実',
        '才能ある人が必ず勝つわけではない理由',
        'キャリアを静かに壊す3つの習慣',
        '1万時間の法則は本当に正しいのか？',
        '怖がらずにコンフォートゾーンを抜け出す方法',
        'いつも昇進する人の秘密',
        '21世紀で最も重要なスキル',
        'なぜ社員の80%が上司を嫌うのか',
        'ネットワーキング、その間違ったやり方',
      ],
    },
  },
  {
    id: 'finance',
    emoji: '💰',
    labels: {
      Vietnamese: 'Tài chính & Tiền bạc',
      English: 'Finance & Money',
      Japanese: 'お金とファイナンス',
    },
    topics: {
      Vietnamese: [
        'Tại sao bạn mãi nghèo dù làm việc chăm chỉ',
        'Sự thật về "thu nhập thụ động" mà ai cũng giấu',
        '5 sai lầm tiền bạc tuổi 20 ai cũng mắc',
        'Tâm lý tiêu xài: Tại sao tiền cứ "bốc hơi"',
        'Lãi kép: Kỳ quan thứ 8 của thế giới',
        'Đầu tư đầu tiên — Bắt đầu từ đâu?',
        'Bẫy nợ tiêu dùng và cách thoát ra',
        'Người giàu khác người nghèo ở cách suy nghĩ này',
        'Inflation đang ăn mòn tiền của bạn ra sao',
        'Tại sao tiết kiệm không bao giờ là đủ',
      ],
      English: [
        'Why you’re still broke even though you work hard',
        'The truth about "passive income" no one talks about',
        '5 money mistakes everyone makes in their 20s',
        'Spending psychology: where does your money disappear?',
        'Compound interest: the 8th wonder of the world',
        'Your first investment — where to start?',
        'Consumer debt traps and how to escape them',
        'How rich people think differently about money',
        'How inflation is quietly eating your savings',
        'Why saving alone is never enough',
      ],
      Japanese: [
        'なぜ頑張って働いても貧乏のままなのか',
        '「不労所得」の語られない真実',
        '20代で誰もがやる5つのお金の失敗',
        'お金が消える本当の理由（消費心理）',
        '複利：世界の第8の不思議',
        '初めての投資、何から始める？',
        '消費者金融の罠と抜け出し方',
        'お金持ちと貧乏な人の思考の違い',
        'インフレが貯金を静かに削っている',
        '貯金だけでは絶対に足りない理由',
      ],
    },
  },
  {
    id: 'learning',
    emoji: '📚',
    labels: {
      Vietnamese: 'Học tập & Kỹ năng',
      English: 'Learning & Skills',
      Japanese: '学習とスキル',
    },
    topics: {
      Vietnamese: [
        'Phương pháp học của Harvard giúp giỏi hơn 80%',
        'Cách học 12 tiếng/ngày mà không kiệt sức',
        'Bí kíp ghi nhớ 90% thông tin chỉ sau 1 lần đọc',
        'Học một ngôn ngữ trong 3 tháng — Có khả thi?',
        'Feynman Technique: Cách thiên tài học',
        'Tại sao học nhiều mà vẫn không giỏi',
        'Active Recall vs Highlighting: Cái nào hiệu quả?',
        'Pomodoro: Bí quyết tập trung kinh điển',
        'Cách đọc sách nhanh gấp 3 lần bình thường',
        'Học để thi vs học để hiểu — Khác nhau ở đâu?',
      ],
      English: [
        'The Harvard study method that beats 80% of students',
        'How to study 12 hours a day without burning out',
        'Remember 90% of what you read in one pass',
        'Can you really learn a language in 3 months?',
        'The Feynman Technique: how geniuses learn',
        'Why studying more doesn’t make you smarter',
        'Active Recall vs Highlighting: which actually works?',
        'Pomodoro: the timeless focus hack',
        'Read books 3× faster (without losing comprehension)',
        'Studying for exams vs studying to understand',
      ],
      Japanese: [
        '80%を圧倒するハーバード式勉強法',
        '1日12時間勉強しても燃え尽きないコツ',
        '一度読むだけで90%を覚える方法',
        '3ヶ月で外国語をマスターできるか？',
        'ファインマン・テクニック：天才の学び方',
        'なぜ勉強しても賢くならないのか',
        'Active Recall vs ハイライト、どっちが効く？',
        'ポモドーロ：定番にして最強の集中術',
        '本を3倍速で読む技術',
        '試験のための勉強と理解のための勉強',
      ],
    },
  },
  {
    id: 'love',
    emoji: '💕',
    labels: {
      Vietnamese: 'Tình yêu & Mối quan hệ',
      English: 'Love & Relationships',
      Japanese: '愛と人間関係',
    },
    topics: {
      Vietnamese: [
        'Tại sao chúng ta yêu nhầm người sai',
        '5 dấu hiệu của một mối quan hệ độc hại',
        'Ngôn ngữ tình yêu: Bạn thuộc nhóm nào?',
        'Tâm lý của người luôn sợ bị bỏ rơi',
        'Vì sao càng cố gắng càng bị từ chối',
        'Sự thật về tình yêu sau 3 năm',
        'Tại sao đàn ông im lặng khi cãi nhau',
        'Phụ nữ thật sự muốn gì trong tình yêu',
        'Cách vượt qua chia tay trong 30 ngày',
        'Yêu bản thân — Bí quyết của hạnh phúc',
      ],
      English: [
        'Why we keep falling for the wrong person',
        '5 signs you’re in a toxic relationship',
        'The 5 love languages — which one are you?',
        'The psychology of fear of abandonment',
        'Why trying harder makes them pull away',
        'The truth about love after 3 years',
        'Why men go silent during arguments',
        'What women actually want in a relationship',
        'How to get over a breakup in 30 days',
        'Self-love: the real secret to happiness',
      ],
      Japanese: [
        'なぜ私たちは間違った相手に惹かれるのか',
        '毒のある関係の5つのサイン',
        '愛の5つの言語、あなたはどのタイプ？',
        '見捨てられ不安の心理',
        '頑張るほど嫌われる理由',
        '付き合って3年後の愛のリアル',
        '喧嘩で男が黙る本当の理由',
        '女性が恋愛で本当に求めているもの',
        '30日で失恋を乗り越える方法',
        '自分を愛することが幸せの始まり',
      ],
    },
  },
  {
    id: 'health',
    emoji: '💪',
    labels: {
      Vietnamese: 'Sức khỏe & Sống khỏe',
      English: 'Health & Wellness',
      Japanese: '健康とウェルネス',
    },
    topics: {
      Vietnamese: [
        'Tại sao bạn ngủ 8 tiếng mà vẫn mệt',
        'Sự thật về detox: 90% là lừa đảo',
        'Caffeine ảnh hưởng đến não bộ ra sao',
        '5 thói quen ăn sáng đang phá huỷ bạn',
        'Tại sao stress làm bạn béo bụng',
        'Walking 10.000 bước/ngày: Có đúng không?',
        'Đường — Kẻ giết người thầm lặng',
        'Cách thức dậy sớm mà không cần báo thức',
        'Não bộ thay đổi thế nào khi tập gym',
        'Intermittent Fasting: Phép màu hay rủi ro?',
      ],
      English: [
        'Why you’re still tired after sleeping 8 hours',
        'The detox industry is 90% lies',
        'How caffeine actually rewires your brain',
        '5 breakfast habits that are wrecking you',
        'Why stress gives you belly fat',
        'Is the 10,000 steps a day rule real?',
        'Sugar — the silent killer in your kitchen',
        'How to wake up early without an alarm',
        'How your brain changes when you start lifting',
        'Intermittent fasting: miracle or risk?',
      ],
      Japanese: [
        '8時間寝ても疲れが取れない理由',
        'デトックスの9割は嘘',
        'カフェインが脳を変える仕組み',
        'あなたを壊している朝食の5つの習慣',
        'なぜストレスでお腹が出るのか',
        '1日1万歩は本当に正しい？',
        '砂糖、台所の静かな殺し屋',
        '目覚まし無しで早起きする方法',
        '筋トレで脳はこう変わる',
        '間欠的断食：奇跡かリスクか',
      ],
    },
  },
  {
    id: 'philosophy',
    emoji: '🦉',
    labels: {
      Vietnamese: 'Triết học sống',
      English: 'Philosophy of Life',
      Japanese: '人生哲学',
    },
    topics: {
      Vietnamese: [
        'Stoicism: Cách người La Mã đối mặt với khổ đau',
        'Ý nghĩa cuộc sống — Câu hỏi không có đáp án?',
        'Memento Mori: Hãy sống như sắp chết',
        'Tự do thực sự là gì?',
        'Tại sao chúng ta sợ cô đơn',
        'Hạnh phúc — Đích đến hay hành trình?',
        'Nghịch lý của lựa chọn quá nhiều',
        'Khắc kỷ vs Hưởng thụ: Triết lý nào đúng?',
        '"Biết mình" — Câu nói cổ xưa nhất',
        'Tại sao chúng ta cần đau khổ để trưởng thành',
      ],
      English: [
        'Stoicism: how Romans dealt with suffering',
        'The meaning of life — a question with no answer?',
        'Memento Mori: live like you’re about to die',
        'What does true freedom actually mean?',
        'Why we are so afraid of being alone',
        'Happiness: destination or journey?',
        'The paradox of having too many choices',
        'Stoicism vs Hedonism: which one is right?',
        '"Know thyself" — the oldest piece of advice',
        'Why suffering is necessary to grow',
      ],
      Japanese: [
        'ストア哲学：ローマ人の苦しみへの向き合い方',
        '人生の意味、答えのない問い？',
        'メメント・モリ：いつか死ぬように生きろ',
        '本当の自由とは何か',
        'なぜ私たちは孤独を恐れるのか',
        '幸せはゴールか、旅か',
        '選択肢が多すぎることの逆説',
        'ストイック vs 快楽主義、どちらが正しい？',
        '「汝自身を知れ」最古のアドバイス',
        '成長に苦しみが必要な理由',
      ],
    },
  },
  {
    id: 'history',
    emoji: '📜',
    labels: {
      Vietnamese: 'Lịch sử & Bí ẩn',
      English: 'History & Mysteries',
      Japanese: '歴史と謎',
    },
    topics: {
      Vietnamese: [
        'Đế chế La Mã sụp đổ vì lý do bạn không ngờ',
        'Genghis Khan — Tên đồ tể hay nhà lãnh đạo thiên tài?',
        'Bí ẩn của Kim tự tháp Ai Cập',
        'Vì sao Napoleon cao hơn bạn nghĩ',
        'Sự kiện lịch sử thay đổi cả nhân loại',
        'Atlantis có thật hay chỉ là huyền thoại?',
        'Chiến tranh lạnh: Cuộc đấu trí của thế kỷ',
        'Vì sao Trung Quốc xây Vạn Lý Trường Thành',
        'Người Vikings — Sự thật bị bóp méo',
        'Cuộc cách mạng công nghiệp đã thay đổi gì',
      ],
      English: [
        'The surprising reason the Roman Empire fell',
        'Genghis Khan — butcher or genius leader?',
        'The mysteries of the Egyptian Pyramids',
        'Napoleon was taller than you think',
        'Historical events that changed humanity forever',
        'Was Atlantis real or just a myth?',
        'The Cold War: the battle of minds of the century',
        'Why China actually built the Great Wall',
        'The Vikings — the truth has been distorted',
        'How the Industrial Revolution changed everything',
      ],
      Japanese: [
        'ローマ帝国が滅んだ意外な理由',
        'チンギス・ハン：虐殺者か天才指導者か',
        'エジプト・ピラミッドの謎',
        'ナポレオンは思ったより背が高い',
        '人類を変えた歴史的事件',
        'アトランティスは実在したのか',
        '冷戦：世紀の頭脳戦',
        '中国が万里の長城を築いた本当の理由',
        'バイキング、その歪められた真実',
        '産業革命が変えた世界',
      ],
    },
  },
  {
    id: 'science',
    emoji: '🔬',
    labels: {
      Vietnamese: 'Khoa học vui',
      English: 'Fun Science',
      Japanese: 'おもしろ科学',
    },
    topics: {
      Vietnamese: [
        'Vũ trụ thật sự lớn cỡ nào — Bạn không tưởng tượng nổi',
        'Hố đen — Nơi vật lý "ngừng hoạt động"',
        'Tại sao bầu trời màu xanh mà hoàng hôn lại đỏ?',
        'Cơ thể bạn chết và sống lại mỗi 7 năm',
        'Lý thuyết tương đối — Giải thích siêu đơn giản',
        'Tại sao thời gian chậm lại khi bạn sợ hãi',
        'Đa vũ trụ — Bạn có "bản sao" ở vũ trụ khác?',
        'AI có thể có ý thức không?',
        'Lượng tử rối — Spooky action at a distance',
        'Bí ẩn về nguồn gốc sự sống trên Trái Đất',
      ],
      English: [
        'How big the universe really is — you can’t imagine it',
        'Black holes: where physics stops working',
        'Why is the sky blue but sunsets are red?',
        'Your body dies and is reborn every 7 years',
        'Relativity, explained super simply',
        'Why time slows down when you’re scared',
        'The multiverse — is there another you?',
        'Can AI ever become conscious?',
        'Quantum entanglement: spooky action at a distance',
        'The mystery of how life began on Earth',
      ],
      Japanese: [
        '宇宙はどれほど広いのか、想像を超える',
        'ブラックホール：物理が止まる場所',
        'なぜ空は青く、夕日は赤いのか',
        '身体は7年ごとに死んで生まれ変わる',
        '相対性理論を超わかりやすく',
        '怖い時に時間が遅くなる理由',
        'マルチバース：別の宇宙の自分',
        'AIは意識を持てるのか？',
        '量子もつれ：不気味な遠隔作用',
        '地球の生命誕生の謎',
      ],
    },
  },
  {
    id: 'tech',
    emoji: '🤖',
    labels: {
      Vietnamese: 'Công nghệ & AI',
      English: 'Tech & AI',
      Japanese: 'テクノロジーとAI',
    },
    topics: {
      Vietnamese: [
        'AI sẽ thay thế nghề của bạn trong 5 năm tới?',
        'ChatGPT thông minh hơn bạn nghĩ',
        'Big Tech đang theo dõi bạn ra sao',
        'Crypto — Tương lai hay bong bóng?',
        'Mạng xã hội đang phá huỷ não bộ Gen Z',
        'Tại sao iPhone đắt mà ai cũng mua',
        'Deepfake — Khi sự thật không còn là sự thật',
        'Khởi nghiệp công nghệ với 0 đồng',
        'Chiến tranh chip — Cuộc đua thế kỷ 21',
        'Smart Home — Tiện nghi hay nguy hiểm?',
      ],
      English: [
        'Will AI replace your job in the next 5 years?',
        'ChatGPT is smarter than you think',
        'How Big Tech is silently watching you',
        'Crypto — the future or a bubble?',
        'How social media is breaking Gen Z brains',
        'Why iPhones are expensive yet everyone buys them',
        'Deepfakes: when truth is no longer truth',
        'Launching a tech startup with $0',
        'The chip wars — the race of the 21st century',
        'Smart home: convenience or danger?',
      ],
      Japanese: [
        'AIは5年以内にあなたの仕事を奪うか',
        'ChatGPTはあなたが思うより賢い',
        'ビッグテックはこうしてあなたを監視している',
        '仮想通貨は未来かバブルか',
        'SNSがZ世代の脳を壊している',
        '高いのに皆iPhoneを買う理由',
        'ディープフェイク：真実が真実でなくなる時代',
        '0円でテック・スタートアップを始める',
        'チップ戦争：21世紀の覇権争い',
        'スマートホーム：便利か危険か',
      ],
    },
  },
  {
    id: 'productivity',
    emoji: '⏰',
    labels: {
      Vietnamese: 'Năng suất & Thói quen',
      English: 'Productivity & Habits',
      Japanese: '生産性と習慣',
    },
    topics: {
      Vietnamese: [
        'Atomic Habits: Thay đổi 1% mỗi ngày',
        'Tại sao bạn có nhiều mục tiêu nhưng không đạt được',
        'Quy tắc 2 phút — Mẹo chống trì hoãn cực hay',
        'Deep Work — Bí quyết của những bộ óc hàng đầu',
        'Cách lên kế hoạch một tuần như CEO',
        'Buổi sáng "vàng" — 5 thói quen của tỷ phú',
        'Multitasking — Lừa dối lớn nhất của thời đại',
        'Sức mạnh của việc viết nhật ký mỗi ngày',
        'Tại sao điện thoại đang phá huỷ năng suất',
        'Time Blocking — Phương pháp quản lý thời gian tối ưu',
      ],
      English: [
        'Atomic Habits: get 1% better every day',
        'Why you have so many goals but hit none',
        'The 2-minute rule: a tiny anti-procrastination hack',
        'Deep Work: the secret of top performers',
        'Plan your week like a CEO',
        'The golden morning: 5 billionaire habits',
        'Multitasking is the biggest lie of our time',
        'The power of writing a daily journal',
        'How your phone is killing your productivity',
        'Time blocking: the ultimate time management method',
      ],
      Japanese: [
        'アトミック・ハビット：毎日1%の改善',
        '目標は多いのに何も達成できない理由',
        '2分ルール：先延ばしを潰す小ワザ',
        'ディープワーク：一流の秘密',
        'CEOのように1週間を計画する',
        '黄金の朝：億万長者の5つの習慣',
        'マルチタスクは現代最大の嘘',
        '毎日日記を書くことの威力',
        'スマホがあなたの生産性を殺している',
        'タイムブロッキング：究極の時間管理術',
      ],
    },
  },
  {
    id: 'entrepreneur',
    emoji: '🚀',
    labels: {
      Vietnamese: 'Doanh nhân & Khởi nghiệp',
      English: 'Entrepreneurship',
      Japanese: '起業と経営',
    },
    topics: {
      Vietnamese: [
        'Vì sao 90% startup thất bại',
        'Bài học từ Steve Jobs ai cũng phải biết',
        'Khởi nghiệp với 0 đồng — Có thể không?',
        'Mindset của triệu phú khác bạn ra sao',
        '3 sai lầm chết người khi mở công ty',
        'Pitching — Cách thuyết phục nhà đầu tư',
        'Side hustle — Làm thêm hay kiệt sức?',
        'Vì sao Elon Musk làm việc 100 giờ/tuần',
        'Bài học từ những thương vụ thất bại nổi tiếng',
        'Personal Brand — Tài sản lớn nhất của bạn',
      ],
      English: [
        'Why 90% of startups fail',
        'Lessons from Steve Jobs everyone should know',
        'Can you really start a business with $0?',
        'How a millionaire’s mindset differs from yours',
        '3 deadly mistakes when starting a company',
        'Pitching: how to actually convince investors',
        'Side hustles: extra income or burnout trap?',
        'Why Elon Musk works 100 hours a week',
        'Lessons from famous failed deals',
        'Personal brand — your biggest asset',
      ],
      Japanese: [
        'スタートアップの9割が失敗する理由',
        'スティーブ・ジョブズから学ぶべき教訓',
        '0円で起業は本当に可能か',
        '億万長者のマインドセットの違い',
        '会社を立ち上げる時の致命的な3つの失敗',
        'ピッチで投資家を本当に動かす方法',
        '副業：収入源か燃え尽きの罠か',
        'イーロン・マスクが週100時間働く理由',
        '有名な失敗ディールから学ぶ',
        'パーソナルブランドこそ最大の資産',
      ],
    },
  },
  {
    id: 'culture',
    emoji: '🌏',
    labels: {
      Vietnamese: 'Văn hoá & Xã hội',
      English: 'Culture & Society',
      Japanese: '文化と社会',
    },
    topics: {
      Vietnamese: [
        'Tại sao Gen Z khác biệt đến vậy',
        'Áp lực đồng trang lứa — Kẻ thù vô hình',
        'Văn hoá hustle — Tốt hay độc hại?',
        'Mạng xã hội đang định hình quan điểm bạn ra sao',
        'Vì sao người Việt thích mì gói',
        'Toàn cầu hoá — Mất hay được?',
        'Sự cô đơn của thế hệ kết nối nhất',
        'Vì sao K-pop chinh phục thế giới',
        'Cancel Culture — Công lý hay bắt nạt?',
        'Sự khác biệt văn hoá Đông — Tây',
      ],
      English: [
        'Why Gen Z is so different',
        'Peer pressure: the invisible enemy',
        'Hustle culture: motivating or toxic?',
        'How social media shapes what you believe',
        'Why people are obsessed with instant noodles',
        'Globalization: who actually wins and loses?',
        'The loneliness of the most-connected generation',
        'Why K-pop conquered the world',
        'Cancel culture: justice or mob bullying?',
        'East vs West: the real cultural divide',
      ],
      Japanese: [
        'Z世代がここまで違う理由',
        '同調圧力という見えない敵',
        'ハッスル文化：刺激か毒か',
        'SNSがあなたの考え方を形作っている',
        'インスタント麺がここまで愛される理由',
        'グローバリゼーション：勝者と敗者',
        '最も繋がった世代の孤独',
        'K-POPが世界を制した理由',
        'キャンセルカルチャー：正義か集団リンチか',
        '東洋と西洋、本当の文化の違い',
      ],
    },
  },
  {
    id: 'stoic',
    emoji: '🗿',
    labels: {
      Vietnamese: 'Stoic & Phát triển bản thân',
      English: 'Stoicism & Self-Improvement',
      Japanese: 'ストイック & 自己成長',
    },
    topics: {
      Vietnamese: [
        'Tôi sẽ làm nó vào ngày mai — Bệnh nan y',
        'Cách giữ bình tĩnh khi mọi thứ sụp đổ',
        'Tự kỷ luật — Vũ khí mạnh nhất của bạn',
        'Ngừng so sánh — Cách yêu chính mình',
        'Một mình không có nghĩa là cô đơn',
        'Đối mặt với nỗi sợ — Bí kíp Stoic',
        'Im lặng là sức mạnh — Tại sao?',
        'Buông bỏ những điều bạn không kiểm soát được',
        '5 thói quen của người trưởng thành thật sự',
        'Tại sao nói ít làm nhiều luôn thắng',
      ],
      English: [
        '"I’ll do it tomorrow" — the incurable disease',
        'How to stay calm when everything falls apart',
        'Self-discipline: your strongest weapon',
        'Stop comparing — start loving yourself',
        'Being alone is not the same as being lonely',
        'How Stoics actually face their fears',
        'Why silence is a real superpower',
        'Letting go of what you cannot control',
        '5 habits of truly mature people',
        'Why "talk less, do more" always wins',
      ],
      Japanese: [
        '「明日やる」という不治の病',
        'すべて崩れた時に冷静を保つ方法',
        '自己規律：あなた最強の武器',
        '比較をやめて自分を愛する',
        '一人でいることと孤独は違う',
        'ストイック流、恐怖との向き合い方',
        '沈黙こそ本当の強さ',
        'コントロールできないことを手放す',
        '本当に大人な人の5つの習慣',
        '「黙って動く」が常に勝つ理由',
      ],
    },
  },
  {
    id: 'humor',
    emoji: '😂',
    labels: {
      Vietnamese: 'Hài hước & Trào phúng',
      English: 'Humor & Satire',
      Japanese: 'ユーモアと風刺',
    },
    topics: {
      Vietnamese: [
        'Một ngày làm việc của bạn vs sếp của bạn',
        'Khi mẹ gọi tên đầy đủ — Đời sang trang mới',
        'Nỗi đau khi điện thoại hết pin 1%',
        'Sự khác biệt giữa kế hoạch và thực tế',
        'Khi Wi-Fi sập 5 phút — Khủng hoảng nhân loại',
        '7 kiểu đồng nghiệp ai cũng từng gặp',
        'Vì sao bạn luôn quên chìa khoá',
        'Đi siêu thị 1 món nhưng về với 30 món',
        'Khi deadline đến gần — Bạn vs bạn của giờ trước',
        'Sự thật về việc "ngày mai mình sẽ dậy sớm"',
      ],
      English: [
        'A day in your life vs a day in your boss’s life',
        'When mom uses your full name — life is over',
        'The pain of seeing 1% battery left',
        'Plan vs reality: a tragic comedy',
        'When Wi-Fi dies for 5 minutes — pure chaos',
        '7 coworker archetypes everyone has met',
        'Why do you always lose your keys?',
        'Going to the store for 1 thing, leaving with 30',
        'You vs you-an-hour-ago when deadline hits',
        'The truth about "I’ll wake up early tomorrow"',
      ],
      Japanese: [
        'あなたの1日 vs 上司の1日',
        '母親にフルネームで呼ばれた瞬間、人生終了',
        'バッテリー残り1%という地獄',
        '計画 vs 現実、悲喜劇',
        'Wi-Fiが5分落ちた時の人類の混乱',
        '誰もが出会う7種類の同僚',
        'なぜいつも鍵を失くすのか',
        '1個買いに行って30個持ち帰る',
        '締切前のあなた vs 1時間前のあなた',
        '「明日こそ早起きする」の真実',
      ],
    },
  },
];

const UI: Record<Language, { title: string; subtitle: string; close: string }> = {
  Vietnamese: { title: 'Gợi ý chủ đề', subtitle: 'Chọn một chủ đề để dùng làm topic.', close: 'Đóng' },
  English: { title: 'Topic Suggestions', subtitle: 'Pick a topic to use as your video idea.', close: 'Close' },
  Japanese: { title: 'トピック候補', subtitle: '動画のテーマとして一つ選んでください。', close: '閉じる' },
};

interface Props {
  open: boolean;
  language: Language;
  onClose: () => void;
  onPick: (topic: string) => void;
}

export const TopicSuggestionsModal: React.FC<Props> = ({ open, language, onClose, onPick }) => {
  const [activeId, setActiveId] = useState<string>(CATEGORIES[0].id);

  const ui = UI[language];
  const active = useMemo(
    () => CATEGORIES.find(c => c.id === activeId) || CATEGORIES[0],
    [activeId]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-paper paper-texture rounded-2xl border-2 border-ink shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-ink/10 bg-white/40">
          <div>
            <h3 className="font-hand text-3xl font-bold text-ink">{ui.title}</h3>
            <p className="font-sans text-sm text-gray-600">{ui.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors"
            aria-label={ui.close}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: 2 columns */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
          {/* Categories */}
          <aside className="border-r-2 border-ink/10 overflow-y-auto bg-white/30">
            <ul className="p-2 space-y-1">
              {CATEGORIES.map(cat => (
                <li key={cat.id}>
                  <button
                    onClick={() => setActiveId(cat.id)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg font-hand text-lg transition-colors ${
                      activeId === cat.id
                        ? 'bg-ink text-paper'
                        : 'text-ink hover:bg-black/5'
                    }`}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="leading-tight">{cat.labels[language]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Topics */}
          <section className="overflow-y-auto p-5">
            <h4 className="font-hand text-2xl text-ink mb-3 flex items-center gap-2">
              <span>{active.emoji}</span>
              {active.labels[language]}
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {active.topics[language].map((t, i) => (
                <li key={i}>
                  <button
                    onClick={() => { onPick(t); onClose(); }}
                    className="w-full text-left bg-white/70 hover:bg-white border-2 border-ink/10 hover:border-ink/40 rounded-lg p-3 font-sans text-sm text-ink transition-all hover:shadow-sm"
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

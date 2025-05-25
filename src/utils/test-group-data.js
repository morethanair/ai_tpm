/**
 * 그룹 분석 테스트를 위한 샘플 데이터
 */

const sampleGroupMessages = {
  // Q&A 패턴 그룹
  qaGroup: [
    {
      ts: '1703123400.000100',
      user: 'U123456',
      text: 'React에서 useEffect의 dependency array에 빈 배열을 넣으면 어떻게 되나요?',
      channel: 'C1234567890'
    },
    {
      ts: '1703123460.000200',
      user: 'U234567',
      text: '빈 배열을 넣으면 컴포넌트가 마운트될 때 한 번만 실행됩니다. componentDidMount와 비슷한 동작이에요.',
      channel: 'C1234567890'
    },
    {
      ts: '1703123520.000300',
      user: 'U123456',
      text: '아 그렇군요! 그럼 dependency array를 아예 안 넣으면 어떻게 되나요?',
      channel: 'C1234567890'
    },
    {
      ts: '1703123580.000400',
      user: 'U234567',
      text: 'dependency array를 안 넣으면 매 렌더링마다 실행됩니다. 성능상 좋지 않아요.',
      channel: 'C1234567890'
    }
  ],

  // 의사결정 완료 그룹
  decisionMadeGroup: [
    {
      ts: '1703124000.000100',
      user: 'U345678',
      text: '새 프로젝트의 데이터베이스로 PostgreSQL과 MongoDB 중 어떤 걸 쓸까요?',
      channel: 'C1234567890'
    },
    {
      ts: '1703124060.000200',
      user: 'U456789',
      text: 'PostgreSQL이 좋을 것 같습니다. 관계형 데이터가 많고 ACID 보장이 중요해요.',
      channel: 'C1234567890'
    },
    {
      ts: '1703124120.000300',
      user: 'U567890',
      text: '동의합니다. 팀 경험도 PostgreSQL이 더 많고요.',
      channel: 'C1234567890'
    },
    {
      ts: '1703124180.000400',
      user: 'U345678',
      text: '좋습니다. 그럼 PostgreSQL로 결정하겠습니다. 다음 주부터 환경 설정 시작하죠.',
      channel: 'C1234567890'
    }
  ],

  // 의사결정 필요 그룹
  decisionNeededGroup: [
    {
      ts: '1703124600.000100',
      user: 'U678901',
      text: '배포 환경을 AWS로 할지 GCP로 할지 정해야 합니다.',
      channel: 'C1234567890'
    },
    {
      ts: '1703124660.000200',
      user: 'U789012',
      text: '비용 측면에서 비교 분석이 필요할 것 같은데요.',
      channel: 'C1234567890'
    },
    {
      ts: '1703124720.000300',
      user: 'U890123',
      text: '기술적으로는 둘 다 괜찮을 것 같습니다. 팀장님 의견이 필요해요.',
      channel: 'C1234567890'
    },
    {
      ts: '1703124780.000400',
      user: 'U678901',
      text: '네, 빠른 결정이 필요합니다. 다음 주 월요일까지 정해야 해요.',
      channel: 'C1234567890'
    }
  ],

  // 5분 이상 간격으로 분리되는 그룹들
  separatedGroups: [
    // 그룹 1 (10:00-10:02)
    [
      {
        ts: '1703125200.000100', // 10:00:00
        user: 'U111111',
        text: '오늘 스프린트 리뷰 준비는 어떻게 되고 있나요?',
        channel: 'C1234567890'
      },
      {
        ts: '1703125260.000200', // 10:01:00
        user: 'U222222',
        text: '거의 다 준비됐습니다. 데모 환경만 확인하면 될 것 같아요.',
        channel: 'C1234567890'
      }
    ],
    // 그룹 2 (10:08-10:10) - 6분 후
    [
      {
        ts: '1703125680.000300', // 10:08:00
        user: 'U333333',
        text: '점심 메뉴 추천 받습니다!',
        channel: 'C1234567890'
      },
      {
        ts: '1703125740.000400', // 10:09:00
        user: 'U444444',
        text: '근처 파스타집 어떠세요?',
        channel: 'C1234567890'
      },
      {
        ts: '1703125800.000500', // 10:10:00
        user: 'U555555',
        text: '좋네요! 같이 가실 분?',
        channel: 'C1234567890'
      }
    ]
  ]
};

/**
 * 테스트용 메시지에 사용자명 추가
 */
function addUserNamesToMessages(messages) {
  const userNames = {
    'U123456': 'Alice',
    'U234567': 'Bob',
    'U345678': 'Charlie',
    'U456789': 'David',
    'U567890': 'Eve',
    'U678901': 'Frank',
    'U789012': 'Grace',
    'U890123': 'Henry',
    'U111111': 'Ivy',
    'U222222': 'Jack',
    'U333333': 'Kate',
    'U444444': 'Liam',
    'U555555': 'Mia'
  };

  return messages.map(msg => ({
    ...msg,
    userName: userNames[msg.user] || msg.user
  }));
}

/**
 * 그룹 분석 테스트 실행
 */
async function testGroupAnalysis(aiService, slackService) {
  console.log('🧪 그룹 분석 테스트 시작...\n');

  const testCases = [
    { name: 'Q&A 그룹', messages: sampleGroupMessages.qaGroup },
    { name: '의사결정 완료 그룹', messages: sampleGroupMessages.decisionMadeGroup },
    { name: '의사결정 필요 그룹', messages: sampleGroupMessages.decisionNeededGroup }
  ];

  for (const testCase of testCases) {
    console.log(`📝 ${testCase.name} 테스트 중...`);
    
    try {
      const messagesWithNames = addUserNamesToMessages(testCase.messages);
      const analysis = await aiService.analyzeMessageGroup(messagesWithNames);
      
      console.log(`✅ ${testCase.name} 분석 완료:`);
      console.log(`   타입: ${analysis.analysisType}`);
      console.log(`   요약: ${analysis.summary}`);
      console.log(`   Q&A 수: ${analysis.qna?.length || 0}`);
      console.log(`   결정 사항: ${analysis.decisions?.length || 0}`);
      console.log(`   대기 결정: ${analysis.pendingDecisions?.length || 0}`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ ${testCase.name} 테스트 실패:`, error.message);
    }
  }
}

module.exports = {
  sampleGroupMessages,
  addUserNamesToMessages,
  testGroupAnalysis
}; 
const { App, LogLevel } = require('@slack/bolt');
const config = require('./config/config');
const logger = require('./utils/logger');
const threadAnalyzer = require('./controllers/threadAnalyzer.controller');
const fs = require('fs');
const path = require('path');

// logs 디렉토리가 없으면 생성
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Slack 앱 초기화
const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  appToken: config.slack.appToken,
  socketMode: true,
  logLevel: LogLevel.DEBUG
});

// 앱이 시작될 때 로그
logger.info('Slack Thread Analyzer 앱 시작 중...');

// 소켓 연결 이벤트 리스너
app.client.on('connecting', () => {
  logger.info('슬랙 서버에 연결 시도 중...');
});

app.client.on('connected', () => {
  logger.info('슬랙 서버에 성공적으로 연결되었습니다!');
});

app.client.on('disconnected', () => {
  logger.warn('슬랙 서버와의 연결이 끊어졌습니다.');
});

// 모든 이벤트를 로깅하는 미들웨어 추가
app.use(async ({ payload, next }) => {
  logger.info(`이벤트 수신: ${payload.type || 'unknown'}`);
  if (payload.type === 'message') {
    logger.info(`메시지 이벤트: ${JSON.stringify({
      channel: payload.channel,
      thread_ts: payload.thread_ts,
      text: payload.text?.substring(0, 20) + (payload.text?.length > 20 ? '...' : ''),
      user: payload.user,
    })}`);
  }
  await next();
});

// 메시지 이벤트 리스너 설정
app.event('message', async ({ event, client }) => {
  try {
    logger.info(`메시지 이벤트 수신: 채널=${event.channel}, thread_ts=${event.thread_ts || 'none'}`);
    await threadAnalyzer.handleMessageEvent(event);
  } catch (error) {
    logger.error('메시지 이벤트 처리 중 오류 발생:', error);
  }
});

// 스레드 답글 이벤트 리스너 설정
app.event('message_replied', async ({ event, client }) => {
  try {
    logger.info(`스레드 답글 이벤트 수신: 채널=${event.channel}, thread_ts=${event.thread_ts || 'none'}`);
    // message_replied 이벤트는 message 객체를 포함
    if (event.message) {
      await threadAnalyzer.handleMessageEvent(event.message);
    }
  } catch (error) {
    logger.error('스레드 답글 이벤트 처리 중 오류 발생:', error);
  }
});

// 슬래시 명령 설정 - 스레드를 수동으로 분석
app.command('/analyze-thread', async ({ command, ack, respond }) => {
  logger.info(`슬래시 명령 수신: ${command.command}`);
  await threadAnalyzer.handleManualAnalysisCommand(command, ack, respond);
});

// 앱 멘션 이벤트 리스너 - 봇이 멘션되었을 때 도움말 메시지 제공
app.event('app_mention', async ({ event, say }) => {
  try {
    logger.info(`앱 멘션 이벤트 수신: 채널=${event.channel}, 사용자=${event.user}`);
    await say({
      text: `안녕하세요! 저는 Slack Thread Analyzer입니다. 다음 기능을 제공합니다:

• *자동 분석*: 스레드에 ${config.threadAnalysis.minReplies}개 이상의 답글이 달리면 자동으로 분석합니다.
• *수동 분석*: 스레드에서 \`/analyze-thread\` 명령을 사용하여 수동으로 분석을 요청할 수 있습니다.

분석이 완료되면 요약과 주요 포인트를 제공합니다.`
    });
  } catch (error) {
    logger.error('앱 멘션 처리 중 오류 발생:', error);
  }
});

// 기본 메시지 핸들러 추가 (테스트용)
app.message('.*', async ({ message, say }) => {
  // 메시지의 모든 정보를 상세히 로깅
  const messageDetails = {
    type: message.type,
    channel: message.channel,
    user: message.user,
    text: message.text,
    ts: message.ts,
    thread_ts: message.thread_ts,
    subtype: message.subtype,
    team: message.team,
    blocks: message.blocks ? '있음' : '없음',
    attachments: message.attachments ? message.attachments.length : 0,
    time: new Date(Number(message.ts) * 1000).toLocaleString('ko-KR')
  };

  // 사용자 정보 조회 (가능한 경우)
  try {
    const userInfo = await app.client.users.info({ user: message.user });
    if (userInfo.ok) {
      messageDetails.userName = userInfo.user.profile.display_name || userInfo.user.profile.real_name || message.user;
      messageDetails.isBot = userInfo.user.is_bot;
    }
  } catch (error) {
    logger.warn(`사용자 정보 조회 실패: ${message.user}`);
  }

  // 채널 정보 조회 (가능한 경우)
  try {
    const channelInfo = await app.client.conversations.info({ channel: message.channel });
    if (channelInfo.ok) {
      messageDetails.channelName = channelInfo.channel.name;
      messageDetails.isPrivate = channelInfo.channel.is_private;
    }
  } catch (error) {
    logger.warn(`채널 정보 조회 실패: ${message.channel}`);
  }

  logger.info('📬 메시지 수신: ' + JSON.stringify(messageDetails, null, 2));
  
  // 이미 다른 핸들러가 처리하므로 응답은 생략
});

// 앱 시작
(async () => {
  try {
    const port = config.app.port;
    await app.start(port);
    logger.info(`⚡️ Slack Thread Analyzer가 포트 ${port}에서 실행 중입니다!`);
    
    // 시작 시 설정 정보 로깅
    logger.info(`앱 설정 정보: 
    - Socket Mode: ${app.socketMode ? '활성화' : '비활성화'}
    - 최소 스레드 답글 수: ${config.threadAnalysis.minReplies}
    - 등록된 이벤트: message, message_replied, app_mention
    - 환경: ${config.app.environment}`);
  } catch (error) {
    logger.error('앱 시작 중 오류 발생:', error);
    process.exit(1);
  }
})(); 
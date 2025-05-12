const slackService = require('../services/slack.service');
const aiService = require('../services/openai.service');
const notionService = require('../services/notion.service');
const logger = require('../utils/logger');
const config = require('../config/config');

class ThreadAnalyzerController {
  constructor() {
    this.analyzedThreads = new Set(); // 이미 분석한 스레드를 추적
    this.threadLastMessageMap = {};   // 스레드별 마지막 메시지 시간
    this.analysisTimeouts = {};       // 스레드별 분석 예약 타이머
  }

  /**
   * 슬랙 이벤트를 처리하고 필요한 경우 스레드 분석을 시작합니다
   * @param {Object} event - Slack 이벤트 객체
   */
  async handleMessageEvent(event) {
    try {
      // 봇 메시지나 자체 메시지 무시
      if (event.bot_id || event.subtype === 'bot_message') {
        return;
      }

      // 스레드 응답이 아닌 메시지는 무시
      if (!event.thread_ts) {
        return;
      }

      const threadKey = `${event.channel}-${event.thread_ts}`;
      const now = Date.now();
      // 마지막 메시지 시간 갱신
      this.threadLastMessageMap[threadKey] = now;

      // 기존 예약이 있으면 취소
      if (this.analysisTimeouts[threadKey]) {
        clearTimeout(this.analysisTimeouts[threadKey]);
      }

      // 스레드가 논쟁 상황인지 확인 (N개 이상의 답글이 있는지)
      const isDebate = await slackService.isDebateThread(event);
      
      // 추가: 답글 수를 직접 확인하고 로그에 기록
      const replies = await slackService.getThreadReplies(event.channel, event.thread_ts);
      const replyCount = replies.length - 1; // 첫 메시지를 제외한 답글 수
      const minReplies = config.threadAnalysis.minReplies;
      
      logger.info(`스레드 ${threadKey}의 현재 답글 수: ${replyCount}개 (분석 기준: ${minReplies}개 이상)`);
      
      if (replyCount >= minReplies) {
        logger.info(`🔍 스레드 ${threadKey}에 답글이 ${replyCount}개로 분석 기준(${minReplies}개)을 충족했습니다!`);
      }
      
      if (!isDebate) {
        logger.info(`스레드 ${threadKey}는 분석 조건을 충족하지 않습니다.`);
        return;
      }

      // 이미 분석한 스레드는 무시
      if (this.analyzedThreads.has(threadKey)) {
        logger.info(`스레드 ${threadKey}는 이미 분석되었습니다.`);
        return;
      }

      // 대기 시간 확인 (분 단위)
      const waitMinutes = config.threadAnalysis.waitMinutes || 30;
      const waitMs = waitMinutes * 60 * 1000;
      
      // 대기 시간이 0이면 즉시 분석, 아니면 설정된 시간 후 분석
      if (waitMinutes <= 0) {
        logger.info(`스레드 ${threadKey} 즉시 분석 시작 (대기 시간: ${waitMinutes}분)`);
        await this.analyzeThread(event.channel, event.thread_ts);
        this.analyzedThreads.add(threadKey);
      } else {
        logger.info(`스레드 ${threadKey} 분석 예약됨 - ${waitMinutes}분 후 실행`);
        
        // 설정된 시간 후 분석 예약
        this.analysisTimeouts[threadKey] = setTimeout(async () => {
          // 분석 실행 직전에 다시 한번 조건 확인
          const latestReplies = await slackService.getThreadReplies(event.channel, event.thread_ts);
          const latestReplyCount = latestReplies.length - 1;
          
          logger.info(`예약된 분석 실행 전 스레드 ${threadKey}의 최종 답글 수: ${latestReplyCount}개`);
          
          if (latestReplyCount >= minReplies && !this.analyzedThreads.has(threadKey)) {
            // 분석 실행
            await this.analyzeThread(event.channel, event.thread_ts);
            this.analyzedThreads.add(threadKey);
          } else {
            logger.info(`스레드 ${threadKey}는 분석 시점에 조건을 충족하지 않거나 이미 분석되었습니다.`);
          }
          
          // 예약 및 타임스탬프 정리
          delete this.analysisTimeouts[threadKey];
          delete this.threadLastMessageMap[threadKey];
        }, waitMs);
      }
    } catch (error) {
      logger.error('이벤트 처리 중 오류 발생:', error);
    }
  }

  /**
   * 스레드 분석을 실행하고 결과를 슬랙과 노션에 게시합니다
   * @param {String} channelId - 채널 ID
   * @param {String} threadTs - 스레드 타임스탬프
   */
  async analyzeThread(channelId, threadTs) {
    try {
      const threadKey = `${channelId}-${threadTs}`;
      logger.info(`스레드 분석 시작: ${threadKey}`);

      // 스레드 메시지 가져오기
      const messages = await slackService.getThreadReplies(channelId, threadTs);
      logger.info(`분석할 스레드의 총 메시지 수: ${messages.length}개 (첫 메시지 포함)`);
      
      // 사용자명 변환 (userName 필드 추가)
      for (const msg of messages) {
        msg.userName = await slackService.getUserName(msg.user);
      }
      // Gemini를 사용하여 스레드 분석 (userName을 사용하도록 메시지 배열 전달)
      const analysis = await aiService.analyzeThread(messages);
      
      // 분석 결과를 슬랙에 게시
      await slackService.postAnalysisToSlack(channelId, threadTs, analysis);
      
      // Notion에 저장 (설정된 경우)
      if (notionService.isConfigured) {
        await notionService.saveAnalysisToNotion(analysis, channelId, threadTs, messages);
      }
      
      logger.info(`스레드 분석 완료: ${threadKey}`);
    } catch (error) {
      logger.error(`스레드 분석 중 오류 발생: ${error.message}`, error);
    }
  }

  /**
   * 슬래시 명령으로 수동 분석을 시작합니다
   * @param {Object} command - 슬래시 명령 객체
   * @param {Function} ack - 응답 콜백
   * @param {Object} respond - 응답 객체
   */
  async handleManualAnalysisCommand(command, ack, respond) {
    try {
      // 명령 접수 확인
      await ack();
      
      // 명령이 스레드 내에서 실행되었는지 확인
      if (!command.thread_ts) {
        await respond({
          text: '이 명령은 스레드 내에서만 사용할 수 있습니다. 분석하려는 스레드에서 다시 시도해주세요.',
          response_type: 'ephemeral'
        });
        return;
      }
      
      // 사용자에게 분석 시작 알림
      await respond({
        text: '스레드 분석을 시작합니다. 잠시만 기다려주세요...',
        response_type: 'ephemeral'
      });
      
      // 분석 실행
      await this.analyzeThread(command.channel_id, command.thread_ts);
    } catch (error) {
      logger.error(`수동 분석 명령 처리 중 오류 발생: ${error.message}`, error);
      await respond({
        text: `분석 중 오류가 발생했습니다: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }
}

module.exports = new ThreadAnalyzerController(); 
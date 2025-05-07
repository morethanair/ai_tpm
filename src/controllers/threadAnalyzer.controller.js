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

      // 30분 후 분석 예약
      const waitMs = (config.threadAnalysis.waitMinutes || 30) * 60 * 1000;
      this.analysisTimeouts[threadKey] = setTimeout(async () => {
        // 이미 분석한 스레드는 무시
        if (this.analyzedThreads.has(threadKey)) return;

        // 스레드가 논쟁 상황인지 확인 (N개 이상의 답글이 있는지)
        const isDebate = await slackService.isDebateThread(event);
        if (!isDebate) {
          return;
        }

        // 분석 실행
        await this.analyzeThread(event.channel, event.thread_ts);
        this.analyzedThreads.add(threadKey);
        // 예약 및 타임스탬프 정리
        delete this.analysisTimeouts[threadKey];
        delete this.threadLastMessageMap[threadKey];
      }, waitMs); // configurable 대기시간
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
      logger.info(`스레드 분석 시작: ${channelId} ${threadTs}`);

      // 스레드 메시지 가져오기
      const messages = await slackService.getThreadReplies(channelId, threadTs);
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
      
      logger.info(`스레드 분석 완료: ${channelId} ${threadTs}`);
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
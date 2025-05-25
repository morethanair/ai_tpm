const messageGroupingService = require('../services/messageGrouping.service');
const slackService = require('../services/slack.service');
const aiService = require('../services/openai.service');
const logger = require('../utils/logger');
const notionService = require('../services/notion.service');

class GroupAnalyzerController {
  constructor() {
    this.processedGroups = new Set(); // 이미 처리한 그룹 추적
    
    // 메시지 그룹화 서비스 이벤트 리스너 등록
    messageGroupingService.on('processChannel', (channelId) => {
      this.processChannelGroups(channelId).catch(error => {
        logger.error(`자동 채널 그룹 처리 중 오류: ${channelId}`, error);
      });
    });
  }

  /**
   * 새 메시지를 처리하고 그룹화 로직을 시작합니다
   * @param {Object} event - Slack 메시지 이벤트
   */
  async handleNewMessage(event) {
    try {
      // 봇 메시지나 자체 메시지 무시
      if (event.bot_id || event.subtype === 'bot_message') {
        return;
      }

      logger.info(`새 메시지 처리: ${event.channel} - ${event.user}`);

      // 스레드 메시지인 경우 별도 처리
      if (event.thread_ts) {
        await this.handleThreadMessage(event);
        return;
      }

      // 일반 메시지를 그룹화 서비스에 추가
      await messageGroupingService.addMessage(event);

    } catch (error) {
      logger.error('새 메시지 처리 중 오류:', error);
    }
  }

  /**
   * 스레드 메시지를 처리합니다
   * @param {Object} event - Slack 스레드 메시지 이벤트
   */
  async handleThreadMessage(event) {
    try {
      logger.info(`스레드 메시지 처리: ${event.channel}-${event.thread_ts}`);
      
      // 스레드 전체 메시지 가져오기
      const threadMessages = await slackService.getThreadReplies(event.channel, event.thread_ts);
      
      // 사용자명 변환
      for (const msg of threadMessages) {
        msg.userName = await slackService.getUserName(msg.user);
      }

      // 스레드 분석
      const analysis = await aiService.analyzeMessageGroup(threadMessages);
      
      // 분석 결과 포스팅
      await slackService.postGroupAnalysisToSlack(event.channel, analysis);
      
      logger.info(`스레드 분석 완료: ${event.channel}-${event.thread_ts}`);

    } catch (error) {
      logger.error('스레드 메시지 처리 중 오류:', error);
    }
  }

  /**
   * 메시지 그룹 처리를 시작합니다
   * @param {String} channelId - 채널 ID
   */
  async processChannelGroups(channelId) {
    try {
      logger.info(`채널 그룹 처리 시작: ${channelId}`);

      // 그룹 처리 결과 가져오기
      const groupDataArray = await messageGroupingService.processMessageGroups(channelId);
      
      // 각 그룹 분석
      for (const groupData of groupDataArray) {
        if (groupData.type === 'group') {
          await this.analyzeMessageGroup(groupData);
        }
      }

    } catch (error) {
      logger.error('채널 그룹 처리 중 오류:', error);
    }
  }

  /**
   * 개별 메시지 그룹을 분석합니다
   * @param {Object} groupData - 그룹 데이터 객체
   */
  async analyzeMessageGroup(groupData) {
    try {
      const { channelId, groupIndex, totalGroups, messages } = groupData;
      const groupKey = `${channelId}-${groupIndex}-${messages[0].ts}`;

      // 이미 처리한 그룹은 건너뛰기
      if (this.processedGroups.has(groupKey)) {
        return;
      }

      logger.info(`그룹 분석 시작: ${groupKey} (${messages.length}개 메시지)`);

      // 사용자명 변환
      for (const msg of messages) {
        msg.userName = await slackService.getUserName(msg.user);
      }

      // AI 분석 실행
      const analysis = await aiService.analyzeMessageGroup(messages);
      
      // 분석 결과에 그룹 정보 추가
      analysis.groupInfo = {
        groupIndex,
        totalGroups,
        messageCount: messages.length,
        timeframe: {
          start: messages[0].ts,
          end: messages[messages.length - 1].ts
        }
      };

      // 분석 결과 포스팅
      await slackService.postGroupAnalysisToSlack(channelId, analysis);
      
      // Notion에 저장 (설정된 경우)
      if (notionService.isConfigured) {
        try {
          await notionService.saveAnalysisToNotion(analysis, channelId, messages[0]?.ts, messages);
        } catch (e) {
          logger.warn(`그룹 분석 결과 Notion 저장 실패: ${e.message}`);
        }
      }
      // 처리 완료 표시
      this.processedGroups.add(groupKey);
      
      logger.info(`그룹 분석 완료: ${groupKey} (타입: ${analysis.analysisType})`);

    } catch (error) {
      logger.error('메시지 그룹 분석 중 오류:', error);
    }
  }

  /**
   * 특정 채널의 그룹 처리를 강제로 실행합니다
   * @param {String} channelId - 채널 ID
   */
  async forceProcessChannel(channelId) {
    try {
      logger.info(`채널 강제 처리: ${channelId}`);
      await this.processChannelGroups(channelId);
    } catch (error) {
      logger.error('채널 강제 처리 중 오류:', error);
    }
  }

  /**
   * 큐 상태를 반환합니다
   */
  getStatus() {
    return {
      queueStatus: messageGroupingService.getQueueStatus(),
      processedGroupsCount: this.processedGroups.size
    };
  }

  /**
   * 슬래시 명령으로 수동 그룹 분석을 시작합니다
   * @param {Object} command - 슬래시 명령 객체
   * @param {Function} ack - 응답 콜백
   * @param {Function} respond - 응답 객체
   */
  async handleManualGroupAnalysisCommand(command, ack, respond) {
    try {
      // 명령 접수 확인
      await ack();
      
      // 사용자에게 분석 시작 알림
      await respond({
        text: '채널의 메시지 그룹 분석을 시작합니다. 잠시만 기다려주세요...',
        response_type: 'ephemeral'
      });
      
      // 강제 그룹 분석 실행
      await this.forceProcessChannel(command.channel_id);
      
      await respond({
        text: '그룹 분석이 완료되었습니다! 📊',
        response_type: 'ephemeral'
      });
      
    } catch (error) {
      logger.error(`수동 그룹 분석 명령 처리 중 오류 발생: ${error.message}`, error);
      await respond({
        text: `그룹 분석 중 오류가 발생했습니다: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  }
}

module.exports = new GroupAnalyzerController(); 
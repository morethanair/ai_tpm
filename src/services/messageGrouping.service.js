const logger = require('../utils/logger');
const config = require('../config/config');
const EventEmitter = require('events');

class MessageGroupingService extends EventEmitter {
  constructor() {
    super();
    this.messageQueue = new Map(); // 채널별 메시지 큐
    this.groupTimeoutMs = config.groupAnalysis.waitMinutes * 60 * 1000; // 설정에서 가져온 대기 시간
    this.timeGapSeconds = config.groupAnalysis.timeGapMinutes * 60; // 그룹 분리 시간 간격
    this.immediateAnalysisGapSeconds = config.groupAnalysis.immediateAnalysisGapMinutes * 60; // 즉시 분석 트리거 간격
    this.processingTimeouts = new Map(); // 채널별 처리 타이머
  }

  /**
   * 새 메시지를 큐에 추가하고 그룹화 처리를 시작합니다
   * @param {Object} message - Slack 메시지 객체
   */
  async addMessage(message) {
    try {
      const channelId = message.channel;
      
      // 스레드 메시지는 별도 처리
      if (message.thread_ts) {
        await this.handleThreadMessage(message);
        return;
      }

      // 채널별 큐 초기화
      if (!this.messageQueue.has(channelId)) {
        this.messageQueue.set(channelId, []);
      }

      const queue = this.messageQueue.get(channelId);
      const currentTimestamp = parseFloat(message.ts);
      
      // 즉시 분석 기능 비활성화 - 항상 대기 시간 후에만 분석
      let shouldTriggerImmediateAnalysis = false;

      // 새 메시지 추가
      queue.push({
        ...message,
        timestamp: currentTimestamp,
        receivedAt: Date.now()
      });

      logger.info(`메시지 큐에 추가: ${channelId}, 큐 크기: ${queue.length}`);

      if (shouldTriggerImmediateAnalysis && queue.length >= 2) {
        // 기존 타이머가 있으면 취소
        if (this.processingTimeouts.has(channelId)) {
          clearTimeout(this.processingTimeouts.get(channelId));
          this.processingTimeouts.delete(channelId);
        }
        
        // 즉시 분석 실행 (최소 2개 메시지 필요)
        logger.info(`즉시 그룹 분석 실행: ${channelId} (메시지 수: ${queue.length})`);
        this.emit('processChannel', channelId);
      } else {
        // 기존 타이머 취소 후 새로 설정
        if (this.processingTimeouts.has(channelId)) {
          clearTimeout(this.processingTimeouts.get(channelId));
        }

        // 설정된 대기 시간 후 그룹 처리 예약
        const timeout = setTimeout(() => {
          this.emit('processChannel', channelId);
        }, this.groupTimeoutMs);

        this.processingTimeouts.set(channelId, timeout);
        logger.info(`그룹 분석 타이머 설정: ${channelId}, ${config.groupAnalysis.waitMinutes}분 후 실행`);
      }

    } catch (error) {
      logger.error('메시지 추가 중 오류:', error);
    }
  }

  /**
   * 스레드 메시지를 독립적으로 처리합니다
   * @param {Object} message - 스레드 메시지 객체
   */
  async handleThreadMessage(message) {
    try {
      const threadKey = `${message.channel}-${message.thread_ts}`;
      logger.info(`스레드 메시지 감지: ${threadKey}`);

      // 스레드 메시지는 즉시 분석 대상으로 전달
      // (기존 threadAnalyzer.controller.js의 로직 활용)
      return {
        type: 'thread',
        channelId: message.channel,
        threadTs: message.thread_ts,
        message: message
      };
    } catch (error) {
      logger.error('스레드 메시지 처리 중 오류:', error);
    }
  }

  /**
   * 채널의 메시지들을 타임프레임별로 그룹화하여 처리합니다
   * @param {String} channelId - 채널 ID
   * @returns {Array} 그룹 데이터 배열
   */
  async processMessageGroups(channelId) {
    try {
      const queue = this.messageQueue.get(channelId);
      if (!queue || queue.length === 0) {
        return [];
      }

      // 최소 2개 메시지가 있어야 그룹 분석 실행
      if (queue.length < 2) {
        logger.info(`메시지 수 부족으로 그룹 분석 건너뜀: ${channelId} (${queue.length}개)`);
        return [];
      }

      logger.info(`메시지 그룹 처리 시작: ${channelId}, 메시지 수: ${queue.length}`);

      // 타임스탬프 순으로 정렬
      queue.sort((a, b) => a.timestamp - b.timestamp);

      // 5분 간격으로 그룹 분리
      const groups = [];
      let currentGroup = [queue[0]];
      for (let i = 1; i < queue.length; i++) {
        const prevMessage = queue[i - 1];
        const currentMessage = queue[i];
        const timeDiff = currentMessage.timestamp - prevMessage.timestamp;
        logger.info(`[그룹분리] GroupID: ${channelId}-${groups.length + 1}, 메시지 간 시간차: ${timeDiff}초, prev_ts: ${prevMessage.timestamp}, curr_ts: ${currentMessage.timestamp}`);
        if (timeDiff >= this.timeGapSeconds) {
          groups.push(currentGroup);
          currentGroup = [currentMessage];
        } else {
          currentGroup.push(currentMessage);
        }
      }

      // 마지막 그룹의 마지막 메시지와 현재 시각(now) 간의 간격이 timeGapSeconds 이상일 때만 그룹에 추가
      const now = Date.now() / 1000;
      const lastMsg = currentGroup[currentGroup.length - 1];
      logger.info(`[그룹분리] GroupID: ${channelId}-${groups.length + 1}, 마지막 그룹 마지막 메시지와 now 간 시간차: ${(now - lastMsg.timestamp).toFixed(1)}초, last_ts: ${lastMsg.timestamp}, now: ${now}`);
      if (now - lastMsg.timestamp >= this.timeGapSeconds) {
        groups.push(currentGroup);
        this.messageQueue.delete(channelId);
      } else {
        // 마지막 그룹은 아직 분석하지 않고 큐에 남겨둠
        this.messageQueue.set(channelId, currentGroup);
        logger.info(`마지막 그룹은 최근 메시지라 분석 보류: ${channelId} (마지막 메시지와 현재 간격 ${(now - lastMsg.timestamp).toFixed(1)}초)`);
      }

      logger.info(`생성된 그룹 수: ${groups.length}`);

      // 각 그룹별로 데이터 생성
      const groupDataArray = [];
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (group.length < 2) {
          logger.info(`그룹 ${i + 1}은 메시지 수가 1개라 분석 건너뜀`);
          continue;
        }
        logger.info(`그룹 ${i + 1} 처리: ${group.length}개 메시지`);
        
        groupDataArray.push({
          type: 'group',
          channelId: channelId,
          groupIndex: i + 1,
          totalGroups: groups.length,
          messages: group
        });
      }

      this.processingTimeouts.delete(channelId);
      return groupDataArray;

    } catch (error) {
      logger.error('메시지 그룹 처리 중 오류:', error);
      return [];
    }
  }

  /**
   * 특정 채널의 메시지 큐를 강제로 처리합니다
   * @param {String} channelId - 채널 ID
   */
  async forceProcessChannel(channelId) {
    if (this.processingTimeouts.has(channelId)) {
      clearTimeout(this.processingTimeouts.get(channelId));
      this.processingTimeouts.delete(channelId);
    }
    
    return this.processMessageGroups(channelId);
  }

  /**
   * 모든 채널의 큐 상태를 반환합니다
   */
  getQueueStatus() {
    const status = {};
    for (const [channelId, queue] of this.messageQueue.entries()) {
      status[channelId] = {
        messageCount: queue.length,
        hasTimeout: this.processingTimeouts.has(channelId)
      };
    }
    return status;
  }
}

module.exports = new MessageGroupingService(); 
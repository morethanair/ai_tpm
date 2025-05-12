const { WebClient } = require('@slack/web-api');
const config = require('../config/config');
const logger = require('../utils/logger');

class SlackService {
  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.minReplies = config.threadAnalysis.minReplies;
  }

  /**
   * 스레드 내의 모든 답글을 가져옵니다
   * @param {String} channelId - 채널 ID
   * @param {String} threadTs - 스레드 부모 메시지의 타임스탬프
   * @returns {Array} - 메시지 배열
   */
  async getThreadReplies(channelId, threadTs) {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs
      });

      logger.info(`스레드 (${threadTs}) 에서 ${result.messages.length}개의 메시지를 가져왔습니다`);
      return result.messages;
    } catch (error) {
      logger.error(`스레드 답글 가져오기 실패: ${error.message}`);
      throw new Error('스레드 답글을 가져오는데 실패했습니다');
    }
  }

  /**
   * 특정 스레드가 논쟁 상황인지 확인합니다 (답글이 임계치 이상인지)
   * @param {Object} event - Slack 이벤트 객체
   * @returns {Boolean} - 논쟁 상황인지 여부
   */
  async isDebateThread(event) {
    try {
      if (!event.thread_ts) {
        return false;
      }

      const replies = await this.getThreadReplies(event.channel, event.thread_ts);
      
      // 스레드의 첫 메시지를 제외한 답글 수 계산
      const replyCount = replies.length - 1;
      
      const isDebate = replyCount >= this.minReplies;
      if (isDebate) {
        logger.info(`논쟁 스레드 감지: ${event.thread_ts}, 답글 수: ${replyCount}`);
      }
      
      return isDebate;
    } catch (error) {
      logger.error(`논쟁 스레드 확인 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 분석 결과를 Slack 채널에 게시합니다
   * @param {String} channelId - 채널 ID
   * @param {String} threadTs - 원본 스레드 타임스탬프
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Object} - 게시 결과
   */
  async postAnalysisToSlack(channelId, threadTs, analysis) {
    try {
      const blocks = this._formatAnalysisBlocks(analysis);
      
      const result = await this.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: '🔍 스레드 분석 결과',
        blocks: blocks
      });

      logger.info(`분석 결과 게시 완료: ${result.ts}`);
      return result;
    } catch (error) {
      logger.error(`분석 결과 게시 실패: ${error.message}`);
      throw new Error('분석 결과를 게시하는데 실패했습니다');
    }
  }

  /**
   * 분석 결과를 Slack 블록 형식으로 포맷팅합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Array} - Slack 블록 배열
   */
  _formatAnalysisBlocks(analysis) {
    // 감정 분석 이모지 선택
    const sentimentEmoji = {
      positive: '😊',
      neutral: '😐',
      negative: '😟'
    }[analysis.sentiment] || '🤔';

    // 태그 포맷팅
    const tagsText = analysis.tags.map(tag => `#${tag}`).join(' ');

    // 기본 블록 생성
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "🔍 스레드 분석 결과",
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*요약*\n${analysis.summary}`
        }
      },
      {
        "type": "divider"
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*핵심 논점*\n${this._formatList(analysis.keyPoints)}`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*결정된 사항*\n${this._formatList(analysis.decisions)}`
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*조치 필요 항목*\n${this._formatList(analysis.actionItems)}`
        }
      }
    ];

    // 비효율적인 스레드 분석 결과가 있으면 추가
    if (analysis.inefficiencyFactors && analysis.inefficiencyFactors.isInefficient) {
      const inefficiencyBlocks = this._formatInefficiencyBlocks(analysis.inefficiencyFactors);
      blocks.push(...inefficiencyBlocks);
    }

    // 마지막 정보 블록 추가
    blocks.push(
      {
        "type": "divider"
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `*분위기:* ${sentimentEmoji} ${analysis.sentiment.toUpperCase()}`
          }
        ]
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `*태그:* ${tagsText}`
          }
        ]
      }
    );

    return blocks;
  }

  /**
   * 비효율적인 스레드 패턴 분석 결과를 Slack 블록 형식으로 포맷팅합니다
   * @private
   * @param {Object} inefficiencyFactors - 비효율적인 스레드 패턴 분석 결과
   * @returns {Array} - Slack 블록 배열
   */
  _formatInefficiencyBlocks(inefficiencyFactors) {
    const factorLabels = {
      noOwner: "📌 명확한 책임자 부재",
      prematureExecution: "🏃‍♂️ 결론 없이 실행 진행",
      noDocumentation: "📄 문서화 미진행",
      emotionalDecision: "😢 감정 기반 의사결정",
      roleMixing: "🔄 역할 혼합",
      noConclusion: "❓ 결론 부재",
      duplicateMeetings: "🔁 중복 회의"
    };

    // 감지된 비효율적인 패턴을 모아서 표시할 텍스트 생성
    const detectedFactors = Object.entries(inefficiencyFactors.factors)
      .filter(([_, factor]) => factor.detected)
      .map(([key, factor]) => {
        return `*${factorLabels[key]}*\n${factor.evidence}`;
      });

    const blocks = [
      {
        "type": "divider"
      },
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "⚠️ 비효율적인 스레드 패턴 감지",
          "emoji": true
        }
      }
    ];

    // 감지된 패턴이 있으면 추가
    if (detectedFactors.length > 0) {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": detectedFactors.join('\n\n')
        }
      });
    }

    // 개선 권장사항 추가
    if (inefficiencyFactors.recommendations && inefficiencyFactors.recommendations.length > 0) {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*개선 권장사항*\n" + this._formatList(inefficiencyFactors.recommendations)
        }
      });
    }

    return blocks;
  }

  /**
   * 배열 항목을 글머리 기호 목록으로 포맷팅합니다
   * @private
   * @param {Array} items - 항목 배열
   * @returns {String} - 포맷팅된 목록
   */
  _formatList(items) {
    if (!items || items.length === 0) {
      return "없음";
    }
    
    return items.map(item => `• ${item}`).join('\n');
  }

  /**
   * 슬랙 User ID를 display_name 또는 real_name으로 변환합니다 (캐싱 적용)
   * @param {String} userId - 슬랙 User ID
   * @returns {String} - 사용자명
   */
  async getUserName(userId) {
    if (!this._userCache) this._userCache = {};
    if (this._userCache[userId]) return this._userCache[userId];
    try {
      const result = await this.client.users.info({ user: userId });
      const name = result.user.profile.display_name || result.user.profile.real_name || userId;
      this._userCache[userId] = name;
      return name;
    } catch (error) {
      logger.warn(`사용자명 조회 실패: ${userId} (${error.message})`);
      return userId;
    }
  }
}

module.exports = new SlackService(); 
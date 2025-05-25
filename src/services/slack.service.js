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

    return [
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
      },
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
    ];
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

  /**
   * 그룹 분석 결과를 Slack 채널에 게시합니다
   * @param {String} channelId - 채널 ID
   * @param {Object} groupAnalysis - 그룹 분석 결과 객체
   * @param {Object} options - 추가 옵션
   * @returns {Object} - 게시 결과
   */
  async postGroupAnalysisToSlack(channelId, groupAnalysis, options = {}) {
    try {
      const { analysisType, actionRequired } = groupAnalysis;
      
      // 분석 타입에 따른 메시지 생성
      let message;
      let blocks;

      switch (analysisType) {
        case 'qa':
          message = '📝 Q&A 정리';
          blocks = this._formatQABlocks(groupAnalysis);
          // Q&A 질문자/답변자 멘션 추가
          if (groupAnalysis.qna && groupAnalysis.qna.length > 0) {
            const qnaMentions = groupAnalysis.qna.map(q => `<@${q.questioner}> <@${q.answerer}>`).join(' ');
            message = `${message}\n${qnaMentions}`;
          }
          break;
        case 'decision_made':
          message = '✅ 의사결정 완료';
          blocks = this._formatDecisionMadeBlocks(groupAnalysis);
          // 결정자 멘션 추가
          if (groupAnalysis.decisions && groupAnalysis.decisions.length > 0) {
            const decisionMentions = groupAnalysis.decisions.map(d => `<@${d.decisionMaker}>`).join(' ');
            message = `${message}\n${decisionMentions}`;
          }
          break;
        case 'decision_needed':
          message = '⚠️ 의사결정 필요';
          blocks = this._formatDecisionNeededBlocks(groupAnalysis);
          // pendingDecisions 멘션 추가
          if (groupAnalysis.pendingDecisions && groupAnalysis.pendingDecisions.length > 0) {
            const pendingMentions = groupAnalysis.pendingDecisions.flatMap(p => p.suggestedDecisionMakers.map(u => `<@${u}>`)).join(' ');
            message = `${message}\n${pendingMentions}`;
          }
          break;
        default:
          message = '📊 메시지 그룹 분석';
          blocks = this._formatGeneralGroupBlocks(groupAnalysis);
      }

      // 의사결정이 필요한 경우 멘션 추가
      if (actionRequired.needsResponse && actionRequired.targetUsers) {
        const mentions = actionRequired.targetUsers.map(userId => `<@${userId}>`).join(' ');
        message = `${message}\n${mentions} ${actionRequired.message}`;
      }

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks: blocks
      });

      logger.info(`그룹 분석 결과 게시 완료: ${result.ts} (타입: ${analysisType})`);
      return result;
    } catch (error) {
      logger.error(`그룹 분석 결과 게시 실패: ${error.message}`);
      throw new Error('그룹 분석 결과를 게시하는데 실패했습니다');
    }
  }

  /**
   * Q&A 분석 결과를 Slack 블록으로 포맷팅합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Array} - Slack 블록 배열
   */
  _formatQABlocks(analysis) {
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "📝 Q&A 정리",
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
      }
    ];

    // Q&A 항목들 추가
    analysis.qna.forEach((qa, index) => {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*Q${index + 1}.* ${qa.question}\n*A${index + 1}.* ${qa.answer}`
        }
      });
      
      blocks.push({
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `질문자: <@${qa.questioner}> | 답변자: <@${qa.answerer}>`
          }
        ]
      });
    });

    return blocks;
  }

  /**
   * 의사결정 완료 분석 결과를 Slack 블록으로 포맷팅합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Array} - Slack 블록 배열
   */
  _formatDecisionMadeBlocks(analysis) {
    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "✅ 의사결정 완료",
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
      }
    ];

    // 결정 사항들 추가
    analysis.decisions.forEach((decision, index) => {
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*결정 ${index + 1}*\n${decision.decision}`
        }
      });
      
      blocks.push({
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `결정자: <@${decision.decisionMaker}> | 배경: ${decision.context}`
          }
        ]
      });
    });

    return blocks;
  }

  /**
   * 의사결정 필요 분석 결과를 Slack 블록으로 포맷팅합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Array} - Slack 블록 배열
   */
  _formatDecisionNeededBlocks(analysis) {
    const urgencyEmoji = {
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };

    const blocks = [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "⚠️ 의사결정 필요",
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
      }
    ];

    // 대기 중인 결정 사항들 추가
    analysis.pendingDecisions.forEach((pending, index) => {
      const emoji = urgencyEmoji[pending.urgency] || '⚪';
      const mentions = pending.suggestedDecisionMakers.map(userId => `<@${userId}>`).join(' ');
      
      blocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `${emoji} *결정 필요 ${index + 1}*\n${pending.issue}`
        }
      });
      
      blocks.push({
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `우선순위: ${pending.urgency.toUpperCase()} | 제안 결정자: ${mentions}`
          }
        ]
      });
      
      if (pending.context) {
        blocks.push({
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*상황:* ${pending.context}`
          }
        });
      }
    });

    return blocks;
  }

  /**
   * 일반 그룹 분석 결과를 Slack 블록으로 포맷팅합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @returns {Array} - Slack 블록 배열
   */
  _formatGeneralGroupBlocks(analysis) {
    return [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "📊 메시지 그룹 분석",
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
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": `참여자: ${analysis.participants.map(p => `<@${p}>`).join(', ')}`
          }
        ]
      }
    ];
  }
}

module.exports = new SlackService(); 
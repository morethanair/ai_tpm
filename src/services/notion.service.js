const { Client } = require('@notionhq/client');
const config = require('../config/config');
const logger = require('../utils/logger');

class NotionService {
  constructor() {
    if (config.notion.apiKey) {
      this.client = new Client({
        auth: config.notion.apiKey
      });
      this.databaseId = config.notion.databaseId;
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      logger.warn('Notion API 키가 설정되지 않았습니다. Notion 기능이 비활성화됩니다.');
    }
  }

  /**
   * 분석 결과를 Notion 데이터베이스에 저장합니다
   * @param {Object} analysis - 분석 결과 객체
   * @param {String} channelId - 슬랙 채널 ID
   * @param {String} threadTs - 스레드 타임스탬프
   * @param {Array} messages - 스레드 메시지 배열
   * @returns {Object} - Notion 페이지 생성 결과
   */
  async saveAnalysisToNotion(analysis, channelId, threadTs, messages) {
    if (!this.isConfigured) {
      logger.warn('Notion 저장 요청이 있었지만, Notion이 구성되지 않았습니다.');
      throw new Error('Notion이 구성되지 않았습니다.');
    }

    try {
      const threadUrl = this._getSlackThreadUrl(channelId, threadTs);
      const firstMessage = messages[0]?.text || '내용 없음';
      const truncatedFirstMessage = firstMessage.length > 100 
        ? `${firstMessage.substring(0, 97)}...` 
        : firstMessage;

      const pageProperties = {
        title: {
          title: [
            {
              text: {
                content: truncatedFirstMessage
              }
            }
          ]
        },
        Summary: {
          rich_text: [
            {
              text: {
                content: analysis.summary
              }
            }
          ]
        },
        Sentiment: {
          select: {
            name: analysis.sentiment
          }
        },
        ThreadLink: {
          url: threadUrl
        },
        Channel: {
          rich_text: [
            {
              text: {
                content: channelId
              }
            }
          ]
        },
        Tags: {
          multi_select: analysis.tags.map(tag => ({ name: tag }))
        },
        Date: {
          date: {
            start: new Date().toISOString()
          }
        }
      };

      const response = await this.client.pages.create({
        parent: {
          database_id: this.databaseId
        },
        properties: pageProperties,
        children: this._createNotionContent(analysis, messages)
      });

      logger.info(`Notion 페이지 생성 완료: ${response.id}`);
      return response;
    } catch (error) {
      logger.error(`Notion 페이지 생성 실패: ${error.message}`);
      throw new Error('Notion 페이지를 생성하는데 실패했습니다');
    }
  }

  /**
   * Notion 페이지 콘텐츠 블록을 생성합니다
   * @private
   * @param {Object} analysis - 분석 결과 객체
   * @param {Array} messages - 스레드 메시지 배열
   * @returns {Array} - Notion 블록 배열
   */
  _createNotionContent(analysis, messages) {
    const blocks = [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: '스레드 분석 결과' } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: analysis.summary } }]
        }
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '핵심 논점' } }]
        }
      }
    ];

    // 핵심 논점 추가
    blocks.push(this._createBulletList(analysis.keyPoints));

    // 결정된 사항 추가
    blocks.push(
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '결정된 사항' } }]
        }
      }
    );
    blocks.push(this._createBulletList(analysis.decisions));

    // 조치 필요 항목 추가
    blocks.push(
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '조치 필요 항목' } }]
        }
      }
    );
    blocks.push(this._createBulletList(analysis.actionItems));

    // 스레드 내용 추가
    blocks.push(
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '원본 스레드 내용' } }]
        }
      },
      {
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{ 
            type: 'text', 
            text: { content: '원본 스레드 메시지 (클릭하여 펼치기)' } 
          }],
          children: this._createThreadMessagesBlocks(messages)
        }
      }
    );

    return blocks.flat();
  }

  /**
   * 글머리 기호 목록 블록을 생성합니다
   * @private
   * @param {Array} items - 목록 항목 배열
   * @returns {Array} - 글머리 기호 블록 배열
   */
  _createBulletList(items) {
    if (!items || items.length === 0) {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: '없음' } }]
        }
      };
    }

    return items.map(item => ({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [{ type: 'text', text: { content: item } }]
      }
    }));
  }

  /**
   * 스레드 메시지 블록을 생성합니다
   * @private
   * @param {Array} messages - 메시지 배열
   * @returns {Array} - 메시지 블록 배열
   */
  _createThreadMessagesBlocks(messages) {
    return messages.map(msg => {
      const timestamp = new Date(Number(msg.ts) * 1000).toLocaleString();
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { 
              type: 'text', 
              text: { content: `[${timestamp}] ` },
              annotations: { bold: true }
            },
            { 
              type: 'text', 
              text: { content: `@${msg.user}: ` }
            },
            { 
              type: 'text', 
              text: { content: msg.text }
            }
          ]
        }
      };
    });
  }

  /**
   * 슬랙 스레드 URL을 생성합니다
   * @private
   * @param {String} channelId - 채널 ID
   * @param {String} threadTs - 스레드 타임스탬프
   * @returns {String} - 스레드 URL
   */
  _getSlackThreadUrl(channelId, threadTs) {
    // 타임스탬프를 슬랙 URL 형식으로 변환 (소수점 제거)
    const formattedTs = threadTs.replace('.', '');
    return `https://slack.com/archives/${channelId}/p${formattedTs}`;
  }
}

module.exports = new NotionService(); 
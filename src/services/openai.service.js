const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config/config');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    // Gemini API 초기화
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: config.gemini.model });
  }

  /**
   * 스레드 대화를 분석하여 요약 및 구조화된 결과를 생성합니다
   * @param {Array} messages - 스레드 메시지 배열
   * @returns {Object} - 분석 결과 객체
   */
  async analyzeThread(messages) {
    try {
      const threadText = this._formatThreadMessages(messages);
      const systemPrompt = this._getAnalysisSystemPrompt();
      
      // Gemini 모델 호출 설정
      const generationConfig = {
        temperature: 0.4,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      };

      const chat = this.model.startChat({
        generationConfig,
        history: [
          {
            role: "user",
            parts: [{ text: "당신은 슬랙 스레드 분석 전문가입니다." }],
          },
          {
            role: "model",
            parts: [{ text: "네, 저는 슬랙 스레드 분석 전문가입니다. 스레드 내용을 분석하여 요약, 핵심 논점, 결정 사항, 필요한 조치 등을 구조화된 형태로 제공해 드리겠습니다. 어떤 스레드를 분석해 드릴까요?" }],
          },
        ],
      });

      // 분석 요청
      const prompt = `${systemPrompt}\n\n===스레드 내용===\n${threadText}`;
      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();

      // 응답을 구조화된 JSON으로 파싱
      return this._parseAnalysisResponse(responseText);
    } catch (error) {
      logger.error('Gemini API 호출 중 오류 발생:', error);
      throw new Error('스레드 분석 중 오류가 발생했습니다');
    }
  }

  /**
   * 스레드 메시지를 텍스트로 포맷팅합니다
   * @private
   * @param {Array} messages - 스레드 메시지 배열
   * @returns {String} - 포맷팅된 메시지 텍스트
   */
  _formatThreadMessages(messages) {
    return messages.map(msg => {
      const timestamp = new Date(Number(msg.ts) * 1000).toLocaleString();
      const userTag = msg.userName ? `@${msg.userName}` : `<@${msg.user}>`;
      return `[${timestamp}] ${userTag}: ${msg.text}`;
    }).join('\n\n');
  }

  /**
   * 분석을 위한 시스템 프롬프트를 생성합니다
   * @private
   * @returns {String} - 시스템 프롬프트
   */
  _getAnalysisSystemPrompt() {
    return `
다음 슬랙 스레드 내용을 분석하여 아래 정보를 포함한 JSON 형식으로 응답해주세요.

1. summary: 대화 내용 전체 요약 (한국어, 3문장)
2. keyPoints: 핵심 논점 목록 (배열)
3. decisions: 이미 결정된 사항 (배열)
4. actionItems: 추가 조치가 필요한 항목 (배열)
5. stakeholders: 관련된 주요 이해관계자들 (객체 - 사용자 ID를 키로, 역할을 값으로)
6. sentiment: 전반적인 대화 분위기 ("positive", "neutral", "negative" 중 하나)
7. tags: 대화 주제를 나타내는 키워드 (배열, 5개)

반드시 다음과 같은 JSON 구조로만 반환해주세요:

{
  "summary": "...",
  "keyPoints": ["...", "..."],
  "decisions": ["...", "..."],
  "actionItems": ["...", "..."],
  "stakeholders": {"U123456": "주요 의사결정자", "U234567": "기술 조언자"},
  "sentiment": "neutral",
  "tags": ["기술", "아키텍처", "결정", "버그", "기능"]
}

응답은 반드시 유효한 JSON 형식이어야 합니다. 다른 설명이나 서식 없이 JSON만 응답해주세요.
`;
  }

  /**
   * API 응답을 파싱합니다
   * @private
   * @param {String} responseText - API 응답 텍스트
   * @returns {Object} - 파싱된 분석 결과 객체
   */
  _parseAnalysisResponse(responseText) {
    try {
      // JSON 형태로 응답되지 않았다면 텍스트 내에서 JSON 부분을 추출
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      
      return JSON.parse(jsonStr);
    } catch (error) {
      logger.error('Gemini 응답 파싱 중 오류 발생:', error);
      // 파싱 실패 시 간단한 객체 반환
      return {
        summary: "분석 결과를 파싱하는 중 오류가 발생했습니다.",
        error: true
      };
    }
  }

  /**
   * 메시지 그룹을 분석하여 Q&A, 의사결정 사항 등을 추출합니다
   * @param {Array} messages - 그룹 메시지 배열
   * @param {Object} options - 분석 옵션
   * @returns {Object} - 그룹 분석 결과 객체
   */
  async analyzeMessageGroup(messages, options = {}) {
    try {
      const groupText = this._formatGroupMessages(messages);
      const systemPrompt = this._getGroupAnalysisSystemPrompt();
      
      // Gemini 모델 호출 설정
      const generationConfig = {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      };

      const chat = this.model.startChat({
        generationConfig,
        history: [
          {
            role: "user",
            parts: [{ text: "당신은 슬랙 메시지 그룹 분석 전문가입니다." }],
          },
          {
            role: "model",
            parts: [{ text: "네, 저는 슬랙 메시지 그룹 분석 전문가입니다. 메시지 그룹을 분석하여 Q&A, 의사결정 사항, 필요한 조치 등을 구조화하여 제공해 드리겠습니다." }],
          },
        ],
      });

      // 분석 요청
      const prompt = `${systemPrompt}\n\n===메시지 그룹 내용===\n${groupText}`;
      const result = await chat.sendMessage(prompt);
      const responseText = result.response.text();

      // 응답을 구조화된 JSON으로 파싱
      return this._parseGroupAnalysisResponse(responseText);
    } catch (error) {
      logger.error('그룹 분석 중 Gemini API 오류 발생:', error);
      throw new Error('메시지 그룹 분석 중 오류가 발생했습니다');
    }
  }

  /**
   * 그룹 메시지를 텍스트로 포맷팅합니다
   * @private
   * @param {Array} messages - 그룹 메시지 배열
   * @returns {String} - 포맷팅된 메시지 텍스트
   */
  _formatGroupMessages(messages) {
    return messages.map(msg => {
      const timestamp = new Date(Number(msg.ts) * 1000).toLocaleString();
      const userTag = msg.userName ? `@${msg.userName}` : `<@${msg.user}>`;
      return `[${timestamp}] ${userTag}: ${msg.text}`;
    }).join('\n\n');
  }

  /**
   * 그룹 분석을 위한 시스템 프롬프트를 생성합니다
   * @private
   * @returns {String} - 시스템 프롬프트
   */
  _getGroupAnalysisSystemPrompt() {
    return `
다음 슬랙 메시지 그룹을 분석하여 아래 정보를 포함한 JSON 형식으로 응답해주세요.

분석 기준:
1. Q&A 패턴: 질문과 답변이 이루어진 경우
2. 의사결정 완료: 결정이 내려진 사항
3. 의사결정 필요: 결정이 필요하지만 아직 대응이 없는 사항

응답 형식:
{
  "analysisType": "qa" | "decision_made" | "decision_needed" | "general",
  "summary": "그룹 내용 요약 (한국어, 2문장)",
  "qna": [
    {
      "question": "질문 내용",
      "questioner": "질문자 사용자 ID",
      "answer": "답변 내용",
      "answerer": "답변자 사용자 ID"
    }
  ],
  "decisions": [
    {
      "decision": "결정 사항",
      "decisionMaker": "결정자 사용자 ID",
      "context": "결정 배경"
    }
  ],
  "pendingDecisions": [
    {
      "issue": "결정이 필요한 사항",
      "suggestedDecisionMakers": ["사용자ID1", "사용자ID2"],
      "urgency": "high" | "medium" | "low",
      "context": "상황 설명"
    }
  ],
  "actionRequired": {
    "needsResponse": true/false,
    "targetUsers": ["사용자ID1", "사용자ID2"],
    "message": "필요한 조치 메시지"
  },
  "participants": ["참여자 사용자 ID 목록"],
  "timeframe": {
    "start": "첫 메시지 타임스탬프",
    "end": "마지막 메시지 타임스탬프",
    "duration": "지속 시간 (분)"
  }
}

반드시 유효한 JSON 형식으로만 응답해주세요. 다른 설명 없이 JSON만 반환하세요.
`;
  }

  /**
   * 그룹 분석 API 응답을 파싱합니다
   * @private
   * @param {String} responseText - API 응답 텍스트
   * @returns {Object} - 파싱된 그룹 분석 결과 객체
   */
  _parseGroupAnalysisResponse(responseText) {
    try {
      // JSON 형태로 응답되지 않았다면 텍스트 내에서 JSON 부분을 추출
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
      
      const parsed = JSON.parse(jsonStr);
      
      // 기본값 설정
      return {
        analysisType: parsed.analysisType || 'general',
        summary: parsed.summary || '분석 결과를 생성할 수 없습니다.',
        qna: parsed.qna || [],
        decisions: parsed.decisions || [],
        pendingDecisions: parsed.pendingDecisions || [],
        actionRequired: parsed.actionRequired || { needsResponse: false },
        participants: parsed.participants || [],
        timeframe: parsed.timeframe || {},
        ...parsed
      };
    } catch (error) {
      logger.error('그룹 분석 응답 파싱 중 오류 발생:', error);
      // 파싱 실패 시 기본 객체 반환
      return {
        analysisType: 'general',
        summary: "분석 결과를 파싱하는 중 오류가 발생했습니다.",
        qna: [],
        decisions: [],
        pendingDecisions: [],
        actionRequired: { needsResponse: false },
        participants: [],
        timeframe: {},
        error: true
      };
    }
  }
}

module.exports = new AIService(); 
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
8. inefficiencyFactors: 비효율적인 스레드 패턴 분석 (객체, 각 항목별 true/false와 근거)

비효율적인 스레드 패턴을 분석할 때는 다음 기준을 사용하세요:

1. "noOwner": 명확한 책임자 부재
   - 메시지에 의사결정자(Role owner)가 태그되지 않음
   - 정책/설계에 대한 최종 "확정" 표현 없이 논의만 지속됨 (예: "좋을 것 같아요", "어떻게 할까요?", "일단 이렇게 해볼게요")

2. "prematureExecution": 논의가 끝나기 전에 실행 일정이 잡힘
   - "우선 개발 들어갑니다", "UI는 이렇게 할게요" 등의 문장이 논의 중간에 등장
   - 문서화 or 정리 없이 허들이 잡히고 그게 의사결정으로 굳어짐

3. "noDocumentation": 논의 종료 후 정책/기획 문서 미연동
   - Slack 스레드에서 결정된 내용이 Notion, Confluence 등에 반영되지 않음 (Traceability 부재)
   - "정리해서 공유드릴게요" 이후 실제 공유 링크가 없음

4. "emotionalDecision": 주관적 표현 + 감정적 표현 조합
   - "이건 안 되는 것 같아요 ㅠㅠ", "너무 복잡해질 것 같아서요" 등
   - 정책 결정에 있어 명확한 기준보다 감정적 언어가 빈번하게 사용됨

5. "roleMixing": 기술과 정책의 역할이 교차됨
   - 기술 담당자가 정책을 암묵적으로 제안
   - 기획자가 기술 구현 가능성을 앞서 단정

6. "noConclusion": 슬랙 스레드 길이가 5개 이상인데 결론이 없음
   - 5개 이상의 메시지 스레드가 오가고 있음에도 명확한 책임자 발언 없음
   - 정책 문장("~해야 한다", "~으로 확정")이 없음
   - 관련 문서/이슈 트래킹 링크 없음

7. "duplicateMeetings": 같은 이슈에 대해 미팅 + 허들 + 회의가 중복 발생
   - 같은 주제의 이슈에 대해 2번 이상 회의가 잡힘
   - 이는 이전 논의에서 명확한 정의나 합의 없이 실행으로 넘어갔다는 징후

반드시 다음과 같은 JSON 구조로만 반환해주세요:

{
  "summary": "...",
  "keyPoints": ["...", "..."],
  "decisions": ["...", "..."],
  "actionItems": ["...", "..."],
  "stakeholders": {"U123456": "주요 의사결정자", "U234567": "기술 조언자"},
  "sentiment": "neutral",
  "tags": ["기술", "아키텍처", "결정", "버그", "기능"],
  "inefficiencyFactors": {
    "isInefficient": true,
    "factors": {
      "noOwner": {
        "detected": true,
        "evidence": "..."
      },
      "prematureExecution": {
        "detected": false,
        "evidence": ""
      },
      "noDocumentation": {
        "detected": true,
        "evidence": "..."
      },
      "emotionalDecision": {
        "detected": false,
        "evidence": ""
      },
      "roleMixing": {
        "detected": false,
        "evidence": ""
      },
      "noConclusion": {
        "detected": true,
        "evidence": "..."
      },
      "duplicateMeetings": {
        "detected": false,
        "evidence": ""
      }
    },
    "recommendations": ["..."]
  }
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
}

module.exports = new AIService(); 
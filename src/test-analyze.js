/**
 * 스레드 분석 기능을 수동으로 테스트하기 위한 스크립트
 * 실행 방법: node src/test-analyze.js
 */

require('dotenv').config();
const { sampleThreadMessages } = require('./utils/test-data');
const aiService = require('./services/openai.service');
const logger = require('./utils/logger');

async function testThreadAnalysis() {
  try {
    logger.info('샘플 스레드 분석 테스트 시작...');
    
    // Gemini 분석 테스트
    logger.info('Gemini 분석 서비스 테스트 중...');
    const analysis = await aiService.analyzeThread(sampleThreadMessages);
    
    // 결과 출력
    logger.info('분석 결과:');
    console.log(JSON.stringify(analysis, null, 2));
    
    logger.info('테스트 완료!');
  } catch (error) {
    logger.error('테스트 중 오류 발생:', error);
  }
}

// 테스트 실행
testThreadAnalysis(); 
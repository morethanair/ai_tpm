# 슬랙 스레드 분석기 개발 가이드

이 문서는 슬랙 스레드 분석기 애플리케이션을 개발하는 데 필요한 정보를 제공합니다.

## 프로젝트 구조

```
slack-thread-analyzer/
├── src/
│   ├── config/              # 설정 파일
│   ├── controllers/         # 컨트롤러
│   ├── services/            # 서비스 레이어 (비즈니스 로직)
│   ├── utils/               # 유틸리티 함수
│   ├── index.js             # 애플리케이션 진입점
│   └── test-analyze.js      # 테스트 스크립트
├── logs/                    # 로그 파일 (자동 생성)
├── .env                     # 환경 변수 파일
├── package.json             # 의존성 및 스크립트
└── README.md                # 사용 설명서
```

## 개발 환경 설정

### 필수 요구사항

- Node.js 16.x 이상
- npm 7.x 이상
- Slack 워크스페이스 관리자 권한 (앱 설치용)
- Google AI (Gemini) API 키

### 개발 모드

```bash
npm run dev
```

## 주요 구성 요소

### 1. 서비스

- **slack.service.js**: 슬랙 API 연동 및 메시지 처리
- **openai.service.js**: Google Gemini API를 사용한 스레드 분석 (파일명은 호환성을 위해 유지)
- **notion.service.js**: Notion API 연동 (선택 사항)

### 2. 컨트롤러

- **threadAnalyzer.controller.js**: 스레드 감지 및 분석 로직 관리

### 3. 설정

- **config.js**: 환경 변수 및 앱 설정 관리

## 핵심 기능 흐름

1. **스레드 감지**:
   - Slack 이벤트 API로 `message` 및 `message_replied` 이벤트 수신
   - 스레드 답글 수가 임계값(기본값 5)을 초과하는지 확인

2. **분석 프로세스**:
   - 스레드 메시지 수집 (`conversations.replies` API 사용)
   - Gemini 모델을 통한 분석 (gemini-2.0-flash 모델 활용)
   - 분석 결과 구조화 (JSON 형식)

3. **결과 게시**:
   - Slack 채널에 분석 결과 게시
   - (선택 사항) Notion 데이터베이스에 저장

## 테스트 방법

### 샘플 데이터로 분석 테스트

```bash
# Gemini API 분석 기능 테스트
node src/test-analyze.js
```

### 수동 테스트 (Slack 앱 설치 후)

1. 테스트 채널에 봇 초대
2. 테스트 메시지 + 5개 이상의 답글 작성
3. 자동 분석 결과 확인
4. 별도 스레드에서 `/analyze-thread` 명령 테스트

## 로깅

- 애플리케이션 로그는 `logs/` 디렉토리에 저장됨
- `combined.log`: 모든 로그 레벨 포함
- `error.log`: 에러 로그만 포함

## 커스터마이징 가이드

### 분석 임계값 조정

`.env` 파일에서 `MIN_THREAD_REPLIES` 값을 수정

### Gemini 프롬프트 수정

`openai.service.js` 파일의 `_getAnalysisSystemPrompt()` 메서드를 수정하여 프롬프트 변경

### Slack 블록 메시지 포맷 수정

`slack.service.js` 파일의 `_formatAnalysisBlocks()` 메서드를 수정하여 슬랙 메시지 형식 변경

## Gemini API 관련 참고사항

- Gemini API는 Google이 제공하는 생성형 AI 서비스입니다.
- `gemini-2.0-flash` 모델은 빠른 응답 속도와 합리적인 품질을 제공합니다.
- API 요청 구조는 OpenAI와 다르며, `@google/generative-ai` 패키지를 사용합니다.
- 프롬프트 엔지니어링 시 JSON 형식 응답을 강조해야 올바른 결과를 얻을 수 있습니다.

## 트러블슈팅

### 자주 발생하는 문제 및 해결 방법

1. **API 인증 오류**:
   - `.env` 파일의 토큰 값 확인
   - Slack 앱 권한 스코프 및 Gemini API 키 확인

2. **스레드 감지 문제**:
   - 이벤트 구독 설정 확인
   - `message_replied` 이벤트 수신 여부 로그 확인

3. **Gemini API 오류**:
   - API 키 유효성 및 할당량 확인
   - 네트워크 연결 확인
   - 응답 형식이 일관되지 않을 경우 프롬프트 엔지니어링 검토 
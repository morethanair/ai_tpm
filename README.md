# 슬랙 스레드 분석기 (Slack Thread Analyzer)

슬랙 채널에서 발생하는 논쟁 스레드를 자동으로 감지하고 분석하여, 중요 정보를 요약 및 정리해주는 봇입니다.

## 📌 주요 기능

- **논쟁 스레드 자동 감지**: 하나의 메시지에 5개 이상의 답글이 달리면 자동으로 감지
- **Gemini 기반 분석**: Google의 Gemini 2.0 Flash 모델을 사용하여 스레드 내용을 심층 분석
- **구조화된 요약 제공**: 주요 논점, 결정 사항, 필요한 조치 등을 체계적으로 정리
- **Notion 연동**: 분석 결과를 Notion 데이터베이스에 자동 저장 (선택 사항)
- **수동 분석 기능**: 슬래시 명령을 통해 원하는 스레드 수동 분석 가능

## 🛠️ 설치 방법

### 1. 프로젝트 다운로드 및 설정

```bash
# 저장소 클론
git clone https://github.com/your-username/slack-thread-analyzer.git
cd slack-thread-analyzer

# 의존성 설치
npm install

# 환경 변수 설정
cp src/.env.example .env
```

### 2. 환경 변수 설정

`.env` 파일에 다음 정보를 입력하세요:

```
# Slack 설정
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# Gemini 설정
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash

# Notion 설정 (선택사항)
NOTION_API_KEY=your-notion-api-key
NOTION_DATABASE_ID=your-notion-database-id

# 앱 설정
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# 스레드 분석 설정
MIN_THREAD_REPLIES=5
```

### 3. Slack 앱 설정

1. [Slack API 웹사이트](https://api.slack.com/apps)에서 새 앱 생성
2. 다음 권한 스코프 추가:
   - `channels:history`
   - `chat:write`
   - `app_mentions:read`
   - `reactions:read`
   - `commands`
3. 이벤트 구독 설정:
   - `message`
   - `message_replied`
   - `app_mention`
4. 슬래시 명령 등록:
   - 명령어: `/analyze-thread`
   - 설명: `현재 스레드 분석 요청`
   - 사용법 힌트: `이 스레드를 분석해주세요`
5. 앱 토큰 생성 및 복사 (Settings > Socket Mode)

### 4. Google AI API 설정

1. [Google AI Studio](https://makersuite.google.com/app/apikey)에서 API 키 생성
2. 생성된 API 키를 `.env` 파일의 `GEMINI_API_KEY` 값으로 설정

### 5. Notion 데이터베이스 설정 (선택 사항)

1. Notion에서 통합 앱 생성 및 API 키 발급
2. 다음 속성을 가진 데이터베이스 생성:
   - `title`: 제목 (기본)
   - `Summary`: 리치 텍스트
   - `Sentiment`: 선택 옵션 (positive, neutral, negative)
   - `ThreadLink`: URL
   - `Channel`: 리치 텍스트
   - `Tags`: 다중 선택
   - `Date`: 날짜

### 6. 앱 실행

```bash
# 개발 모드로 실행
npm run dev

# 프로덕션 모드로 실행
npm start
```

## 🚀 사용 방법

### 자동 분석

- 스레드에 답글이 5개 이상 달리면 자동으로 분석 결과가 스레드에 게시됩니다.
- 분석 임계값은 `.env` 파일의 `MIN_THREAD_REPLIES` 값으로 조정할 수 있습니다.

### 수동 분석

- 원하는 스레드에서 `/analyze-thread` 슬래시 명령을 입력하여 수동으로 분석을 요청할 수 있습니다.

### 봇 도움말

- 채널에서 봇을 멘션(`@Slack Thread Analyzer`)하면 사용 방법 안내 메시지가 표시됩니다.

## 📋 분석 결과 예시

분석 결과는 다음 정보를 포함합니다:

- **요약**: 전체 대화 내용 요약 (3-5문장)
- **핵심 논점**: 주요 쟁점 목록
- **결정된 사항**: 이미 합의된 항목
- **조치 필요 항목**: 추가 액션이 필요한 항목
- **분위기**: 대화의 전반적 분위기 (긍정/중립/부정)
- **태그**: 주제 관련 키워드

## 🔍 로깅 및 모니터링

로그 파일은 `logs` 디렉토리에 저장됩니다:
- `logs/combined.log`: 모든 로그
- `logs/error.log`: 에러 로그만

로그 레벨은 `.env` 파일의 `LOG_LEVEL` 설정으로 조정할 수 있습니다.

## 📄 라이센스

이 프로젝트는 MIT 라이센스를 따릅니다. 
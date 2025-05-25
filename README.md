# 슬랙 스레드 분석기 (Slack Thread Analyzer)

슬랙 채널에서 발생하는 논쟁 스레드를 자동으로 감지하고 분석하여, 중요 정보를 요약 및 정리해주는 봇입니다. 또한 메시지를 타임프레임별로 그룹화하여 Q&A, 의사결정 사항을 자동으로 분석합니다.

## 📌 주요 기능

### 스레드 분석
- **논쟁 스레드 자동 감지**: 하나의 메시지에 5개 이상의 답글이 달리면 30분 후 자동으로 분석
- **수동 스레드 분석**: `/analyze-thread` 명령으로 원하는 스레드 즉시 분석

### 타임프레임 기반 그룹 분석 🆕
- **자동 메시지 그룹화**: 메시지를 5분 간격으로 그룹화하여 자동 분석
- **Q&A 자동 정리**: 질문과 답변이 이루어진 경우 구조화하여 정리
- **의사결정 추적**: 완료된 의사결정 사항을 자동으로 채널에 포스팅
- **의사결정 알림**: 결정이 필요하지만 대응이 없는 경우 관련자 멘션
- **스레드 독립 분석**: 스레드 답글은 별도로 즉시 분석

### 공통 기능
- **Gemini 기반 분석**: Google의 Gemini 2.0 Flash 모델을 사용하여 심층 분석
- **구조화된 요약 제공**: 주요 논점, 결정 사항, 필요한 조치 등을 체계적으로 정리
- **Notion 연동**: 분석 결과를 Notion 데이터베이스에 자동 저장 (선택 사항)

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
MIN_THREAD_WAIT_MINUTES=30

# 그룹 분석 설정 🆕
GROUP_TIME_GAP_MINUTES=5
GROUP_WAIT_MINUTES=5
GROUP_IMMEDIATE_GAP_MINUTES=3
ENABLE_GROUP_AUTO_ANALYSIS=true
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
   - `/analyze-thread`: 현재 스레드 분석 요청
   - `/analyze-groups`: 채널의 메시지 그룹 강제 분석 🆕
   - `/analyzer-status`: 분석기 상태 확인 🆕
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

#### 스레드 분석
- 스레드에 답글이 5개 이상 달리면 30분 후 자동으로 분석 결과가 스레드에 게시됩니다.
- 분석 임계값은 `.env` 파일의 `MIN_THREAD_REPLIES` 값으로 조정할 수 있습니다.

#### 그룹 분석 🆕
- 채널의 메시지가 5분 이상 공백이 생기면 이전 메시지들을 그룹으로 묶어 분석합니다.
- 스레드 답글은 즉시 독립적으로 분석됩니다.
- 분석 결과에 따라 Q&A 정리, 의사결정 완료, 의사결정 필요 알림이 자동으로 포스팅됩니다.

### 수동 분석

- `/analyze-thread`: 원하는 스레드에서 입력하여 수동으로 분석을 요청
- `/analyze-groups`: 채널의 대기 중인 메시지 그룹을 강제로 분석
- `/analyzer-status`: 현재 분석기의 큐 상태와 처리 현황 확인

### 봇 도움말

- 채널에서 봇을 멘션(`@Slack Thread Analyzer`)하면 사용 방법 안내 메시지가 표시됩니다.

## 📋 분석 결과 예시

### 스레드 분석 결과
- **요약**: 전체 대화 내용 요약 (3-5문장)
- **핵심 논점**: 주요 쟁점 목록
- **결정된 사항**: 이미 합의된 항목
- **조치 필요 항목**: 추가 액션이 필요한 항목
- **분위기**: 대화의 전반적 분위기 (긍정/중립/부정)
- **태그**: 주제 관련 키워드

### 그룹 분석 결과 🆕

#### Q&A 정리
- 질문과 답변을 구조화하여 정리
- 질문자와 답변자 정보 포함

#### 의사결정 완료
- 결정된 사항과 결정자 정보
- 결정 배경 및 맥락

#### 의사결정 필요
- 결정이 필요한 사항과 우선순위
- 제안된 의사결정자 자동 멘션
- 상황 설명 및 맥락

## ⚙️ 설정 옵션

### 스레드 분석 설정
- `MIN_THREAD_REPLIES`: 자동 분석 트리거 답글 수 (기본: 5)
- `MIN_THREAD_WAIT_MINUTES`: 분석 대기 시간 (기본: 30분)

### 그룹 분석 설정 🆕
- `GROUP_TIME_GAP_MINUTES`: 그룹 분리 시간 간격 (기본: 5분)
- `GROUP_WAIT_MINUTES`: 그룹 분석 대기 시간 (기본: 5분)
- `GROUP_IMMEDIATE_GAP_MINUTES`: 즉시 분석 트리거 간격 (기본: 3분)
- `ENABLE_GROUP_AUTO_ANALYSIS`: 자동 그룹 분석 활성화 (기본: true)

## 🔍 로깅 및 모니터링

로그 파일은 `logs` 디렉토리에 저장됩니다:
- `logs/combined.log`: 모든 로그
- `logs/error.log`: 에러 로그만

로그 레벨은 `.env` 파일의 `LOG_LEVEL` 설정으로 조정할 수 있습니다.

## 📄 라이센스

이 프로젝트는 MIT 라이센스를 따릅니다. 
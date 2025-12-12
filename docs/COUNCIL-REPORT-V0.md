# AI Council Feature Development Report

**프로젝트**: Chatbot Gate
**작업 기간**: 2025-12-11
**브랜치**: `council-v0` (초기 개발)
**커밋 범위**: `11e2a22f`..`15f4c60`
**다음 단계**:  [COUNCIL-REPORT-V1.md](./COUNCIL-REPORT-V1.md) (아키텍처 리팩토링)

---

## 개요

Multi-LLM 협업 기반의 **AI Council** 기능을 처음부터 설계 및 구현한 작업 보고서입니다.

### 통계 요약

| 항목 | 수치 |
|------|------|
| 총 커밋 수 | 68 |
| 수정된 파일 수 | 42 |
| 추가된 코드 라인 | ~6,849 |
| Backend 신규 파일 | 12 |
| Frontend 신규 파일 | 22 |

### 커밋 유형 분포

| 유형 | 개수 | 설명 |
|------|------|------|
| feat | 24 | 신규 기능 구현 |
| fix | 28 | 버그 수정 |
| refactor | 7 | 코드 개선 |
| style | 5 | UI/스타일 조정 |
| config/chore | 4 | 설정 및 기타 |

---

## 아키텍처 개요

### 3단계 Council 프로세스

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Council Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: Individual Responses                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │ GPT-4o  │ │ Claude  │ │ Gemini  │ │ DeepSeek│  ...           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                │
│       │           │           │           │                     │
│       └───────────┴───────────┴───────────┘                     │
│                       │                                         │
│  Stage 2: Peer Review (Blind Evaluation)                        │
│  ┌─────────────────────────────────────────┐                    │
│  │  Each model ranks other models' answers │                    │
│  │  (Anonymized as Response A, B, C, D...) │                    │
│  └─────────────────────┬───────────────────┘                    │
│                        │                                        │
│  Stage 3: Chairman Synthesis                                    │
│  ┌─────────────────────────────────────────┐                    │
│  │  Claude synthesizes best response       │                    │
│  │  based on peer rankings                 │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend 구현

### 신규 파일 (12개, ~2,582 라인)

| 파일 | 라인 | 설명 |
|------|------|------|
| `services/councilService.ts` | 836 | Council 핵심 비즈니스 로직 |
| `services/openRouterService.ts` | 626 | OpenRouter API 통합 |
| `controllers/councilController.ts` | 435 | REST API 컨트롤러 |
| `services/processingRegistry.ts` | 363 | SSE 연결 관리 및 상태 추적 |
| `models/CouncilSession.ts` | 129 | MongoDB 스키마 |
| `routes/councilRoutes.ts` | 77 | Express 라우트 정의 |
| `services/titleService.ts` | 54 | AI 기반 제목 생성 |
| `constants/index.ts` | 30 | Council 상수 정의 |
| `config.ts` | +2 | OpenRouter API 키 추가 |
| `index.ts` | +16 | Council 라우트 마운트 |

### 핵심 기능

#### 1. OpenRouter 통합 (`openRouterService.ts`)
- 다중 LLM 프로바이더 통합 (GPT-4o, Claude, Gemini, DeepSeek, Qwen, Llama 등)
- 스트리밍 응답 지원 (`chatCompletionStream`)
- Extended thinking 지원 (`chatCompletionStreamWithReasoning`)
- 지수 백오프 재시도 로직

#### 2. SSE 스트리밍 아키텍처 (`processingRegistry.ts`)
- 실시간 스트리밍 이벤트 브로드캐스트
- 클라이언트 연결 관리 (다중 클라이언트 지원)
- 재연결 시 상태 복구 (replay)
- Grace period (30초) 후 자동 정리
- Abort 처리 및 리소스 정리

#### 3. Council 프로세스 (`councilService.ts`)
- Stage 1: 병렬 LLM 호출 및 스트리밍
- Stage 2: 익명화된 피어 리뷰 (Blind evaluation)
- Stage 3: Chairman 종합 (reasoning 포함)
- 세션 상태 영속화 (MongoDB)

### API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/council/sessions` | 세션 목록 조회 |
| POST | `/api/council/sessions` | 새 세션 생성 |
| GET | `/api/council/sessions/:id` | 세션 상세 조회 |
| DELETE | `/api/council/sessions/:id` | 세션 삭제 |
| POST | `/api/council/sessions/:id/message` | 메시지 전송 (SSE) |
| GET | `/api/council/sessions/:id/reconnect` | SSE 재연결 |
| POST | `/api/council/sessions/:id/abort` | 처리 중단 |

---

## Frontend 구현

### 신규 파일 (22개, ~2,696 라인)

| 파일 | 라인 | 설명 |
|------|------|------|
| `hooks/useCouncilChat.ts` | 542 | Council 채팅 상태 관리 |
| `app/(protected)/council/[sessionId]/page.tsx` | 478 | Council 채팅 페이지 |
| `components/council/Stage2Panel.tsx` | 247 | Stage 2 결과 패널 |
| `utils/streamUtils.ts` | 232 | SSE 스트리밍 유틸리티 |
| `components/council/CouncilSidebar.tsx` | 195 | 세션 사이드바 |
| `components/council/Stage3Panel.tsx` | 158 | Stage 3 결과 패널 |
| `components/council/StageProgress.tsx` | 153 | 진행 상태 표시 |
| `types/council.types.ts` | 146 | TypeScript 타입 정의 |
| `components/council/Stage1Panel.tsx` | 128 | Stage 1 결과 패널 |
| `hooks/useCouncilSessions.ts` | 102 | 세션 목록 관리 |
| `app/(protected)/council/page.tsx` | 98 | Council 인덱스 페이지 |
| `apis/council.api.ts` | 48 | API 클라이언트 |
| `components/council/MarkdownRenderer.tsx` | 25 | Markdown 렌더러 |
| `app/globals.css` | +114 | 커스텀 스크롤바 등 |

### 핵심 기능

#### 1. 실시간 스트리밍 UI
- Stage 1/2/3 각각 실시간 텍스트 스트리밍
- 진행 상태 인디케이터 (체크마크/X 아이콘)
- Abort 버튼으로 중단 가능

#### 2. SSE 재연결 (`streamUtils.ts`)
- 페이지 이탈 후 복귀 시 자동 재연결
- 이전 상태 replay 지원
- AbortController 기반 연결 관리

#### 3. 세션 관리
- 사이드바에서 세션 목록 표시
- AI 자동 제목 생성
- 세션 삭제 기능
- Tooltip으로 긴 제목 표시

#### 4. 결과 표시
- Stage 1: 각 모델별 응답 탭
- Stage 2: 피어 리뷰 결과 + 종합 랭킹
- Stage 3: Chairman 최종 답변 + Reasoning
- Markdown/LaTeX 렌더링 지원

---

## 주요 기능별 커밋 히스토리

### 초기 구현
```
11e2a22 feat(council): add AI Council backend with multi-LLM collaboration
ac99f17 feat(council): add AI Council frontend with SSE streaming UI
```

### 스트리밍 강화
```
67f7c4a feat(council): implement real-time streaming for Stage 1 responses
6154c50 feat(council): implement real-time streaming for Stage 2 and 3
34f829e feat(council): stream reasoning process for Stage 3 Chairman
```

### SSE 재연결
```
3ff998c feat(council): preserve abort state and add SSE reconnection
04916ae fix(council): fix SSE reconnection replay logic
7a7768c fix(council): simplify reconnection by ignoring chunks (v3)
```

### Abort 처리
```
35a704d feat(council): abort backend processing when client disconnects
df639a5 fix(council): abort processing immediately on client disconnect
d5d19c6 fix(council): cleanup registry on client disconnect to prevent stuck reconnects
b863573 refactor(council): add processingRegistry.abort() and red X indicator
```

### Chairman 개선
```
f60e974 feat(council): anonymize Chairman input for blind evaluation
5670ade feat(council): match Chairman output language to user question
be3acfa refactor(council): simplify Chairman output with positive prompting
```

### UI/UX 개선
```
e1258a6 feat(council): add token usage display and Markdown rendering
f2b6b40 feat(council): add LaTeX rendering and sidebar title tooltip
0a64691 feat(council): add AI-powered title generation for sessions
7dd2923 feat(council): singleton input with abort button
```

### 리소스 누수 수정
```
a5c640e fix(frontend): address browser resource leaks
37d3ba8 fix(backend): address server-side resource leaks
e7eaacb fix(frontend): address additional resource leak feedback
15f4c60 fix(backend): close SSE clients on complete and cleanup stale gate buckets
```

---

## 리소스 누수 수정 상세

### Frontend

| 파일 | 문제 | 해결 |
|------|------|------|
| `page.tsx` (gate) | setTimeout 미정리 | useEffect cleanup 추가 |
| `useCouncilChat.ts` | 언마운트 후 setState | isMountedRef 패턴 |
| `useCouncilSessions.ts` | 언마운트 후 setState | isMountedRef 패턴 |
| `streamUtils.ts` | reader.releaseLock() | reader.cancel()로 변경 |

### Backend

| 파일 | 문제 | 해결 |
|------|------|------|
| `index.ts` | 파일 핸들 미정리 | Graceful shutdown 추가 |
| `openRouterService.ts` | Stream reader 미정리 | finally에서 releaseLock() |
| `councilService.ts` | 무한 대기 가능 | 30초 타임아웃 추가 |
| `rateLimiter.ts` | 긴 cleanup 주기 | 5분→1분 단축 |
| `processingRegistry.ts` | SSE 클라이언트 미종료 | closeClients() 헬퍼 추가 |
| `gateService.ts` | Map 무한 성장 | 주기적 cleanup 추가 |

---

## 적용된 설계 패턴

### Backend
- **Registry Pattern**: ProcessingRegistry로 활성 연결 관리
- **Generator Pattern**: AsyncGenerator로 SSE 이벤트 스트리밍
- **Graceful Shutdown**: SIGTERM/SIGINT 핸들러
- **Exponential Backoff**: API 재시도 로직

### Frontend
- **Custom Hooks**: useCouncilChat, useCouncilSessions
- **isMountedRef Pattern**: 언마운트 안전성
- **AbortController**: 요청 취소 관리
- **SSE with Reconnection**: 상태 복구 지원

---

## 기술 스택

### Backend
- Express.js + TypeScript
- MongoDB (Mongoose)
- OpenRouter API (다중 LLM)
- SSE (Server-Sent Events)

### Frontend
- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS
- Framer Motion
- KaTeX (LaTeX 렌더링)
- react-markdown

---

## 테스트 및 검증

- 모든 변경사항 TypeScript 빌드 (`npm run build`) 통과
- 수동 테스트로 SSE 스트리밍, 재연결, Abort 기능 검증
- 리소스 누수 패턴 코드 리뷰 완료

---

## 향후 개선 사항

1. **자동화 테스트**: E2E 테스트 추가
2. **에러 처리**: 사용자 친화적 에러 메시지
3. **성능 모니터링**: LLM 응답 시간 메트릭

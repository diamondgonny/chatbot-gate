# AI Council Architecture Refactoring Report

**프로젝트**: Chatbot Gate
**작업 기간**: 2025-12-11
**브랜치**: council
**커밋 범위**: `ef3ea08c`..`6f76ba0`

---

## 개요

AI Council 기능의 **대규모 아키텍처 리팩토링** 작업 보고서입니다. Backend와 Frontend 모두 기존 모놀리식 구조에서 모듈화된 레이어 아키텍처로 전환되었습니다.

### 통계 요약

| 항목 | 수치 |
|------|------|
| 총 커밋 수 | 19 |
| 수정된 파일 수 | 56 |
| 추가된 코드 라인 | +4,342 |
| 삭제된 코드 라인 | -1,741 |
| 순 변경 | +2,601 |

### 커밋 유형 분포

| 유형 | 개수 | 설명 |
|------|------|------|
| fix | 10 | 버그 수정 (race condition, memory leak, graceful shutdown) |
| style | 4 | UI/스타일 조정 |
| feat | 3 | 신규 기능 (입력 제한, 모델 업데이트) |
| refactor | 2 | 아키텍처 리팩토링 |

---

## 아키텍처 개요

### 3단계 Council 프로세스

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Council Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stage 1: Individual Responses                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ GPT-4o  │ │ Claude  │ │ Gemini  │ │ DeepSeek│  ...         │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘              │
│       │           │           │           │                    │
│       └───────────┴───────────┴───────────┘                    │
│                       │                                         │
│  Stage 2: Peer Review (Blind Evaluation)                       │
│  ┌─────────────────────────────────────────┐                   │
│  │  Each model ranks other models' answers │                   │
│  │  (Anonymized as Response A, B, C, D...) │                   │
│  └─────────────────────┬───────────────────┘                   │
│                        │                                        │
│  Stage 3: Chairman Synthesis                                   │
│  ┌─────────────────────────────────────────┐                   │
│  │  Claude synthesizes best response       │                   │
│  │  based on peer rankings                 │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Backend 서비스 분해 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     Controller Layer                             │
│              councilController.ts (435 lines)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                          │
        ▼                                          ▼
┌───────────────────────┐              ┌───────────────────────┐
│   Core Council Layer  │              │   SSE Infrastructure  │
│   services/council/   │              │   services/council-sse│
│      (825 lines)      │              │      (572 lines)      │
├───────────────────────┤              ├───────────────────────┤
│ councilSessionService │              │ ProcessingRegistry    │
│ councilOrchestrator   │◄────────────►│   ├─ SSEJobTracker    │
│ councilRankingService │              │   ├─ SSEClientManager │
│ councilHistoryBuilder │              │   ├─ SSEEventAccumul. │
│                       │              │   ├─ SSEBroadcaster   │
│                       │              │   └─ SSELifecycleMgr  │
└───────────────────────┘              └───────────────────────┘
```

### Frontend 4-Layer 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                      Page Layer (127 lines)                     │
│              app/(protected)/council/[sessionId]/page.tsx       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    State Layer (552 lines)                      │
│                     hooks/council/                              │
│     useCouncilState + useCouncilStream + CouncilContext         │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                          │
        ▼                                          ▼
┌───────────────────────┐              ┌───────────────────────┐
│   Service Layer       │              │   Domain Layer        │
│ services/council/     │              │  domain/council/      │
│    (691 lines)        │              │    (385 lines)        │
├───────────────────────┤              ├───────────────────────┤
│ councilApi            │              │ types                 │
│ streamClient          │              │ modelMapping          │
│ streamEventProcessor  │              │ rankingCalculations   │
│                       │              │ messageReconstruction │
└───────────────────────┘              └───────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     UI Layer (1,507 lines)                      │
│                    components/council/                          │
│     MessageList/* + InputArea/* + Stage*Panel + Sidebar         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend 구현

### 서비스 레이어 구조

#### Core Council Layer (`services/council/`, 825 lines)

| 파일 | 라인 | 책임 |
|------|------|------|
| `councilSessionService.ts` | 123 | 세션 CRUD, 유효성 검사 |
| `councilOrchestrator.ts` | 559 | 3단계 LLM 파이프라인 오케스트레이션 |
| `councilRankingService.ts` | 77 | 랭킹 파싱 및 집계 |
| `councilHistoryBuilder.ts` | 29 | 대화 컨텍스트 빌더 |
| `index.ts` | 37 | Barrel export (Facade) |

#### SSE Infrastructure Layer (`services/council-sse/`, 572 lines)

| 파일 | 라인 | 책임 |
|------|------|------|
| `index.ts` | 140 | ProcessingRegistry Facade |
| `sseJobTracker.ts` | 124 | 활성 작업 레지스트리 |
| `sseLifecycleManager.ts` | 150 | Grace period, 정리, 종료 |
| `sseEventAccumulator.ts` | 79 | 이벤트 상태 누적 (재연결용) |
| `sseClientManager.ts` | 58 | SSE 클라이언트 생명주기 |
| `sseBroadcaster.ts` | 21 | 이벤트 브로드캐스트 |

#### 지원 파일

| 파일 | 라인 | 설명 |
|------|------|------|
| `councilService.ts` | 40 | 하위 호환성용 re-export |
| `types/council.ts` | 55 | 타입 정의 (SSEEvent 등) |
| `utils/partialResultBuilder.ts` | 56 | Abort 복구 유틸리티 |

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

### 4-Layer 아키텍처 상세

#### Layer 1: Domain Layer (`domain/council/`, 385 lines)

**특징**: React 의존성 없음, 순수 TypeScript 비즈니스 로직

| 파일 | 라인 | 책임 |
|------|------|------|
| `types.ts` | 67 | CurrentStage, ModelMapping, StreamState 등 |
| `modelMapping.ts` | 90 | 모델명 포맷팅, 라벨↔모델 매핑 |
| `rankingCalculations.ts` | 122 | 랭킹 파싱, 집계, 승자 판정 |
| `messageReconstruction.ts` | 71 | 메시지 표시 데이터 계산 |
| `index.ts` | 35 | Public API exports |

#### Layer 2: Service Layer (`services/council/`, 691 lines)

**특징**: HTTP/SSE 통신 담당

| 파일 | 라인 | 책임 |
|------|------|------|
| `councilApi.ts` | 99 | REST API 호출 |
| `streamClient.ts` | 209 | SSE 스트리밍 (fetch + ReadableStream) |
| `streamEventProcessor.ts` | 356 | 이벤트 상태 머신, 콜백 발행 |
| `index.ts` | 27 | Public API re-exports |

#### Layer 3: State Layer (`hooks/council/`, 552 lines)

**특징**: React 상태 관리 + Context API

| 파일 | 라인 | 책임 |
|------|------|------|
| `useCouncilState.ts` | 246 | 중앙 상태 관리 |
| `useCouncilStream.ts` | 244 | SSE 스트림 관리 |
| `CouncilContext.tsx` | 282 | Context Provider |
| `index.ts` | 20 | Public hook exports |

#### Layer 4: UI Layer (`components/council/`, 1,507 lines)

**MessageList 컴포넌트**

| 파일 | 라인 | 책임 |
|------|------|------|
| `MessageList.tsx` | 124 | 메시지 목록 컨테이너 |
| `StreamingMessage.tsx` | 133 | 실시간 스트리밍 메시지 |
| `AssistantMessage.tsx` | 73 | 완료된 어시스턴트 메시지 |
| `ErrorMessage.tsx` | 46 | 에러 표시 |
| `PendingMessage.tsx` | 33 | 대기 중 메시지 |
| `UserMessage.tsx` | 27 | 사용자 메시지 |

**기타 컴포넌트**

| 파일 | 라인 | 책임 |
|------|------|------|
| `Stage2Panel.tsx` | 239 | Stage 2 결과 패널 |
| `CouncilSidebar.tsx` | 195 | 세션 사이드바 |
| `InputArea.tsx` | 163 | 입력 영역 (자동 확장) |
| `StageProgress.tsx` | 153 | 진행 상태 표시 |
| `Stage3Panel.tsx` | 150 | Stage 3 결과 패널 |
| `Stage1Panel.tsx` | 118 | Stage 1 결과 패널 |
| `MarkdownRenderer.tsx` | 25 | Markdown 렌더러 |

### 아키텍처 개선 효과

| 지표 | Before | After | 변화 |
|------|--------|-------|------|
| page.tsx 라인 수 | 478 | 127 | -73% |
| 중복 함수 | 4+ | 0 | -100% |
| Props drilling 깊이 | 4+ 레벨 | 0 (Context) | 제거 |
| 비즈니스 로직 결합도 | 높음 | 없음 | 완전 분리 |

---

## 주요 커밋 히스토리

### 아키텍처 리팩토링

```
cdf1067 refactor(backend): decompose council services for low coupling, high cohesion
5e8682c refactor(frontend): restructure council feature with 4-layer architecture
```

### Graceful Shutdown 개선

```
fd93143 fix(backend): implement proper graceful shutdown to prevent resource leaks
9163916 fix(backend): await server.close and add active sessions cleanup
9176e1f fix(backend): await connectDB, filter empty codes, cleanup timeout
```

### Race Condition / Memory Leak 수정

```
3d861de fix(backend): prevent race condition in SSE processing registry
0c36c70 fix(frontend): prevent race condition and memory leak in loadSession
95cecef fix(frontend): clear pendingMessage on stream completion
3b273f3 fix(frontend): fix council loading cancellations and memoize actions
```

### UI/UX 개선

```
8c2659a feat(frontend): enhance council input with auto-expand textarea
9ff1dc3 feat(frontend): add input character limits
58dee08 fix(frontend): use custom delete modal for council sessions
4ace857 fix(frontend): enforce single-scroll layout for council pages
a00e61b style(frontend): align chat UI with council style
```

### 모델 업데이트

```
6f76ba0 feat(backend): update council member models to latest versions
```

---

## 버그 수정 상세

### Race Condition 수정

| 위치 | 문제 | 해결 |
|------|------|------|
| `processingRegistry` | 동시 요청 시 상태 충돌 | AbortController 매칭으로 stale 요청 무시 |
| `loadSession` | 빠른 세션 전환 시 이전 요청 덮어쓰기 | `loadSessionIdRef`로 최신 요청만 적용 |
| `useCouncilSessions` | 동시 API 호출로 중복 데이터 | 요청 중복 방지 플래그 |

### Memory Leak 수정

| 위치 | 문제 | 해결 |
|------|------|------|
| `useCouncilStream` | 언마운트 후 setState | `isMountedRef` 패턴 |
| `streamClient` | AbortController 미정리 | cleanup 함수에서 abort() 호출 |
| `pendingMessage` | 스트림 완료 후 미정리 | `stream_complete` 이벤트에서 clear |

### Graceful Shutdown 개선

| 파일 | 개선 사항 |
|------|------|
| `index.ts` | `server.close()` await, 활성 세션 정리 |
| `processingRegistry` | `shutdown()` 메서드로 모든 작업 중단 |
| `sseLifecycleManager` | 타이머 정리, 클라이언트 종료 |

---

## 적용된 설계 패턴

### Backend

| 패턴 | 적용 위치 | 설명 |
|------|----------|------|
| **Facade** | ProcessingRegistry | 5개 SSE 서비스를 단일 API로 통합 |
| **AsyncGenerator** | councilOrchestrator | 스트리밍 이벤트 yield, 재연결 지원 |
| **State Accumulation** | SSEEventAccumulator | 재연결 시 상태 복구용 이벤트 누적 |
| **Grace Period** | SSELifecycleManager | 30초 재연결 윈도우 |

### Frontend

| 패턴 | 적용 위치 | 설명 |
|------|----------|------|
| **4-Layer Architecture** | 전체 구조 | Domain/Service/State/UI 분리 |
| **Context API** | CouncilContext | Props drilling 제거 |
| **Event Processor** | StreamEventProcessor | React 분리된 이벤트 상태 머신 |
| **isMountedRef** | hooks | 언마운트 후 setState 방지 |

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
- Race condition 시나리오 (빠른 세션 전환) 테스트
- Graceful shutdown 시나리오 테스트

# AI Council Architecture Report V2

**프로젝트**: Chatbot Gate
**작업 기간**: 2025-12-12 ~ 12-14
**브랜치**: `council` (Feature-Based 아키텍처 전환)
**커밋 범위**: `467afffb`..`38910ad`
**이전 단계**: [COUNCIL-REPORT-V1.md](./COUNCIL-REPORT-V1.md) (초기 아키텍처 리팩토링)

---

## 개요

대규모 **Feature-Based 아키텍처 전환** 작업 보고서입니다. Backend와 Frontend 모두 기존 계층별 분산 구조에서 **기능(Feature) 중심의 구조**로 재편되었습니다.

### 통계 요약

| 항목 | V1 | V2 | 변화 |
|------|-----|-----|------|
| 총 커밋 수 | 32 | 50 | +18 |
| 수정된 파일 수 | 66 | 213 | +147 |
| 추가된 코드 라인 | +5,566 | +12,205 | +6,639 |
| 삭제된 코드 라인 | -2,326 | -3,651 | -1,325 |
| 순 변경 | +3,240 | +8,554 | +5,314 |

### 코드 통계

| 영역 | 모듈 | LOC | 비중 |
|------|------|-----|------|
| **Backend** | Council Feature | 1,910 | 32.6% |
| | Chat Feature | 449 | 7.7% |
| | Shared | 1,731 | 29.6% |
| | 기타 (entry, tests) | 1,767 | 30.2% |
| | **합계** | **5,857** | |
| **Frontend** | Council Feature | 3,939 | 65.8% |
| | Chat Feature | 1,018 | 17.0% |
| | Shared | 304 | 5.1% |
| | 기타 (pages, layout) | 722 | 12.1% |
| | **합계** | **5,983** | |

### 커밋 유형 분포

| 유형 | 개수 | 설명 |
|------|------|------|
| refactor | 33 | Feature-based 아키텍처 전환, 4-layer 구조, SRP 적용, Chat API 통합 |
| fix | 9 | SSE 메트릭 일관성, 리소스 누수 방지, IDE 지원 |
| test | 2 | 통합 테스트 추가, Vitest 마이그레이션 |
| chore | 3 | 의존성 업데이트, ESLint 설정, 보안 취약점 수정 |
| docs | 2 | README, 리포트 정리 |

### 주요 변경 하이라이트

- **Feature 캡슐화**: 기능별 독립 모듈로 완전 분리
- **"Shared is leaf" 원칙**: 공유 모듈은 다른 feature를 import하지 않음
- **4-Layer 아키텍처**: Domain/Services/State/UI 명확한 책임 분리
- **SSE 인프라 분해**: 단일 Registry에서 5개 전문 서비스로 분리
- **Vitest 마이그레이션**: Jest에서 Vitest로 테스트 프레임워크 전환

---

## 아키텍처 개요

### 3단계 Council 프로세스 (V1 유지)

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
│  │  Chairman synthesizes best response     │                    │
│  │  based on the review (Still anonymized) │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Feature-Based 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐     ┌─────────────────────┐            │
│  │   Council Feature   │     │    Chat Feature     │            │
│  │   (High Complexity) │     │  (Low Complexity)   │            │
│  ├─────────────────────┤     ├─────────────────────┤            │
│  │ • 3-stage Pipeline  │     │ • Single LLM Call   │            │
│  │ • SSE Streaming     │     │ • Request/Response  │            │
│  │ • Multi-model       │     │ • Simple Session    │            │
│  │ • Peer Review       │     │                     │            │
│  └──────────┬──────────┘     └──────────┬──────────┘            │
│             │                           │                       │
│             └───────────┬───────────────┘                       │
│                         │                                       │
│             ┌───────────▼───────────────┐                       │
│             │     Shared Module         │                       │
│             │  (Types, Utils, Config)   │                       │
│             │                           │                       │
│             │   "Shared is leaf"        │                       │
│             │  Never imports features   │                       │
│             └───────────────────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend 아키텍처

### 디렉토리 구조

```
backend/src/
├── features/                    # Feature 모듈 (캡슐화)
│   ├── council/                 # Council Feature (1,910 LOC)
│   │   ├── controllers/         # HTTP 엔드포인트
│   │   ├── routes/              # Express 라우팅
│   │   ├── services/            # 비즈니스 로직 (1,159 LOC)
│   │   │   ├── orchestrator.service.ts    # 3-stage 파이프라인
│   │   │   ├── session.service.ts         # 세션 CRUD
│   │   │   ├── persistence.service.ts     # DB 저장 로직
│   │   │   ├── ranking.service.ts         # 랭킹 집계
│   │   │   └── history.service.ts         # 대화 컨텍스트
│   │   ├── sse/                 # SSE 인프라 (710 LOC)
│   │   │   ├── processingRegistry.ts      # Facade
│   │   │   ├── sseJobTracker.ts           # 작업 레지스트리
│   │   │   ├── sseClientManager.ts        # 클라이언트 관리
│   │   │   ├── sseEventAccumulator.ts     # 이벤트 누적
│   │   │   ├── sseBroadcaster.ts          # 이벤트 전파
│   │   │   └── sseLifecycleManager.ts     # 생명주기 관리
│   │   └── index.ts             # Feature 진입점
│   │
│   └── chat/                    # Chat Feature (449 LOC)
│       ├── chat.controller.ts   # 통합 컨트롤러 (6개 핸들러)
│       ├── chat.routes.ts       # 통합 라우터 (RESTful)
│       ├── index.ts             # Feature 진입점
│       └── services/            # 4-layer 패턴 적용 (241 LOC)
│           ├── message.service.ts         # 메시지 오케스트레이션
│           ├── session.service.ts         # 세션 관리
│           ├── validation.service.ts      # 유효성 검사
│           └── openai.service.ts          # LLM 통신
│
├── shared/                      # 공유 모듈 (1,731 LOC)
│   ├── config/                  # 설정
│   ├── constants/               # 상수
│   ├── middleware/              # 미들웨어
│   ├── models/                  # Mongoose 모델
│   ├── types/                   # 타입 정의
│   └── utils/                   # 유틸리티
│
└── index.ts                     # 앱 진입점
```

### Council Feature (1,910 LOC)

#### Services Layer (1,159 LOC)

| 파일 | 라인 | 책임 |
|------|------|------|
| `orchestrator.service.ts` | 627 | 3단계 LLM 파이프라인, Lite/Ultra 모드 라우팅 |
| `session.service.ts` | 131 | 세션 CRUD, 유효성 검사 |
| `persistence.service.ts` | 78 | DB 저장 로직 분리 (SRP) |
| `ranking.service.ts` | 77 | 랭킹 파싱 및 집계 |
| `history.service.ts` | 29 | 대화 컨텍스트 빌더 |
| `index.ts` | 20 | Barrel export |

#### SSE Layer (710 LOC)

| 파일 | 라인 | 책임 |
|------|------|------|
| `processingRegistry.ts` | 159 | 5개 SSE 서비스 Facade |
| `sseJobTracker.ts` | 124 | 활성 작업 레지스트리 |
| `sseLifecycleManager.ts` | 167 | Grace period, 정리, 종료 |
| `sseEventAccumulator.ts` | 79 | 이벤트 상태 누적 (재연결용) |
| `sseClientManager.ts` | 62 | SSE 클라이언트 생명주기 |
| `sseBroadcaster.ts` | 21 | 이벤트 브로드캐스트 |

**SSE Facade 패턴**:
```
┌─────────────────────────────────────────────────────────────────┐
│                   ProcessingRegistry (Facade)                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ JobTracker  │  │ ClientMgr   │  │ Accumulator │              │
│  │   (124)     │  │    (62)     │  │    (79)     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │LifecycleMgr │  │ Broadcaster │                               │
│  │   (167)     │  │    (21)     │                               │
│  └─────────────┘  └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

### Chat Feature (449 LOC)

4-Layer 패턴을 간소화하여 적용한 경량 feature입니다.

| 파일 | 라인 | 책임 |
|------|------|------|
| `chat.controller.ts` | 106 | 통합 컨트롤러 (6개 핸들러) |
| `chat.routes.ts` | 62 | RESTful 라우팅 |
| `message.service.ts` | 116 | 메시지 흐름 오케스트레이션 |
| `session.service.ts` | 50 | 세션 조회/생성 |
| `validation.service.ts` | 35 | 입력 유효성 검사 |
| `openai.service.ts` | 40 | OpenAI API 통신 |

### Shared 모듈 (1,731 LOC)

**"Shared is leaf" 원칙**: 공유 모듈은 절대 feature 모듈을 import하지 않습니다.

| 디렉토리 | 라인 | 내용 |
|----------|------|------|
| `config/` | 121 | 환경 설정, OpenRouter 구성 |
| `constants/` | 195 | Council 상수, 모델 목록 |
| `middleware/` | 258 | Auth, Rate Limiter, CSRF |
| `models/` | 350 | ChatSession, CouncilSession 스키마 |
| `types/` | 180 | 공유 타입 정의 |
| `utils/` | 215 | 메트릭스, 유틸리티 |

---

## Frontend 아키텍처

### 디렉토리 구조

```
frontend/
├── app/                         # Next.js App Router
│   ├── (protected)/
│   │   ├── council/             # Council 페이지
│   │   └── chat/                # Chat 페이지
│   └── ...
│
├── features/                    # Feature 모듈
│   ├── council/                 # Council Feature (3,939 LOC)
│   │   ├── domain/              # 순수 비즈니스 로직 (558 LOC)
│   │   ├── services/            # HTTP/SSE 통신 (690 LOC)
│   │   ├── state/               # React 상태 관리 (635 LOC)
│   │   └── ui/                  # UI 컴포넌트 (1,056 LOC)
│   │
│   └── chat/                    # Chat Feature (1,018 LOC)
│       ├── domain/
│       ├── services/
│       ├── state/
│       └── ui/
│
└── shared/                      # 공유 모듈 (304 LOC)
    ├── api/                     # Axios 클라이언트
    ├── auth/                    # 인증 유틸리티
    └── utils/                   # 공통 유틸리티
```

### Council Feature (3,939 LOC)

#### Layer 1: Domain Layer (558 LOC)

**특징**: React 의존성 없음, 순수 TypeScript

| 파일 | 라인 | 책임 |
|------|------|------|
| `types.ts` | 125 | CurrentStage, ModelMapping, StreamState 등 |
| `modelMapping.ts` | 105 | 모델명 포맷팅, 라벨↔모델 매핑 |
| `rankingCalculations.ts` | 145 | 랭킹 파싱, 집계, 승자 판정 |
| `messageReconstruction.ts` | 95 | 메시지 표시 데이터 계산 |
| `index.ts` | 40 | Public API exports |

#### Layer 2: Services Layer (690 LOC)

**특징**: HTTP/SSE 통신 전담

| 파일 | 라인 | 책임 |
|------|------|------|
| `councilApi.ts` | 120 | REST API 호출 |
| `streamClient.ts` | 230 | SSE 스트리밍 (fetch + ReadableStream) |
| `streamEventProcessor.ts` | 305 | 이벤트 상태 머신, 콜백 발행 |
| `index.ts` | 35 | Public API exports |

#### Layer 3: State Layer (635 LOC)

**특징**: React 상태 관리 + Context API

| 파일 | 라인 | 책임 |
|------|------|------|
| `useCouncilState.ts` | 195 | 중앙 상태 관리 |
| `useCouncilStream.ts` | 180 | SSE 스트림 관리 |
| `CouncilContext.tsx` | 230 | Context Provider |
| `index.ts` | 30 | Public hook exports |

#### Layer 4: UI Layer (1,056 LOC)

| 컴포넌트 | 라인 | 책임 |
|----------|------|------|
| `messageList/` | 500 | 메시지 목록 (Streaming, Assistant, User, Error, Pending) |
| `inputArea/` | 290 | 입력 영역 (자동 확장, ModeToggle) |
| `stagePanel/` | 180 | Stage 1/2/3 결과 패널 |
| `CouncilSidebar.tsx` | 86 | 세션 사이드바 |

### Chat Feature (1,018 LOC)

Council과 동일한 4-Layer 패턴을 경량화하여 적용:

| Layer | 라인 | 주요 파일 |
|-------|------|----------|
| Domain | 150 | types.ts, sessionUtils.ts |
| Services | 180 | chatApi.ts |
| State | 220 | useChatState.ts, ChatContext.tsx |
| UI | 468 | messageList/, inputArea/, ChatSidebar.tsx |

### 아키텍처 개선 효과

| 지표 | V1 | V2 | 변화 |
|------|--------|-------|------|
| Feature 캡슐화 | 부분적 | 완전 | 100% |
| Layer 분리 | 4 layers | 4 layers | 명확화 |
| 공유 모듈 의존성 | 양방향 | 단방향 | "Leaf" 원칙 |
| 테스트 가능성 | 중간 | 높음 | 향상 |

---

## 설계 원칙

### 1. 결합도 ↓ / 응집도 ↑

**Before (V1)**:
```typescript
// orchestrator가 SSE 핸들링, 저장, 비즈니스 로직 모두 담당
async function* orchestrateCouncil(...) {
  // SSE 클라이언트 관리 (결합)
  // DB 저장 (결합)
  // 비즈니스 로직
}
```

**After (V2)**:
```typescript
// 각 서비스가 단일 책임
orchestrator.service.ts  → 비즈니스 로직만
persistence.service.ts   → DB 저장만
sse/processingRegistry.ts → SSE 인프라만
```

### 2. "Shared is leaf" 원칙

```
✅ features/council → shared (OK)
✅ features/chat → shared (OK)
❌ shared → features/* (NEVER)
```

이 원칙으로 순환 의존성을 원천 차단합니다.

### 3. Feature 캡슐화

각 feature는 자체적으로 완결된 구조를 가집니다:
- **controllers/**: HTTP 엔드포인트
- **routes/**: Express 라우팅
- **services/**: 비즈니스 로직
- **sse/** (council만): SSE 인프라

외부에서는 feature의 `index.ts`만 import합니다.

---

## 리팩토링 요약 (P1-P13)

| 단계 | 목표 | 주요 변경 |
|------|------|----------|
| P1 | Registry 캡슐화 | 메서드 기반 접근, 내부 Map 조작 제거 |
| P2 | SSE 핸들링 분리 | orchestrator → sseBroadcaster, sseClientManager, sseLifecycleManager |
| P3 | Persistence 분리 | 저장 로직을 persistence.service로 분리, chairmanModel 파라미터화 |
| P4-P5 | Chat 서비스 정리 | 단일 chatService → 4개 전문 서비스 분해 |
| P6-P7 | 메트릭 일관성 | 모든 종료 경로에서 councilSseConnections.dec() 보장 |
| P8 | Backend 리소스 누수 | abort 리스너 정리, interval 중복 방지, grace period unref() |
| P9 | Frontend 리소스 누수 | cleanupReader 헬퍼, AbortController 정리, AbortSignal 지원 |
| P10 | Shared 정리 | timeUtils를 shared/utils로 이동, 중복 제거 |
| P11 | 네이밍 컨벤션 | 폴더 camelCase, 컴포넌트 PascalCase |
| P12 | 미들웨어 누수 | res.once(), 클린업 인터벌 싱글톤, isShuttingDown 플래그 |
| P13 | Chat API 통합 | controller/routes 병합, RESTful URL 패턴 적용 |

---

## 커밋 히스토리

### Feature-Based 아키텍처 전환

```
2025-12-12
c9ac5df refactor(backend): migrate to feature-based architecture
d428fed refactor(frontend): migrate to feature-based architecture
a7f9e23 refactor(backend): apply 4-layer pattern to council feature
bc83f21 refactor(frontend): complete 4-layer migration for council
```

### Services Layer 분해

```
2025-12-13
e5d8a12 refactor(backend): extract SSE handling from orchestrator
f7c2b34 refactor(backend): create persistence.service for DB operations
8b4e567 refactor(backend): decouple chairmanModel from persistence
3a9c8d1 refactor(backend): decompose chat service into 4 layers
5e2f789 refactor(backend): add validation service for chat
```

### 리소스 누수 방지

```
2025-12-14
9f2d0d5 fix(backend): ensure SSE metric consistency and reduce persistence coupling
076f442 fix(backend): prevent resource leaks in timers and listeners
be02466 fix(backend): prevent additional resource leaks
5e42755 fix(frontend): prevent resource leaks in SSE streams and API requests
5034f3f fix(backend): prevent resource leaks in middleware and SSE lifecycle
```

### 테스트 및 빌드 개선

```
2025-12-14
41c3d77 refactor(backend): migrate from Jest to Vitest
8a3dc47 chore(deps): update dependencies and fix security vulnerability
0ed204e fix(frontend): resolve all lint errors and warnings
```

### API 및 코드 정리

```
2025-12-14
fa9fc9b refactor(frontend): move timeUtils to shared utilities
277e374 refactor(frontend): rename component folders to camelCase
266d378 refactor(api): rename /api/sessions to /api/chat/sessions
0a17ec5 refactor(api): unify controller and routes to match council pattern
```

---

## 기술 스택

### Backend

| 기술 | 버전 | 용도 |
|------|------|------|
| Express.js | 4.x | HTTP 서버 |
| TypeScript | 5.x | 타입 안전성 |
| MongoDB | 7.0 | 데이터 저장 |
| Mongoose | 8.x | ODM |
| OpenRouter API | - | 다중 LLM 통합 |
| Vitest | 3.x | 테스트 (Jest에서 마이그레이션) |
| Prometheus | - | 메트릭스 |

### Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 16 | App Router |
| React | 19 | UI 프레임워크 |
| TypeScript | 5.x | 타입 안전성 |
| Tailwind CSS | 4.x | 스타일링 |
| Framer Motion | 12.x | 애니메이션 |
| KaTeX | - | LaTeX 렌더링 |
| react-markdown | - | Markdown 렌더링 |

---

## 테스트 및 검증

### 자동화 테스트

```bash
# Backend 테스트 (Vitest)
npm run test        # 48개 테스트 통과

# TypeScript 빌드
npm run build       # 성공
```

### 수동 테스트

- SSE 스트리밍 및 재연결
- Abort 처리 및 부분 결과 저장
- Lite/Ultra 모드 전환
- 세션 CRUD 작업
- 메트릭스 정확성 (Prometheus)

---

## 결론

V1에서 도입된 4-Layer 아키텍처를 기반으로, V2에서는 **Feature-Based 캡슐화**와 **"Shared is leaf" 원칙**을 적용하여 더욱 명확한 모듈 경계를 확립했습니다.

### 주요 성과

1. **기능별 독립성**: Council과 Chat이 완전히 분리된 feature 모듈로 존재
2. **단일 책임 원칙**: 각 서비스가 하나의 책임만 담당
3. **테스트 용이성**: Vitest 마이그레이션으로 더 빠른 테스트 실행
4. **메트릭 정확성**: SSE 연결 Gauge의 일관된 관리
5. **의존성 방향성**: 공유 모듈이 feature를 import하지 않는 명확한 구조
6. **리소스 누수 방지**: Frontend SSE 스트림/API 요청 및 Backend 미들웨어의 체계적인 정리
7. **코드 컨벤션 통일**: 폴더는 camelCase, 컴포넌트 파일은 PascalCase 규칙 적용

### Council vs Chat 복잡도

| 항목 | Council | Chat | 비율 |
|------|---------|------|------|
| Backend LOC | 1,910 | 449 | 4.3x |
| Frontend LOC | 3,939 | 1,018 | 3.9x |
| SSE 인프라 | 710 LOC | 없음 | - |
| Stage 수 | 3 | 1 | 3x |
| 모델 수 | 5+ | 1 | 5x+ |

이 아키텍처는 향후 새로운 feature 추가나 기존 feature 수정 시에도 영향 범위를 최소화할 수 있는 기반을 제공합니다.

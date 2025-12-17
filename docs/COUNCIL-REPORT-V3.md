# AI Council Architecture Report V3

**프로젝트**: Chatbot Gate
**작업 기간**: 2025-12-14 ~ 12-17
**브랜치**: `council` (구조 정합성 + 성능/안정성 개선)
**커밋 범위**: `09ef801`..`7620cda`
**이전 단계**: [COUNCIL-REPORT-V2.md](./COUNCIL-REPORT-V2.md) (Feature-Based 아키텍처 전환)

---

## 개요

09ef 커밋 이후에는 **대규모 구조 정리**와 **운영 안정성/성능 개선**이 집중적으로 이루어졌습니다. Backend는 Feature 폴더 표준화와 `@shared` 경로 별칭으로 모듈 경계를 명확히 했고, Frontend는 Feature Slice 구조로 재정렬하여 일관된 디렉토리 규약을 확립했습니다. 동시에 Council 스트리밍 안정화, UI/UX 개선, 모니터링 대시보드 정비, 주석 한글화가 진행되었습니다.

### 코드 통계

| 영역 | 모듈 | LOC | 비중 |
|------|------|-----|------|
| **Backend** | Council Feature | 2,551 | 43.4% |
| | Chat Feature | 774 | 13.2% |
| | Gate Feature | 243 | 4.1% |
| | Auth Feature | 25 | 0.4% |
| | Metrics Feature | 160 | 2.7% |
| | Shared | 1,807 | 30.7% |
| | 기타 (entry, infra) | 317 | 5.4% |
| | **합계** | **5,877** | |
| **Frontend** | Council Feature | 4,930 | 67.0% |
| | Chat Feature | 1,077 | 14.6% |
| | Shared | 469 | 6.4% |
| | App/Pages | 812 | 11.0% |
| | 기타 (tests, config) | 75 | 1.0% |
| | **합계** | **7,363** | |

### 커밋 유형 분포

| 유형 | 개수 | 설명 |
|------|------|------|
| refactor | 26 | 구조 표준화, 경로 정리, 주석 정비 |
| fix | 24 | SSE/UX 버그 수정, 모니터링 쿼리 보정 |
| feat | 7 | Council 기본 모드 변경, UX 개선 기능 추가 |
| perf | 5 | 렌더링 최적화, context 분리 |
| docs | 4 | README/구조 문서 업데이트 |
| style | 3 | Markdown 렌더러 개선 |
| chore | 2 | 유지보수성 정리 |
| test | 1 | P2 스트리밍 통합 테스트 추가 |

### 주요 변경 하이라이트

- **Feature 구조 표준화**: Backend는 `controllers/routes/services` 규칙, Frontend는 `api/hooks/components/types/utils` 규칙으로 정렬
- **Council 기본 모드 변경**: Ultra → Lite 기본값으로 전환
- **스트리밍 안정성 강화**: SSE heartbeat, stage별 timeout 적용, 재연결 중복 메시지 방지
- **성능 개선**: 스트리밍 rAF batching + React.memo 적용, 사이드바 리렌더 최소화
- **UI/Markdown 개선**: 코드 블록 하이라이팅/복사 버튼, GFM 테이블, CJK 굵게 지원, 삭제 UX 개선
- **관측성 정비**: 모니터링 대시보드 레이아웃 및 쿼리 정교화
- **DX 개선**: `@shared` alias 도입, 대규모 주석 한글화

---

## 아키텍처 개요

### 3단계 Council 프로세스 (V2 유지)

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

### Feature Slice 표준 구조

```
Backend Feature (Standard)
├── controllers/   # HTTP 핸들러
├── routes/        # 라우팅
├── services/      # 비즈니스 로직
├── sse/           # Council 전용
└── utils/

Frontend Feature (Standard)
├── api/           # HTTP/SSE 통신
├── hooks/         # 상태/로직
├── components/    # UI
├── types/         # 타입
└── utils/         # 헬퍼
```

---

## Backend 아키텍처

### 디렉토리 구조

```
backend/src/
├── app.ts
├── features/
│   ├── council/                 # Council Feature (2,551 LOC)
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sse/
│   │   └── utils/
│   ├── chat/                    # Chat Feature (774 LOC)
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── services/
│   ├── gate/                    # Gate Feature (243 LOC)
│   ├── auth/                    # Auth Feature (25 LOC)
│   └── metrics/                 # Metrics Feature (160 LOC)
├── shared/                      # Shared Module (1,807 LOC)
│   ├── constants/
│   ├── errors/
│   ├── middleware/
│   ├── models/
│   ├── observability/
│   ├── services/
│   └── types/
└── index.ts
```

**추가 개선**: `@shared/*` 경로 별칭을 도입해 깊은 상대 경로를 제거했습니다.

### Council Feature (2,551 LOC)

#### Services Layer (1,236 LOC)

| 파일 | 라인 | 책임 |
|------|------|------|
| `orchestrator.service.ts` | 570 | 3단계 파이프라인 오케스트레이션, 모드 라우팅 |
| `councilApi.service.ts` | 249 | OpenRouter 호출/스트리밍 배치, 모델 병렬 처리 |
| `session.service.ts` | 131 | 세션 CRUD 및 유효성 검사 |
| `persistence.service.ts` | 78 | DB 저장 로직 분리 |
| `ranking.service.ts` | 78 | 랭킹 파싱/집계 |
| `title.service.ts` | 55 | 세션 제목 생성 |
| `history.service.ts` | 29 | 대화 컨텍스트 빌더 |
| `index.ts` | 46 | Barrel export |

#### SSE Layer (895 LOC)

| 파일 | 라인 | 책임 |
|------|------|------|
| `index.ts` | 154 | SSE Facade (Registry) |
| `sseJobTracker.ts` | 139 | 활성 작업 레지스트리 |
| `sseLifecycleManager.ts` | 161 | Grace period/정리/종료 |
| `sseReplayService.ts` | 127 | 재연결 replay 지원 |
| `sseStreamHandler.ts` | 150 | 스트림 처리 및 abort 제어 |
| `sseEventAccumulator.ts` | 80 | 이벤트 상태 누적 |
| `sseClientManager.ts` | 62 | 클라이언트 생명주기 관리 |
| `sseBroadcaster.ts` | 22 | 이벤트 브로드캐스트 |

### Chat Feature (774 LOC)

| 파일 | 라인 | 책임 |
|------|------|------|
| `chat.controller.ts` | 177 | 통합 컨트롤러 |
| `chat.routes.ts` | 60 | RESTful 라우팅 |
| `message.service.ts` | 116 | 메시지 오케스트레이션 |
| `session.service.ts` | 224 | 세션 관리 |
| `validation.service.ts` | 54 | 입력 유효성 검사 |
| `openai.service.ts` | 101 | LLM 통신 |

### Shared 모듈 (1,807 LOC)

**역할 분리 강화**: 관측성/서비스/에러 레이어가 분리되어 공통 모듈의 책임이 명확해졌습니다.

| 디렉토리 | 라인 | 내용 |
|----------|------|------|
| `constants/` | 85 | 모델/모드/시스템 상수 |
| `errors/` | 39 | 공통 에러/헬퍼 |
| `middleware/` | 192 | Auth, Rate Limiter, CSRF |
| `models/` | 184 | Mongoose 스키마 |
| `observability/` | 259 | Prometheus/로깅/헬스체크 |
| `services/` | 534 | OpenRouter, 공용 서비스 |
| `types/` | 178 | 공유 타입 |
| `루트 파일` | 336 | config/db/env/index |

---

## Frontend 아키텍처

### 디렉토리 구조

```
frontend/src/
├── app/                         # Next.js App Router
├── features/
│   ├── council/                 # Council Feature (4,930 LOC)
│   │   ├── api/
│   │   ├── hooks/
│   │   ├── components/
│   │   ├── types/
│   │   └── utils/
│   └── chat/                    # Chat Feature (1,077 LOC)
│       ├── api/
│       ├── hooks/
│       ├── components/
│       └── types/
├── shared/                      # Shared Module (469 LOC)
│   ├── api/
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── utils/
└── proxy.ts                     # Next.js 16 미들웨어 대체
```

### Council Feature (4,930 LOC)

| 영역 | 라인 | 역할 |
|------|------|------|
| `hooks/` | 1,705 | CouncilContext 분리, 스트림/상태 관리 |
| `components/` | 1,769 | 메시지 리스트, 입력 영역, Stage 패널 |
| `api/` | 748 | REST/SSE 통신 |
| `utils/` | 307 | 스트리밍/메시지 가공 유틸 |
| `types/` | 252 | Stage/Stream/Model 타입 |
| `index.ts` | 149 | Public API exports |

### Chat Feature (1,077 LOC)

| 영역 | 라인 | 역할 |
|------|------|------|
| `hooks/` | 764 | 상태 관리 훅 |
| `components/` | 162 | UI 컴포넌트 |
| `api/` | 50 | REST 통신 |
| `types/` | 60 | 타입 정의 |
| `index.ts` | 41 | Public API exports |

### Shared 모듈 (469 LOC)

| 영역 | 라인 | 역할 |
|------|------|------|
| `components/` | 154 | 공통 UI |
| `api/` | 119 | Axios/Fetch 래퍼 |
| `hooks/` | 62 | 공통 훅 |
| `utils/` | 70 | 유틸리티 |
| `types/` | 30 | 공통 타입 |
| `index.ts` | 34 | Public API exports |

---

## 리팩토링 Plan (P1-P8)

| 단계 | 목표 | 주요 변경 |
|------|------|----------|
| P1 | 관측성/CI 안정화 | 모니터링 대시보드 정비, CI compose 기동 보장 |
| P2 | 스트리밍 안정성 | SSE heartbeat, stage별 timeout, reconnect 안정화 |
| P3 | UX 신뢰성 | Stage3 abort UI, 세션 전환/타임스탬프 일관성 |
| P4 | 렌더링 성능 | CouncilContext 분리, rAF batching, memo 최적화 |
| P5 | Markdown/텍스트 품질 | 코드 블록 하이라이트/복사, GFM 테이블, CJK 굵게 |
| P6 | 기본 동작 조정 | Council 기본 모드 Lite, Stage2 프롬프트 영문화 |
| P7 | 구조 정합성 | Feature 디렉토리 표준화, `proxy.ts`, `@shared` alias |
| P8 | 문서/주석 정리 | 대규모 주석 한글화, README 구조 갱신 |

---

## 커밋 히스토리

### 관측성/CI 안정화

```
e9b1019 refactor(monitoring): reorganize dashboard layout
b302cfe fix(monitoring): correct AI Council panel queries
46cca4f fix(monitoring): refine dashboard panel queries and labels
550d96d fix(monitoring): make stat panels time-range totals
36b8643 fix(ci): make backend container start in compose test
```

### 스트리밍 안정성

```
52c22c2 feat(backend): add stage-specific API timeouts
bbdd452 fix(sse): add heartbeat to prevent connection timeouts
e0ed04f fix(frontend): prevent duplicate message on council session reconnect
```

### 성능/테스트

```
53a1bed perf(frontend): split CouncilContext for render isolation
0b65b86 perf(frontend): migrate components to split contexts with integration tests
2bf9023 test(frontend): add P2 streaming integration tests
08cd205 perf(frontend): add rAF batching and React.memo for streaming optimization
7f96ba6 perf(frontend): optimize council session switching
```

### UX/Markdown 개선

```
be3fdd2 feat(frontend): improve delete UX with optimistic updates and toast notifications
bcbd815 feat(frontend): disable new session buttons while creating
1147ddd style(frontend): add syntax highlighting and copy button to code blocks
eb203bd style(frontend): add GFM table support to markdown renderer
ddff53d feat(frontend): add remark-cjk-friendly for Korean bold markdown
8cff89b feat(frontend): improve stage3 abort handling
```

### 구조 리팩토링/문서화

```
20d2920 refactor(backend): reorganize features into controllers/routes directories
e81f360 refactor(backend): add TypeScript path aliases (@shared)
3296a07 refactor: reorganize file structure for consistency
3bd463f refactor(frontend): standardize feature directory naming convention
73213ea refactor(frontend): migrate middleware.ts to proxy.ts for Next.js 16
2102c6d docs: update project structure in README to match actual file tree
```

### 주석 정리

```
b1fa734 refactor(backend): translate comments to Korean and add intent explanations - Phase 1
773141e refactor(backend): translate comments to Korean - Phase 2 (services, middleware, SSE, infrastructure)
6a0e935 refactor(frontend): translate comments to Korean - Phase 1
71aec1d refactor(frontend): translate comments to Korean - Council directory (comprehensive)
```

---

## 테스트 및 검증

### 자동화 테스트

- `frontend/tests/council/integration`에 P2 스트리밍 통합 테스트 추가
- Context 분리 이후 통합 테스트 시나리오 보강

### 수동 검증 포인트

- Council 세션 전환/재연결 시 중복 메시지 여부
- Stage3 abort 시 UI 상태 정합성
- SSE heartbeat 및 timeout 동작
- Markdown 렌더링 (코드 블록/테이블/CJK 강조)

---

## 결론

V3는 기능 확장보다 **구조 일관성, 안정성, 성능, 문서화**에 초점을 맞춘 리팩토링 단계입니다. Feature 구조를 표준화하고, Council 스트리밍과 UI 상태를 안정화했습니다.

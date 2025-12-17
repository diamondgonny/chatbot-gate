# Chatbot Gate Project

## 프로젝트 개요

- 간단한 인프라 구축, 배포, 모니터링을 연습하고자 토이 프로젝트로 만든 풀스택 애플리케이션입니다.
- 접속 코드를 통해 이용할 수 있습니다.
- **AI Chat**에서 편하게 대화할 수 있습니다.
- **AI Council**에서 어려운 문제를 인공지능에게 물어볼 수 있습니다.

## 사용 방법

1. **코드 입력**: 메인 화면에서 전달받은 코드를 입력하세요.
2. **입장**: 코드가 확인되면 채팅 로비로 이동합니다.
3. **AI Chat**: 편하게 대화합니다.
4. **AI Council**: 여러 LLM이 협업하여 답변합니다. (Lite/Ultra 모드 지원)

## 스크린샷

<img width="1701" height="1226" alt="Screenshot 2025-12-06 at 11 44 30" src="https://github.com/user-attachments/assets/93a26ab9-787c-4f37-b4ec-0afb1e9f32dd" />
<img width="1701" height="1224" alt="Screenshot 2025-12-06 at 11 44 43" src="https://github.com/user-attachments/assets/9f3cbbed-03d6-4d9a-8d34-bf9615494f51" />
<img width="1701" height="1235" alt="Screenshot 2025-12-06 at 11 50 31" src="https://github.com/user-attachments/assets/826d0dcc-9ffd-4dfd-b602-3b50a1125c32" />

## 모니터링 대시보드

<img width="1701" height="1131" alt="Screenshot 2025-12-07 at 12 32 30" src="https://github.com/user-attachments/assets/6e30c0a1-75d0-4451-994e-60cc8c722f0c" />

## 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion, react-markdown
- **Backend**: Express.js 5, TypeScript, MongoDB (Mongoose 9), OpenAI API, OpenRouter API (Multi-LLM)
- **Infrastructure**: Vercel, Docker + GHCR, GitHub Actions CI/CD, Blue-Green Deployment
- **Monitoring**: Prometheus, Grafana

## 프로젝트 구조

```
chatbot-gate/
│
├── .github/workflows/
│
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   └── routes/
│   │   │   ├── chat/
│   │   │   │   ├── routes/
│   │   │   │   ├── controllers/
│   │   │   │   └── services/
│   │   │   ├── council/
│   │   │   │   ├── routes/
│   │   │   │   ├── controllers/
│   │   │   │   ├── services/
│   │   │   │   ├── sse/
│   │   │   │   └── utils/
│   │   │   ├── gate/
│   │   │   │   ├── routes/
│   │   │   │   ├── controllers/
│   │   │   │   └── services/
│   │   │   └── metrics/
│   │   │       ├── middleware/
│   │   │       └── routes/
│   │   └── shared/
│   │       ├── config.ts
│   │       ├── db.ts
│   │       ├── env.ts
│   │       ├── constants/
│   │       ├── errors/
│   │       ├── middleware/
│   │       ├── models/
│   │       ├── services/
│   │       ├── types/
│   │       └── observability/
│   ├── docker-compose*.yml
│   └── monitoring-config/
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (protected)/
│       │   └── (public)/
│       ├── features/
│       │   ├── council/
│       │   │   ├── domain/
│       │   │   ├── services/
│       │   │   ├── state/
│       │   │   └── ui/
│       │   └── chat/
│       │       ├── domain/
│       │       ├── services/
│       │       ├── state/
│       │       └── ui/
│       └── shared/
│           ├── apis/
│           ├── components/
│           ├── hooks/
│           ├── types/
│           └── utils/
│
├── docs/
└── README.md
```

## API 문서

| 엔드포인트 | 메서드 | 설명 | 인증 |
|-----------|--------|------|:----:|
| `/api/gate/validate` | POST | 접근 코드 검증, JWT 발급 | - |
| `/api/auth/status` | GET | 인증 상태 확인 | - |
| `/api/chat/sessions/:id/message` | POST | AI에게 메시지 전송 | O |
| `/api/chat/sessions/:id/history` | GET | 세션 대화 내역 조회 | O |
| `/api/chat/sessions` | GET | 세션 목록 조회 | O |
| `/api/chat/sessions` | POST | 세션 생성 | O |
| `/api/chat/sessions/:id` | GET | 단일 세션 조회 | O |
| `/api/chat/sessions/:id` | DELETE | 단일 세션 삭제 | O |
| `/api/council/sessions` | GET | Council 세션 목록 | O |
| `/api/council/sessions` | POST | Council 세션 생성 | O |
| `/api/council/sessions/:id` | GET | Council 세션 조회 | O |
| `/api/council/sessions/:id` | DELETE | Council 세션 삭제 | O |
| `/api/council/sessions/:id/message` | POST | Council 메시지 (SSE) | O |
| `/api/council/sessions/:id/status` | GET | Council 처리 상태 | O |
| `/api/council/sessions/:id/reconnect` | GET | SSE 재연결 | O |
| `/api/council/sessions/:id/abort` | POST | Council 처리 중단 | O |
| `/metrics` | GET | Prometheus 메트릭 | - |

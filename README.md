# Chatbot Gate Project

## 프로젝트 개요

- 간단한 인프라 구축, 배포, 모니터링을 연습하고자 토이 프로젝트로 시작한 풀스택 애플리케이션입니다.
- 접속 코드를 통해 이용할 수 있습니다.
- **AI Chat**에서 편하게 대화할 수 있습니다.
- **AI Council**에서 어려운 문제를 인공지능에게 물어볼 수 있습니다. ([llm-council](https://github.com/karpathy/llm-council) 미니 프로젝트에서 영감을 받았습니다.)

## 사용 방법

1. **코드 입력**: 메인 화면에서 전달받은 코드를 입력하세요.
2. **입장**: 코드가 확인되면 채팅 로비로 이동합니다.
3. **AI Chat**: 편하게 대화합니다.
4. **AI Council**: 여러 LLM이 협업하여 답변합니다. (Lite/Ultra 모드 지원)

## 스크린샷

<img width="2579" height="1976" alt="Screenshot 2025-12-16 at 11 09 29" src="https://github.com/user-attachments/assets/7347420a-566e-415a-a5e3-a2d458170a82" />
<img width="2577" height="1974" alt="Screenshot 2025-12-16 at 11 18 13" src="https://github.com/user-attachments/assets/65799cb3-d534-4987-a60a-8e6d669b958f" />
<img width="2579" height="1981" alt="Screenshot 2025-12-16 at 11 17 19" src="https://github.com/user-attachments/assets/5d08c51d-e914-4aed-a3e9-997e11d805f4" />
<img width="2583" height="1970" alt="Screenshot 2025-12-16 at 12 14 03" src="https://github.com/user-attachments/assets/778f3134-ae3a-4362-9533-9f6568cad0ab" />

## 모니터링 대시보드

<img width="2587" height="1577" alt="Screenshot 2025-12-16 at 17 22 53" src="https://github.com/user-attachments/assets/97f805be-418e-4669-a5b2-300850f9e323" />


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
│       │   │   ├── api/
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   ├── types/
│       │   │   └── utils/
│       │   └── chat/
│       │       ├── api/
│       │       ├── components/
│       │       ├── hooks/
│       │       └── types/
│       └── shared/
│           ├── api/
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
| `/api/chat/sessions` | GET | Chat 세션 목록 | O |
| `/api/chat/sessions` | POST | Chat 세션 생성 | O |
| `/api/chat/sessions/:id` | GET | Chat 세션 조회 | O |
| `/api/chat/sessions/:id` | DELETE | Chat 세션 삭제 | O |
| `/api/chat/sessions/:id/message` | POST | Chat 메시지 전송 | O |
| `/api/council/sessions` | GET | Council 세션 목록 | O |
| `/api/council/sessions` | POST | Council 세션 생성 | O |
| `/api/council/sessions/:id` | GET | Council 세션 조회 | O |
| `/api/council/sessions/:id` | DELETE | Council 세션 삭제 | O |
| `/api/council/sessions/:id/message` | POST | Council 메시지 전송 (SSE) | O |
| `/api/council/sessions/:id/reconnect` | GET | Council 재연결 (SSE) | O |
| `/api/council/sessions/:id/status` | GET | Council 작업 상태 확인 | O |
| `/api/council/sessions/:id/abort` | POST | Council 작업 중단 | O |
| `/metrics` | GET | Prometheus 메트릭 | - |

# Chatbot Gate Project

## 프로젝트 개요

- 접속 코드를 통해 이용할 수 있는 프라이빗 AI 챗봇 서비스입니다.
- 간단한 인프라 구축, 배포, 모니터링을 연습하고자 토이 프로젝트로 만든 풀스택 애플리케이션입니다.

## 사용 방법

1. **코드 입력**: 메인 화면에서 전달받은 코드를 입력하세요.
2. **입장**: 코드가 확인되면 채팅 로비로 이동합니다.
3. **대화 시작**: '새 채팅'을 눌러 대화를 시작하거나, 왼쪽 목록에서 이전 대화를 선택하세요.

## 스크린샷

<img width="1701" height="1226" alt="Screenshot 2025-12-06 at 11 44 30" src="https://github.com/user-attachments/assets/93a26ab9-787c-4f37-b4ec-0afb1e9f32dd" />
<img width="1701" height="1224" alt="Screenshot 2025-12-06 at 11 44 43" src="https://github.com/user-attachments/assets/9f3cbbed-03d6-4d9a-8d34-bf9615494f51" />
<img width="1701" height="1235" alt="Screenshot 2025-12-06 at 11 50 31" src="https://github.com/user-attachments/assets/826d0dcc-9ffd-4dfd-b602-3b50a1125c32" />

## 모니터링 대시보드

<img width="1701" height="1131" alt="Screenshot 2025-12-07 at 12 32 30" src="https://github.com/user-attachments/assets/6e30c0a1-75d0-4451-994e-60cc8c722f0c" />

## 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Express.js 5, TypeScript, MongoDB (Mongoose 9), OpenAI API
- **Infrastructure**: Vercel, Docker + GHCR, GitHub Actions CI/CD, Blue-Green Deployment
- **Monitoring**: Prometheus, Grafana

## 프로젝트 구조

```
chatbot-gate/
├── .github/workflows/          # CI/CD 파이프라인
├── backend/
│   ├── src/
│   │   ├── controllers/        # HTTP 요청/응답 처리
│   │   ├── services/           # 비즈니스 로직 (gate, session, chat)
│   │   ├── middleware/         # auth, rateLimiter, metrics
│   │   ├── models/             # Mongoose 스키마
│   │   ├── routes/             # API 엔드포인트
│   │   ├── types/              # 요청/응답 타입 정의
│   │   ├── constants/          # 공유 상수
│   │   ├── metrics/            # Prometheus 메트릭
│   │   └── utils/              # JWT 유틸리티
│   ├── monitoring-config/      # Prometheus, Grafana 설정
│   └── docker-compose.yml
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (public)/       # 인증 불필요 라우트 (/)
│       │   ├── (protected)/    # 인증 필요 라우트 (/hub, /chat)
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── apis/               # API 클라이언트 및 엔드포인트
│       ├── components/
│       │   ├── common/         # AlertModal
│       │   └── chat/           # SessionSidebar
│       ├── hooks/              # useChat, useSessions
│       ├── types/              # 공유 타입 정의
│       ├── utils/              # authUtils, timeUtils
│       └── proxy.ts            # SSR 인증 가드 (JWT 검증)
└── README.md
```

## API 문서

| 엔드포인트 | 메서드 | 설명 | 인증 |
|-----------|--------|------|:----:|
| `/api/gate/validate` | POST | 접근 코드 검증, JWT 발급 | - |
| `/api/auth/status` | GET | 인증 상태 확인 | - |
| `/api/chat/message` | POST | AI에게 메시지 전송 | O |
| `/api/chat/history` | GET | 세션 대화 내역 조회 | O |
| `/api/sessions` | GET | 세션 목록 조회 | O |
| `/api/sessions/:id` | DELETE | 세션 삭제 | O |
| `/metrics` | GET | Prometheus 메트릭 | - |

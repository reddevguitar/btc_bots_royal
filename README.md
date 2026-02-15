# BTC Bots Royal (Stage 1)

Next.js + TypeScript 기반으로 1단계 구조를 구성한 버전입니다.

## 핵심
- 20개 봇 전략을 플러그인 형태로 분리 (`lib/engine/strategies.ts`)
- 백테스트/시뮬레이션 엔진 분리 (`lib/engine/simulator.ts`)
- 스테이지 생성/데이터 로더 분리 (`lib/engine/stage.ts`, `lib/engine/data.ts`)
- 실행 결과를 JSON으로 출력 (다음 단계 자동 선별 대비)

## 실행
```bash
npm install
npm run dev
```

## 구조
- `app/page.tsx`: UI + 시뮬레이션 루프 연결
- `lib/engine/types.ts`: 공통 타입
- `lib/engine/indicators.ts`: 지표 유틸
- `lib/engine/strategies.ts`: 봇 전략
- `lib/engine/stage.ts`: 스테이지 분석/생성
- `lib/engine/simulator.ts`: 경쟁 시뮬레이터


# BTC Bots Royal 작업 내역

## 현재 프로젝트 상태
- 스택: `Next.js + TypeScript`
- 실행 방식: **서버 런타임 기반 시뮬레이션**
  - 브라우저는 제어/조회만 수행
  - 서버(`next dev`/`next start`)가 살아있는 동안 시뮬레이션 지속
- 메인 UI:
  - 좌측: 컨트롤 패널 + 옵션 + 비트코인 역사 구간 + 봇 목록
  - 우측: 트레이딩 화면(지표/차트/로그/순위/상태보드)

## 최근 핵심 변경
1. 단일 `index.html` -> Next.js 구조 전환
2. 엔진 모듈 분리
   - `lib/engine/*`
3. 서버 런타임 추가
   - `lib/server/runtime.ts`
   - `app/api/runtime/route.ts`
4. 제어 기능
   - 실행/일시정지/재개/종료/리셋/옵션 적용/역사 구간 재로드
5. 봇 수 조정
   - 30 -> 20개
6. 스테이지 변경
   - 자동 탐색형 -> **비트코인 역사 10구간 고정 이벤트형**
   - 각 구간: 이름/시간/변곡점/설명 포함
7. 차트 강화
   - Chart.js 적용
   - BTC Price + EMA20 + EMA50
   - 시간축/가격축/툴팁 강화
8. 폴링 최적화
   - `running`: 300ms
   - `idle/paused/finished`: 1800ms
9. 가격 왜곡 문제 수정
   - 비정상 가격 범위 검증 추가
   - fallback을 역사 앵커 기반으로 변경
   - 런타임 데이터 재검증 로직 추가

## 중요 파일
- UI
  - `app/page.tsx`
  - `app/globals.css`
- 서버 런타임/API
  - `lib/server/runtime.ts`
  - `app/api/runtime/route.ts`
- 전략/엔진
  - `lib/engine/strategies.ts`
  - `lib/engine/simulator.ts`
  - `lib/engine/stage.ts`
  - `lib/engine/data.ts`
  - `lib/engine/indicators.ts`
  - `lib/engine/types.ts`

## 실행 방법
```bash
cd "/Users/reddev/Documents/New project"
npm install
npm run dev
```
- 접속: `http://localhost:3000`

## 가격 이상(100만 달러 등) 발생 시 조치
1. 서버 재시작
```bash
Ctrl + C
npm run dev
```
2. 웹에서 `리셋` 클릭 후 `실행`
3. 필요하면 `.runtime` 삭제 후 재실행
```bash
rm -rf .runtime
npm run dev
```

## 현재 알려진 특성
- 브라우저를 닫아도 서버가 켜져 있으면 진행 유지
- 서버를 끄면 시뮬레이션도 멈춤
- `GET /api/runtime` 로그는 폴링 동작으로 정상

## 다음 작업 추천(다음 스레드용)
1. 차트 x축 라벨 규칙 추가 개선
   - 1시간: 시:분
   - 1주: 월/일
   - 3개월+: 주 단위 라벨 간격
2. 거래 마커(BUY/SELL) 차트 오버레이
3. 봇별 성능 리포트 카드(MDD, 승률, PF)
4. 서버 런타임 상태 파일(`.runtime`) 구조 버전 필드 추가


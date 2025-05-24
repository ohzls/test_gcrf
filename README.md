# Predictourist Backend

## 프로젝트 구조

```
backend/
├── index.js              # 메인 서버 파일
├── fileUtils.js          # Google Cloud Storage 파일 관리
├── cache.js             # 메모리 캐시 관리
├── frequentUpdater.js    # 자주 검색되는 장소 관리
├── frequencyManager.js   # 장소 호출 빈도 관리
└── data/                # JSON 데이터 파일
    ├── base_places.json
    ├── frequent_places.json
    ├── frequency.json
    ├── variable_data/
    │   └── {YYMMDD}/
    │       └── {place_id}.json  # place_id 형식: tg_법정동코드_관광지번호
    ├── festivals/
    │   └── {YYYYMM}.json
    ├── festival_places/
    │   └── {YYYYMM}.json
    └── place_details/
        └── {place_id}.json  # place_id 형식: tg_법정동코드_관광지번호
```

## API 호출 단계

### 1. 장소 검색
- 엔드포인트: `/api/places/search`
- Query Parameters:
  - `query`: 검색어 (필수, string)
  - `showAll`: 초기 검색 결과 외 전체 결과 요청 여부 (선택 사항, boolean, 기본값: false). `true`로 설정 시 자주 찾는 장소 필터링을 건너뛰고, 이미 반환된 자주 찾는 장소를 제외한 나머지 결과를 빈도순 정렬하여 반환합니다.
- 반환 데이터: `{ results: PlaceSearchResult[], frequentOnly: boolean }` 형태.
  - `results`: 장소 객체 배열 (id, name, address?, averageCrowd?, highlightedName? 포함). 초기 검색 시 자주 찾는 장소만 포함될 수 있음.
  - `frequentOnly`: `true`이면 `results`가 자주 찾는 장소 목록에서만 나온 결과임을 의미 (프론트엔드에서 '더보기' 버튼 표시 여부 판단용). `false`이면 전체 목록 검색 결과(또는 그 일부)임을 의미.
- 데이터 소스: `frequent_places.json` (우선), `base_places.json` (캐시)
- 특징:
  - 초기 검색 시 자주 검색되는 장소를 우선적으로 반환하여 응답 속도 향상.
  - `showAll=false`이고 자주 찾는 결과가 없을 경우, 또는 `showAll=true`일 경우 전체 장소 목록에서 검색하며 `frequency.json` 기반으로 **빈도순 정렬** 적용.

### 2. 장소 좌표 조회
- 엔드포인트: `/api/places/coordinates`
- Query Parameters:
  - `id`: 장소 ID (필수, string, 형식: tg_법정동코드_관광지번호)
- 반환 데이터: `{ lat: number, lng: number }` 형태의 좌표 객체.
- 데이터 소스: `place_details/{place_id}.json` 파일 내 `coordinates` 필드.
- 목적: 지도 표시에 필요한 좌표 정보만 빠르게 로드 (단계별 로딩 2단계).

### 3. 장소 상세 정보
- 엔드포인트: `/api/places/details`
- Query Parameters:
  - `id`: 장소 ID (필수, string, 형식: tg_법정동코드_관광지번호)
  - `date`: 조회할 날짜 (YYYY-MM-DD 형식, string, 기본값: 오늘)
- 반환 데이터: **해당 장소의 전체 상세 정보.** `place_details/{id}.json`의 모든 정적 정보(**좌표 포함**)와 `variable_data/{YYMMDD}/{id}.json`의 **해당 날짜 변동 정보(시간대별 혼잡도 `crowd.hourly`, 날씨 `weather`)**가 병합되어 반환됩니다. 또한, KTO(한국관광공사) API의 혼잡도(`ktoCongestionRate`) 필드가 추가됩니다.
- 예시:
```json
{
  "id": "tg_11110_001",
  ...
  "crowd": { "hourly": [..], "lastUpdated": "..." },
  "weather": { "state": "맑음", "temperature": 23 },
  "ktoCongestionRate": 75.2
}
```
- 데이터 소스: `place_details/{place_id}.json`, `variable_data/{YYMMDD}/{place_id}.json`, (KTO API)
- 특징: 병렬 데이터 로드하여 응답 시간 최적화 (단계별 로딩 3단계).

### 4. 자주 검색되는 장소 목록
- 엔드포인트: `/api/places/frequent`
- 반환 데이터: 자주 검색되는 장소 목록
- 데이터 소스: `frequent_places.json`
- 업데이트 주기: 5분마다 자동 업데이트

### 5. 실시간 데이터 업데이트
- 엔드포인트: `/api/places/update`
- Method: POST
- Query Parameters:
  - `id`: 장소 ID (필수)
- Request Body:
  ```json
  {
    "crowd": {
      "hourly": [10, 15, 20, ...], // 24시간 혼잡도 데이터 (반드시 24개 숫자)
      "lastUpdated": "2025-04-22T10:00:00.000Z"
    },
    "weather": {
      "state: "맑음",
      "temperature": 28
    }
  }
  ```
- 반환 데이터:
  ```json
  { "status": "ok" }
  ```
- 데이터 소스: `variable_data/{YYMMDD}/{place_id}.json`
- 특징:
  - crowd.hourly는 반드시 24개 숫자 배열이어야 하며, weather는 반드시 문자열이어야 함(유효성 검증)

## 데이터 구조

### 1. base_places.json
```json
{
  "places": [
    {
      "id": "tg_11110_001",  // 형식: tg_법정동코드_관광지번호
      "name": "경복궁",
      "address": "서울특별시 종로구 사직로 161",
      "status": true,
      "averageCrowd": 75
    }
  ]
}
```

### 2. place_details/{place_id}.json
```json
{
  "id": "tg_11110_001",  // 형식: tg_법정동코드_관광지번호
  "name": "경복궁",
  "names": ["경복궁"],  // 과거 모든 명칭 추가
  "address": "서울특별시 종로구 사직로 161",
  "areaCode": 11110,
  "status": true,
  "description": "조선왕조 제일의 법궁으로, 1395년 태조 이성계가 창건했습니다.",
  "category": "궁궐",
  "coordinates": {
    "lat": 37.579615,
    "lng": 126.977011
  },
  "openingHours": {
    "weekday": {
      "open": 9,
      "close": 17
    },
    "weekend": {
      "open": 9,
      "close": 17
    },
    "exceptions": {
      "8": {
        "weekday": {
          "open": 9,
          "close": 17
        },
        "weekend": {
          "open": 9,
          "close": 17
        },
      },
      "9": {
        "weekday": {
          "open": 9,
          "close": 17
        },
        "weekend": {
          "open": 9,
          "close": 17
        },
      }
    },
    "closeDays": [
      {
        "dayOfWeek": [2],
        "type": "weekly"
      }
    ]
  },
  "contact": {
    "phone": "02-3700-3900",
    "website": "http://www.royalpalace.go.kr"
  },
  "ticketPrice": {
    "adult": 3000,
    "teenager": 1500,
    "child": 1500
  },
  "facilities": [
    "주차장",
    "휠체어 대여",
    "유모차 대여",
    "음수대",
    "화장실"
  ],
  "nearbyAttractions": [
    {
      "id": "tg_11110_002",
      "name": "창덕궁",
      "distance": 0.8
    }
  ],
  "tags": ["궁궐", "역사", "문화", "전통", "관광"],
  "lastUpdated": "2025-04-22"
}
```

### 3. variable_data/{YYMMDD}/{place_id}.json
```json
{
  "crowd": {
    "hourly": [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 80, 75, 70, 65, 60, 55, 50, 45],
    "lastUpdated": "2025-04-22T10:00:00.000Z"
  },
  "weather": {
    "state": "맑음",
    "temperature": 28
  }
}
```
- 날짜별 폴더와 장소별 파일로 구성된 실시간 데이터
- 폴더명 형식: YYMMDD (예: 250422)
- 파일명: 장소 ID (예: tg_11110_001.json)
- 각 장소의 혼잡도와 날씨 정보 (weather는 `{ state, temperature }` 형태의 객체)
- 마지막 업데이트 시간 기록

### 4. frequent_places.json
```json
[
  {
    "id": "tg_11110_001",
    "name": "경복궁",
    "address": "서울특별시 종로구 사직로 161",
    "averageCrowd": 75
  }
]
```
- 자주 검색되는 장소 목록
- 호출 빈도가 높은 장소만 포함
- 5분마다 자동 업데이트

### 5. frequency.json
```json
{
  "tg_11110_001": 25,
  "tg_11110_002": 15
}
```
- 장소별 호출 빈도 기록
- 장소 ID를 키로 사용
- 값은 호출 횟수
- 자주 검색되는 장소 선정에 사용

### 6. festivals/{YYYYMM}.json
```json
{
  "festivals": [
    {
      "id": "f1",
      "name": "서울 문화재 야행",
      "startDate": "2025-04-01",
      "endDate": "2025-04-30",
      "description": "서울의 주요 문화재에서 진행되는 야간 특별관람",
      "lastUpdated": "2025-04-22T10:00:00.000Z"
    }
  ]
}
```
- 연월별로 분리된 축제 정보
- 파일명 형식: YYYYMM (예: 202504)
- 시작일자 기준으로 분류
- 각 축제의 기본 정보 (이름, 기간, 설명)
- 마지막 업데이트 시간 기록

### 7. festival_places/{YYYYMM}.json
```json
{
  "f1": {
    "places": ["tg_11110_001", "tg_11110_002"],
    "lastUpdated": "2025-04-22T10:00:00.000Z"
  }
}
```
- 연월별로 분리된 축제-장소 매핑 정보
- 파일명 형식: YYYYMM (예: 202504)
- 해당 월의 축제 ID를 키로 사용
- 각 축제가 진행되는 장소 ID 목록
- 마지막 업데이트 시간 기록

## 캐시 시스템

- 메모리 캐시 사용
- 30초마다 자동 동기화
- 장소 정보와 실시간 데이터 분리 저장
- 캐시 초기화 실패 시 서버 종료 (안정성 보장)
- 캐시 동기화 실패 시 로그 기록

## Google Cloud Storage

- 모든 JSON 파일은 GCS에 저장
- 버킷: `run-sources-predictourist-api-us-central1`
- 프로젝트: `predictourist-api`
- 파일 접근 로깅: 모든 파일 읽기/쓰기 작업에 대한 상세 로그 기록
- 에러 처리: 파일 존재 여부 확인 및 적절한 에러 처리

## 환경 변수

- `PORT`: 서버 포트 (기본값: 8080)
- `NODE_ENV`: 실행 환경 (development/production)
- `GCP_PROJECT_ID`: Google Cloud 프로젝트 ID
- `GCP_BUCKET_NAME`: Google Cloud Storage 버킷 이름

## CORS 설정

- 허용된 메서드: GET, POST, OPTIONS
- 허용된 헤더: Authorization, Content-Type, x-api-key
- CORS 프리플라이트 캐시: 1시간

## 배포

```bash
# Docker 이미지 빌드
docker build -t gcr.io/[PROJECT_ID]/popular-places-api .

# Cloud Run에 배포
gcloud run deploy popular-places-api \
  --image gcr.io/[PROJECT_ID]/popular-places-api \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --port 8080
```

## 모니터링

- 요청 로깅: 모든 API 요청에 대한 로그 기록
- 에러 처리: 상세한 에러 메시지와 스택 트레이스 기록
- 성능 모니터링: 응답 시간 및 리소스 사용량 추적
- 파일 접근 모니터링: GCS 파일 접근 로그 기록

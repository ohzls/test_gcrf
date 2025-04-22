# Predictourist Backend

## 프로젝트 구조

```
backend/
├── index.js              # 메인 서버 파일
├── fileUtils.js          # Google Cloud Storage 파일 관리
├── cache.js             # 메모리 캐시 관리
├── frequentUpdater.js    # 자주 검색되는 장소 관리
├── frequencyManager.js   # 장소 호출 빈도 관리
├── generateData.js       # 동적 데이터 생성
└── data/                # JSON 데이터 파일
    ├── base_places.json
    ├── frequent_places.json
    ├── frequency.json
    ├── variable_data/
    │   └── {YYMMDD}/
    │       └── {place_id}.json
    ├── festivals/
    │   └── {YYYYMM}.json
    ├── festival_places/
    │   └── {YYYYMM}.json
    └── place_details/
        └── {place_id}.json
```

## API 호출 단계

### 1. 장소 검색 (1차 호출)
- 엔드포인트: `/api/places/search`
- 반환 데이터: 장소명, 주소, 평균 혼잡도
- 데이터 소스: `frequent_places.json` (우선), `base_places.json` (2차)
- 검색 최적화: 자주 검색되는 장소를 우선적으로 검색하여 응답 속도 향상

### 2. 장소 상세 정보
- 엔드포인트: `/api/places/details`
- Query Parameters:
  - `id`: 장소 ID (필수)
  - `date`: 조회할 날짜 (YYYY-MM-DD 형식, 기본값: 오늘)
- 반환 데이터: 상세 설명, 영업시간, 연락처, 해당 날짜의 혼잡도, 날씨
- 데이터 소스: `place_details/{place_id}.json`, `variable_data/{YYMMDD}/{place_id}.json`
- 병렬 데이터 로드: 상세 정보와 변동 데이터를 동시에 로드하여 응답 시간 최적화

### 3. 자주 검색되는 장소 목록
- 엔드포인트: `/api/places/frequent`
- 반환 데이터: 자주 검색되는 장소 목록
- 데이터 소스: `frequent_places.json`
- 업데이트 주기: 5분마다 자동 업데이트

### 4. 실시간 데이터 업데이트
- 엔드포인트: `/api/places/update`
- Method: POST
- Query Parameters:
  - `id`: 장소 ID (필수)
- Request Body:
  ```json
  {
    "crowd": {
      "hourly": [10, 15, 20, ...], // 24시간 혼잡도 데이터
      "lastUpdated": "2025-04-22T10:00:00.000Z"
    },
    "weather": "맑음"
  }
  ```
- 데이터 소스: `variable_data/{YYMMDD}/{place_id}.json`

## 데이터 구조

### 1. base_places.json
```json
{
  "places": [
    {
      "id": "1",
      "name": "경복궁",
      "address": "서울특별시 종로구 사직로 161",
      "averageCrowd": 75
    }
  ]
}
```

### 2. place_details/{place_id}.json
```json
{
  "id": "1",
  "name": "경복궁",
  "address": "서울특별시 종로구 사직로 161",
  "description": "조선왕조 제일의 법궁으로, 1395년 태조 이성계가 창건했습니다.",
  "category": "궁궐",
  "openingHours": {
    "weekday": "09:00-17:00",
    "weekend": "09:00-17:00",
    "closeDays": [
      {
        "dayOfWeek": 2,
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
      "id": "2",
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
  "weather": "맑음"
}
```
- 날짜별 폴더와 장소별 파일로 구성된 실시간 데이터
- 폴더명 형식: YYMMDD (예: 250422)
- 파일명: 장소 ID (예: 1.json)
- 각 장소의 혼잡도와 날씨 정보
- 마지막 업데이트 시간 기록

### 4. frequent_places.json
```json
[
  {
    "id": "1",
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
  "1": 25,
  "2": 15
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
    "places": ["1", "2", "3"],
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

- 허용된 출처:
  - http://localhost:5173
  - http://192.168.0.64:5173
  - https://predictourist.github.io
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

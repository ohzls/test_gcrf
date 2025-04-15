# Popular Places API

Cloud Run에서 실행되는 관광지 정보 API 서버입니다.

## 데이터 구조

데이터는 Cloud Storage에 저장되며, 다음 경로 구조를 사용합니다:
```
gs://run-sources-predictourist-api-us-central1/services/popular-places/data/
  ├── places.json
  ├── frequentPlaces.json
  └── frequency.json
```

## 환경 변수

- `PORT`: 서버 포트 (기본값: 8080)

## API 엔드포인트

### GET /searchPlaces
관광지 검색 API
- Query Parameters:
  - `query`: 검색어 (필수)

### GET /places
개별 관광지 정보 조회 API
- Query Parameters:
  - `id`: 관광지 ID (필수)

### GET /frequentPlaces
자주 조회되는 관광지 목록 API

## 개발 환경 설정

1. Cloud Storage 버킷 생성
2. 서비스 계정 설정
3. 환경 변수 설정
4. 초기 데이터 업로드

## 배포

```bash
# Docker 이미지 빌드
docker build -t gcr.io/[PROJECT_ID]/popular-places-api .

# Cloud Run에 배포
gcloud run deploy popular-places-api \
  --image gcr.io/[PROJECT_ID]/popular-places-api \
  --platform managed \
  --region us-central1
```

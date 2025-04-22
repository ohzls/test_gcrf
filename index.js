// index.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Storage } from '@google-cloud/storage';
import FileUtils from './fileUtils.js';
import cache from './cache.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces, getFrequentPlaces } from './frequentUpdater.js';
import { handleError, AppError } from './errorHandler.js';
import { logRequest } from './monitoring.js';
import { config } from './config.js';

const app = express();

// CORS 설정
const corsOptions = {
  origin: config.cors.origins,
  methods: "GET, POST, OPTIONS",
  allowedHeaders: "Authorization, Content-Type, x-api-key",
  exposedHeaders: "Content-Length, Content-Range",
  credentials: true,
  maxAge: 3600,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

// 요청 제한 설정
const apiLimiter = rateLimit(config.api.rateLimit);
app.use('/api/', apiLimiter);

// 요청 로깅
app.use(logRequest);

// Cloud Storage 인증 확인
console.log('Cloud Storage 인증 확인...');
const storage = new Storage();
const bucket = storage.bucket('run-sources-predictourist-api-us-central1');

// 기본 경로 추가
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// 캐시 초기화
console.log('캐시 초기화 시작...');
try {
  await cache.initialize();
  console.log('캐시 초기화 완료');
} catch (error) {
  console.error('캐시 초기화 실패:', error);
  process.exit(1);
}

// 주기적 캐시 동기화
setInterval(() => cache.sync(), cache.SYNC_INTERVAL);

// 자주 검색되는 장소 업데이트
setInterval(async () => {
  try {
    await updateFrequentPlaces();
  } catch (error) {
    console.error('자주 검색되는 장소 업데이트 실패:', error);
  }
}, 5 * 60 * 1000); // 5분마다 업데이트

// 장소 검색 (1차 호출)
app.get('/api/places/search', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      throw new AppError('유효하지 않은 검색어입니다.', 400);
    }

    const normalizedQuery = query.toLowerCase();
    
    // 1. 자주 검색되는 장소에서 검색
    const frequentPlaces = await getFrequentPlaces();
    const frequentResults = frequentPlaces.filter(place => {
      if (!isValidPlace(place)) return false;
      const nameMatch = place.name.toLowerCase().includes(normalizedQuery);
      const addressMatch = place.address?.toLowerCase().includes(normalizedQuery);
      return nameMatch || addressMatch;
    });    

    if (frequentResults.length > 0) {
      return res.json(frequentResults);
    }

    // 2. 전체 장소에서 검색
    const results = Array.from(cache.places.values())
      .filter(place => {
        if (!isValidPlace(place)) return false;
        const nameMatch = place.name.toLowerCase().includes(normalizedQuery);
        const addressMatch = place.address?.toLowerCase().includes(normalizedQuery);
        return nameMatch || addressMatch;
      });

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// 장소 상세 정보
app.get('/api/places/details', async (req, res, next) => {
  try {
    const { id, date } = req.query;
    
    // 입력값 검증
    if (!id || typeof id !== 'string') {
      throw new AppError('유효하지 않은 장소 ID입니다.', 400);
    }

    // 날짜 형식 검증
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError('유효하지 않은 날짜 형식입니다.', 400);
    }
    
    // 병렬 데이터 로드
    const [place, details, variableData] = await Promise.all([
      cache.getPlace(id),
      FileUtils.getPlaceDetails(id),
      FileUtils.getVariableData(id, date)
    ]);

    if (!place) {
      throw new AppError('장소를 찾을 수 없습니다.', 404);
    }

    // 응답 데이터 구조화
    res.json({
      ...details,
      crowd: variableData?.crowd,
      weather: variableData?.weather
    });
  } catch (error) {
    next(error);
  }
});

// 자주 검색되는 장소 목록
app.get('/api/places/frequent', async (req, res, next) => {
  try {
    const frequentPlaces = await getFrequentPlaces();
    res.json(frequentPlaces);
  } catch (error) {
    next(error);
  }
});

// 실시간 데이터 업데이트
app.post('/api/places/update', async (req, res, next) => {
  try {
    const { id } = req.query;
    const { crowd, weather } = req.body;

    // 입력값 검증
    if (!id || typeof id !== 'string') {
      throw new AppError('유효하지 않은 장소 ID입니다.', 400);
    }

    if (!crowd?.hourly || !Array.isArray(crowd.hourly) || crowd.hourly.length !== 24) {
      throw new AppError('유효하지 않은 혼잡도 데이터입니다.', 400);
    }

    if (!weather || typeof weather !== 'string') {
      throw new AppError('유효하지 않은 날씨 데이터입니다.', 400);
    }

    const currentData = {
      crowd,
      weather,
      lastUpdated: new Date().toISOString()
    };

    await FileUtils.updateVariableData(id, currentData);
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

// 에러 처리 미들웨어
app.use(handleError);

// 서버 시작
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});
// index.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Storage } from '@google-cloud/storage';
import FileUtils from './fileUtils.js';
import cache from './cache.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces, getFrequentPlaces } from './frequentUpdater.js';
import { attachDynamicFields } from './generateData.js';

const app = express();

const corsOptions = {
  // 이전 x-google-cors의 allowOrigins와 동일하게 설정
  origin: ["http://localhost:5173", "https://seoseongwon.gitlab.io", "https://predictourist.com"],
  // 이전 x-google-cors의 allowMethods와 동일하게 설정 (OPTIONS 포함)
  methods: "GET, POST, OPTIONS",
  // 이전 x-google-cors의 allowHeaders와 동일하게 설정
  allowedHeaders: "Authorization, Content-Type, x-api-key",
  // 이전 x-google-cors의 exposeHeaders와 동일하게 설정
  exposedHeaders: "Content-Length, Content-Range",
  // 이전 x-google-cors의 allowCredentials와 동일하게 설정
  credentials: true,
  // 이전 x-google-cors의 maxAge와 동일하게 설정
  maxAge: 3600,
  // Preflight 요청(OPTIONS)에 대한 성공 상태 코드 (중요)
  optionsSuccessStatus: 204 // 또는 200
};

// CORS 설정
app.use(cors(corsOptions));

app.use(express.json());

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

// 장소 검색
app.get('/api/places/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }

    const normalizedQuery = query.toLowerCase();
    
    // 1. 자주 검색되는 장소에서 검색
    const frequentPlaces = await getFrequentPlaces();
    const frequentResults = frequentPlaces.filter(place => 
      place.name.toLowerCase().includes(normalizedQuery) ||
      place.location.toLowerCase().includes(normalizedQuery) ||
      place.searchKeywords.some(keyword => 
        keyword.toLowerCase().includes(normalizedQuery)
      )
    );

    if (frequentResults.length > 0) {
      return res.json(frequentResults.map(attachDynamicFields));
    }

    // 2. 전체 장소에서 검색
    const results = Array.from(cache.places.values())
      .filter(place => 
        place.name.toLowerCase().includes(normalizedQuery) ||
        place.location.toLowerCase().includes(normalizedQuery) ||
        place.searchKeywords.some(keyword => 
          keyword.toLowerCase().includes(normalizedQuery)
        )
      )
      .map(place => ({
        ...place,
        currentCrowd: cache.getVariableData(place.id)?.crowd ?? 0
      }));

    res.json(results);
  } catch (error) {
    console.error('검색 중 오류 발생:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 장소 상세 정보
app.get('/api/places', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: '장소 ID가 필요합니다.' });
    }
    
    // 호출 빈도 업데이트
    await updateFrequency(id);
    
    const place = cache.getPlace(id);
    if (!place) {
      return res.status(404).json({ error: '장소를 찾을 수 없습니다.' });
    }

    const details = await FileUtils.getPlaceDetails(id);
    const currentData = cache.getVariableData(id);

    const enrichedData = attachDynamicFields({
      ...place,
      ...details,
      currentData
    });

    res.json(enrichedData);
  } catch (error) {
    console.error('상세 정보 조회 중 오류 발생:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 자주 검색되는 장소 목록
app.get('/api/places/frequent', async (req, res) => {
  try {
    const frequentPlaces = await getFrequentPlaces();
    const enrichedList = frequentPlaces.map(attachDynamicFields);
    res.json(enrichedList);
  } catch (error) {
    console.error('자주 검색되는 장소 목록 조회 중 오류 발생:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 실시간 데이터 업데이트
app.post('/api/places/update', async (req, res) => {
  try {
    const { id } = req.query;
    const { crowd, weather } = req.body;

    if (!id) {
      return res.status(400).json({ error: '장소 ID가 필요합니다.' });
    }

    if (!crowd || !weather) {
      return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }

    const currentData = {
      crowd,
      weather,
      lastUpdated: new Date().toISOString()
    };

    cache.setVariableData(id, currentData);
    await FileUtils.updateVariableData(Object.fromEntries(cache.variableData));

    res.json({ success: true });
  } catch (error) {
    console.error('데이터 업데이트 중 오류 발생:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
  console.error('에러 발생:', err);
  
  const errorResponse = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }
  };

  res.status(err.status || 500).json(errorResponse);
});

// 서버 시작
const PORT = process.env.PORT || 8080;
console.log('서버 시작 시도...');
console.log(`PORT: ${PORT}`);

try {
  app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  });
} catch (error) {
  console.error('서버 시작 실패:', error);
  process.exit(1);
}
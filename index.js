// index.js

import express from 'express';
import cors from 'cors'; // <--- cors import 추가
import { readJSON } from './fileUtils.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces, getFrequentPlaces } from './frequentUpdater.js';
import { attachDynamicFields } from './generateData.js';
import { CacheManager } from './cache.js';

const app = express();
const cache = new CacheManager();

// --- CORS 미들웨어 설정 ---
const corsOptions = {
  // 이전 x-google-cors의 allowOrigins와 동일하게 설정
  origin: ["http://localhost:5173", "https://seoseongwon.gitlab.io", "https://predictourist.com"],
  // 이전 x-google-cors의 allowMethods와 동일하게 설정 (OPTIONS 포함)
  methods: "GET, POST, OPTIONS",
  // 이전 x-google-cors의 allowHeaders와 동일하게 설정
  allowedHeaders: "Authorization, Content-Type",
  // 이전 x-google-cors의 exposeHeaders와 동일하게 설정
  exposedHeaders: "Content-Length, Content-Range",
  // 이전 x-google-cors의 allowCredentials와 동일하게 설정
  credentials: true,
  // 이전 x-google-cors의 maxAge와 동일하게 설정
  maxAge: 3600,
  // Preflight 요청(OPTIONS)에 대한 성공 상태 코드 (중요)
  optionsSuccessStatus: 204 // 또는 200
};
app.use(cors(corsOptions)); // <--- 모든 라우트 전에 CORS 미들웨어 적용

app.get('/searchPlaces', async (req, res) => {
  try {
    const query = req.query.query?.toLowerCase();
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: '검색어(query 파라미터)가 필요합니다.' });
    }
    
    // 전체 캐시 확인
    if (cache.isAllPlacesValid()) {
      const results = cache.getAllPlaces().filter(p => 
        p.name.toLowerCase().includes(query)
      );
      return res.json(results);
    }

    // 캐시 미스 시 파일에서 읽기
    const allPlaces = await readJSON('places.json');
    cache.setAllPlaces(allPlaces);  // 캐시 저장
    
    const filteredResults = allPlaces.filter(place => 
      place.name.toLowerCase().includes(query)
    );
    
    // 동적 데이터를 추가하여 응답합니다.
    const enrichedResults = filteredResults.map(attachDynamicFields);
    
    res.status(200).json(enrichedResults);
  } catch (error) {
    console.error('Error in searchPlaces:', error);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

// /places 엔드포인트는 개별 조회만 지원합니다.
// id 파라미터가 없으면 에러를 반환합니다.
app.get('/places', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ error: '관광지 개별 조회를 위해 id 파라미터가 필요합니다.' });
    }

    const placeId = parseInt(id);
    if (isNaN(placeId)) {
      return res.status(400).json({ error: '유효한 관광지 ID가 아닙니다.' });
    }


    console.log(`[${new Date().toISOString()}] Calling updateFrequency for id: ${placeId}`);
    await updateFrequency(placeId); // Note: This is called without await, might be intentional but could hide errors
    console.log(`[${new Date().toISOString()}] Calling updateFrequentPlaces`);
    await updateFrequentPlaces(); // This one is awaited

    console.log(`[${new Date().toISOString()}] Checking cache for id: ${placeId}`);
    const cachedPlace = cache.getPlace(placeId);
    if (cachedPlace) {
      console.log(`[${new Date().toISOString()}] Cache hit for id: ${placeId}`);
      return res.status(200).json(cachedPlace);
    }
    console.log(`[${new Date().toISOString()}] Cache miss for id: ${placeId}. Reading from GCS.`);

    const allPlaces = await readJSON('places.json');
    console.log(`[${new Date().toISOString()}] Read places.json successfully.`);

    const target = allPlaces.find(p => p.id === placeId);
    if (!target) {
      console.log(`[${new Date().toISOString()}] Place not found for id: ${placeId}`);
      return res.status(404).json({ error: '관광지 정보를 찾을 수 없습니다.' });
    }
    console.log(`[${new Date().toISOString()}] Place found for id: ${placeId}. Attaching dynamic fields.`);

    const enriched = attachDynamicFields(target);
    console.log(`[${new Date().toISOString()}] Setting cache for id: ${placeId}`);
    cache.setPlace(placeId, enriched);

    console.log(`[${new Date().toISOString()}] Sending successful response for id: ${placeId}`);

    // 개별 조회 시 호출 빈도 업데이트
    updateFrequency(placeId);
    // 호출 빈도 업데이트 후 자주 호출되는 관광지 목록도 갱신
    await updateFrequentPlaces();

    // 캐시에 이미 존재하면 캐시된 데이터를 바로 반환
    const cachedPlace = cache.getPlace(placeId);
    if (cachedPlace) {
      return res.status(200).json(cachedPlace);
    }

    // 캐시에 없으면, places.json에서 대상 데이터를 읽어옴
    const allPlaces = await readJSON('places.json');
    const target = allPlaces.find(p => p.id === placeId);
    if (!target) {
      return res.status(404).json({ error: '관광지 정보를 찾을 수 없습니다.' });
    }

    // 동적 데이터를 붙여서 결과 생성 및 캐싱
    const enriched = attachDynamicFields(target);
    cache.setPlace(placeId, enriched);
    
    return res.status(200).json(enriched);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in /places handler for id: ${req.query.id}:`, error.stack || error);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

// /frequentPlaces 엔드포인트는 단순히 자주 호출되는 관광지 목록을 반환합니다.
app.get('/frequentPlaces', async (req, res) => {
  try {
    const frequentPlaces = await getFrequentPlaces();
    const enrichedList = frequentPlaces.map(attachDynamicFields);
    res.status(200).json(enrichedList);
  } catch (error) {
    console.error('Error in frequentPlaces:', error);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
});

// Cloud Run에서 요구하는 PORT 사용
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
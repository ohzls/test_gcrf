import express from 'express';
import { readJSON } from './fileUtils.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces, getFrequentPlaces } from './frequentUpdater.js';
import { attachDynamicFields } from './generateData.js';
import { CacheManager } from './cache.js';

const app = express();
const cache = new CacheManager();

// 환경 변수 설정
const CLOUD_RUN_TOKEN = process.env.CLOUD_RUN_TOKEN || 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDCVkbqg5jrjvja9O96w2BKHlJQoqzsNGscmrhweCFKvrSyjMmiEu5OZ4/ZNjEx/69HVw6ZbpYfXo1bYuynlPFE+I1eTThe8ukY6MtCoak6cR1JcA59KrsGkGBWTJNSWkb/qMQACyl21OITqPmqcXbx/SreAonecrSca49qyi2mtSQA0MsHghIleol3kDwtvFUUmGTR3Bfb9TdC6IHQKJpSRALjrRms6PiG4vT7PyKDY9sm8rFmT+Ruz+ikCbHHYYb9mqgazVQsEgW3AZhAIE5wKOutNmhFd6qOUnrKvSq9vAYigTdMBkLuOV5OVfnSGP4HArQF1oVhCV6ElUYNQs/9';

// CORS 미들웨어 설정
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  next();
});

// 토큰 검증 미들웨어
app.use((req, res, next) => {
  // OPTIONS 요청은 검증하지 않음
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: '유효하지 않은 토큰 형식입니다.' });
  }

  // 토큰 검증 로직
  try {
    // 임시로 단순 비교만 수행
    if (token !== CLOUD_RUN_TOKEN) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ error: '토큰 검증 중 오류가 발생했습니다.' });
  }
});

// 개별 조회 (/places)는 기존 방식대로 id 기반 조회를 유지할 수 있습니다.
// 이제 서버 측 검색을 위한 새로운 엔드포인트를 추가합니다.

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
    console.error('Error in places:', error);
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
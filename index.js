import express from 'express';
import fs from 'fs';
import { readJSON } from './fileUtils.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces } from './frequentUpdater.js';
import { attachDynamicFields } from './generateData.js';
import { CacheManager } from './cache.js';

const app = express();

const cache = new CacheManager();

let allPlacesCache = null;            // places.json 전체 데이터를 읽기 위한 캐시
let individualPlaceCache = {};        // 개별 조회된 관광지 정보를 캐싱하는 객체

// 개별 조회 (/places)는 기존 방식대로 id 기반 조회를 유지할 수 있습니다.
// 이제 서버 측 검색을 위한 새로운 엔드포인트를 추가합니다.

app.get('/searchPlaces', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  const query = req.query.query.toLowerCase();
  
  // 전체 캐시 확인
  if (cache.isAllPlacesValid()) {
    const results = cache.getAllPlaces().filter(p => 
      p.name.toLowerCase().includes(query)
    );
    return res.json(results);
  }

  // 캐시 미스 시 파일에서 읽기
  const allPlaces = readJSON('places.json');
  cache.setAllPlaces(allPlaces);  // 캐시 저장
  
  const searchQuery = req.query.query;
  if (!searchQuery || searchQuery.trim().length === 0) {
    return res.status(400).json({ error: '검색어(query 파라미터)가 필요합니다.' });
  }

  // 캐싱: 한 번 로드된 places.json 데이터는 allPlacesCache에 저장합니다.
  if (!allPlacesCache) {
    allPlacesCache = readJSON('places.json');
  }
  
  // 서버 측에서 검색어를 소문자화해서 대소문자 구분 없이 필터링
  const lowerQuery = searchQuery.trim().toLowerCase();
  
  const filteredResults = allPlacesCache.filter(place => 
    place.name.toLowerCase().includes(lowerQuery)
  );
  
  // 동적 데이터를 추가하여 응답합니다.
  const enrichedResults = filteredResults.map(attachDynamicFields);
  
  res.status(200).json(enrichedResults);
});

// /places 엔드포인트는 개별 조회만 지원합니다.
// id 파라미터가 없으면 에러를 반환합니다.
app.get('/places', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: '관광지 개별 조회를 위해 id 파라미터가 필요합니다.' });
  }

  const placeId = parseInt(id);
  if (isNaN(placeId)) {
    return res.status(400).json({ error: '유효한 관광지 ID가 아닙니다.' });
  }

  // 개별 조회 시 호출 빈도 업데이트
  updateFrequency(placeId, cache); // 캐시 객체 전달
  // (선택적으로) 호출 빈도 업데이트 후 자주 호출되는 관광지 목록도 갱신합니다.
  updateFrequentPlaces();

  // 캐시에 이미 존재하면 캐시된 데이터를 바로 반환
  if (individualPlaceCache[placeId]) {
    return res.status(200).json(individualPlaceCache[placeId]);
  }

  // 캐시에 없으면, places.json에서 대상 데이터를 읽어옴
  if (!allPlacesCache) {
    allPlacesCache = readJSON('places.json');
  }
  const target = allPlacesCache.find(p => p.id === placeId);
  if (!target) {
    return res.status(404).json({ error: '관광지 정보를 찾을 수 없습니다.' });
  }

  // 동적 데이터를 붙여서 결과 생성 및 캐싱
  const enriched = attachDynamicFields(target);
  individualPlaceCache[placeId] = enriched;
  
  return res.status(200).json(enriched);
});

// /frequentPlaces 엔드포인트는 단순히 자주 호출되는 관광지 목록을 반환합니다.
app.get('/frequentPlaces', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  const frequentPlaces = readJSON('frequentPlaces.json');
  const enrichedList = frequentPlaces.map(attachDynamicFields);
  res.status(200).json(enrichedList);
});

// Cloud Run에서 요구하는 PORT 사용
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// 파일 변경 감지 로직 추가
['places.json', 'frequentPlaces.json'].forEach(file => {
  fs.watch(file, () => {
    cache.invalidateAll();
    console.log(`${file} 변경 감지, 전체 캐시 무효화`);
  });
});
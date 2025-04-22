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

function isValidPlace(place) {
  // 가장 기본적인 검사: place 객체이고 name 속성이 문자열인지 확인
  // 필요에 따라 address 등 다른 필수 필드 검사 추가 가능
  if (!place || typeof place !== 'object') {
    console.warn('[isValidPlace] 유효하지 않은 place 데이터 (객체 아님):', place);
    return false;
  }
  if (typeof place.name !== 'string' || place.name.trim() === '') {
    console.warn('[isValidPlace] name 속성이 없거나 비어있음:', place);
    return false;
  }
  // 필요하다면 주소 타입 검사 등 추가
  // if (typeof place.address !== 'string') { ... }

  return true; // 기본 검사를 통과하면 유효하다고 간주
}

// 장소 검색 (1차 호출) - "이어 붙이기" 위한 백엔드 로직 수정
app.get('/api/places/search', async (req, res, next) => {
  try {
    // 1. 쿼리 파라미터 가져오기 및 검증
    const { query, showAll } = req.query; // showAll 파라미터 읽기
    if (!query || typeof query !== 'string') {
      throw new AppError('유효하지 않은 검색어입니다.', 400);
    }
    const normalizedQuery = query.toLowerCase();
    const isShowAll = showAll === 'true'; // "더보기" 요청 여부

    // 2. 자주 찾는 장소 정보 미리 가져오기 (두 경우 모두 필요할 수 있음)
    const frequentPlaces = await getFrequentPlaces();

    // 3. showAll=false (초기 검색): 자주 찾는 장소 먼저 검색
    if (!isShowAll) {
      const frequentResults = frequentPlaces.filter(place => {
        if (!isValidPlace(place)) return false;
        const nameMatch = place.name.toLowerCase().includes(normalizedQuery);
        const addressMatch = (typeof place.address === 'string')
                         ? place.address.toLowerCase().includes(normalizedQuery)
                         : false;
        return nameMatch || addressMatch;
      });

      // 자주 찾는 목록에서 결과가 있으면, 해당 결과만 반환 (frequentOnly: true 플래그 포함)
      if (frequentResults.length > 0) {
        return res.json({ results: frequentResults, frequentOnly: true });
      }
      // 자주 찾는 목록에 결과가 없으면 아래 로직으로 (이때 isShowAll은 false)
    }

    // 4. showAll=true ("더보기" 요청) 또는 (초기 검색 && frequent 결과 없음)
    console.log(`[Search] Processing full list (showAll=${isShowAll}) for query: "${query}"`);

    // 4-1. 전체 장소 목록 가져와서 쿼리로 필터링
    const allPlaces = Array.from(cache.places.values());
    const filteredAll = allPlaces.filter(place => {
      if (!isValidPlace(place)) return false;
      const nameMatch = place.name.toLowerCase().includes(normalizedQuery);
      const addressMatch = (typeof place.address === 'string')
                       ? place.address.toLowerCase().includes(normalizedQuery)
                       : false;
      return nameMatch || addressMatch;
    });

    // 4-2. 반환할 결과 결정 및 정렬
    let resultsToReturn;
    let sortTarget = 'none'; // 정렬 대상 로그용

    if (isShowAll) {
      // ★★★ "더보기" 요청 시 로직 ★★★
      sortTarget = 'remaining items';
      console.log('[Search] showAll=true: Filtering out frequent places.');

      // 현재 쿼리로 필터링된 '자주 찾는 장소' 목록의 ID Set 생성 (중복 제거 및 빠른 검색 위함)
      const filteredFrequentIds = new Set(
        frequentPlaces // 위에서 이미 로드함
            .filter(place => { // 동일한 필터링 로직 적용
                if (!isValidPlace(place)) return false;
                const nameMatch = place.name.toLowerCase().includes(normalizedQuery);
                const addressMatch = (typeof place.address === 'string') ? place.address.toLowerCase().includes(normalizedQuery) : false;
                return nameMatch || addressMatch;
            })
            .map(place => place.id)
      );
      console.log(`[Search] showAll=true: Found ${filteredFrequentIds.size} frequent place IDs matching query.`);

      // 전체 필터링 결과에서 frequent 결과 *제외* (ID 기준) -> 나머지 항목들
      let remainingItems = filteredAll.filter(place => !filteredFrequentIds.has(place.id));
      console.log(`[Search] showAll=true: Found ${remainingItems.length} remaining items to return.`);

      // 나머지 아이템들만 빈도순 정렬
      resultsToReturn = remainingItems; // 정렬 전에 할당 (try-catch 안에서도 접근 가능하도록)
      try {
          const frequencies = cache.frequencies || new Map();
          resultsToReturn.sort((a, b) => { // remainingItems를 정렬
              const freqA = frequencies.get(a.id) || 0;
              const freqB = frequencies.get(b.id) || 0;
              return freqB - freqA; // 빈도 높은 순
          });
      } catch (sortError) {
          console.error(`[Search] Error during frequency sorting (${sortTarget}):`, sortError);
          // 정렬 실패 시 정렬 안된 remainingItems가 반환됨
      }

    } else {
      // ★★★ 초기 검색 시 frequent 결과 없어서 전체 검색한 경우 ★★★
      sortTarget = 'full results';
      // 이때는 전체 필터링 결과를 정렬해서 반환해야 함 (제외할 frequent 결과가 없음)
      resultsToReturn = filteredAll; // 정렬 전에 할당
       try {
          const frequencies = cache.frequencies || new Map();
          resultsToReturn.sort((a, b) => { // filteredAll (전체 결과)를 정렬
              const freqA = frequencies.get(a.id) || 0;
              const freqB = frequencies.get(b.id) || 0;
              return freqB - freqA; // 빈도 높은 순
          });
       } catch (sortError) {
          console.error(`[Search] Error during frequency sorting (${sortTarget}):`, sortError);
          // 정렬 실패 시 정렬 안된 filteredAll이 반환됨
       }
    }
    console.log(`[Search] Sorting complete for ${sortTarget}. Returning ${resultsToReturn.length} items.`);

    // frequentOnly는 항상 false (초기 frequent 검색에서 걸리지 않았거나, '더보기' 요청 결과이므로)
    res.json({ results: resultsToReturn, frequentOnly: false });

  } catch (error) {
    next(error); // 에러는 중앙 에러 핸들러로 전달
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
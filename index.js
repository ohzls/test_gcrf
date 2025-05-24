// index.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cache from './cache.js';
import FileUtils, { getKtoCongestionData, saveKtoCongestionData } from './fileUtils.js';
import { isNaN } from './utils.js';
import { updateFrequency } from './frequencyManager.js';
import { updateFrequentPlaces, getFrequentPlaces } from './frequentUpdater.js';
import { handleError, AppError } from './errorHandler.js';
import { logRequest } from './monitoring.js';
import { config } from './config.js';
import fetch from 'node-fetch';

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

app.set('trust proxy', 1); // Google Cloud 환경에서는 보통 1로 설정

app.use(cors(corsOptions));
app.use(express.json());

// 요청 제한 설정
const apiLimiter = rateLimit(config.api.rateLimit);
app.use('/api/', apiLimiter);

// 요청 로깅
app.use(logRequest);

// 기본 경로 추가
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});


// --- ★★★ KTO API 직접 호출 헬퍼 함수 (별도 파일 분리 권장) ★★★ ---
async function fetchKtoApiDirectly(areaCd, signguCd, tourismName) {
  const ktoServiceKey = "zXAUUzWGYyqVJ2Sjs5%2FYMAuZSvrLnCVkAXE9mQBT5wYhg9IembK9FDYBwEY42xDZIwHkMHWH%2Bf1sreY1J9Exrw%3D%3D";
  if (!ktoServiceKey) {
    console.error('[KTO Helper] KTO 서비스 키가 환경 변수에 설정되지 않았습니다.');
    // 실제 운영 시에는 에러를 throw 하거나 기본값을 반환하는 등 정책 필요
    return null; // 또는 throw new Error(...)
  }

  const mobileOS = "ETC";
  const mobileApp = "Predictourist_Backend";
  const ktoApiBaseUrl = 'http://apis.data.go.kr/B551011/TatsCnctrRateService/tatsCnctrRatedList';

  // 서비스 키는 URL에 직접 포함 (인코딩된 키를 환경 변수에 저장했다고 가정)
  let ktoApiUrl = `${ktoApiBaseUrl}?serviceKey=${ktoServiceKey}`;

  // 나머지 파라미터들 (requests 라이브러리 대신 직접 인코딩 필요 시 주의)
  const params = new URLSearchParams({
    MobileOS: mobileOS,
    MobileApp: mobileApp,
    areaCd: areaCd,
    signguCd: signguCd,
    _type: 'json',
    numOfRows: '1000' // 충분히 큰 값
  });
  if (tourismName) {
    params.append('tAtsNm', tourismName);
  }

  ktoApiUrl += '&' + params.toString();

  console.log(`[KTO Helper] Calling KTO API: ${ktoApiUrl.replace(ktoServiceKey, 'SERVICE_KEY_HIDDEN')}`); // 로그에는 키 숨김

  try {
    const response = await fetch(ktoApiUrl, { timeout: 15000 }); // 타임아웃 설정 (15초)

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[KTO Helper] KTO API Error Status: ${response.status}`, errorText);
      // 오류 발생 시 null 반환 (또는 에러 throw)
      return null;
    }

    const data = await response.json();

    console.log('[KTO Helper] RAW KTO JSON Response:', JSON.stringify(data, null, 2));

    // KTO API 결과 코드 확인
    if (data.response?.header?.resultCode !== '0000') {
      const resultCode = data.response?.header?.resultCode;
      const resultMsg = data.response?.header?.resultMsg || 'KTO Unknown Error';
      console.error(`[KTO Helper] KTO API Business Error: ${resultCode} - ${resultMsg}`);
      // 데이터 없음(03)은 정상 처리 가능
      if (resultCode === '03') return null;
      // 다른 오류는 null 반환 (또는 에러 throw)
      return null;
    }

    // 성공 시 body 반환 (items 포함)
    return data.response?.body;

  } catch (error) {
    console.error('[KTO Helper] Fetch error:', error);
    return null; // 네트워크 오류 등 발생 시 null 반환
  }
}
// --- ★★★ KTO API 헬퍼 함수 끝 ★★★ ---

// --- KTO 연관 관광지 API (키워드 기반) 호출 헬퍼 ---
async function fetchNearbyAttractionsByKeyword(tAtsNm, baseYm, areaCd, signguCd) {
  // 1. 필수 파라미터 체크
  if (!tAtsNm || !baseYm || !areaCd || !signguCd) {
    console.warn('[KTO Nearby Keyword] 필수 파라미터 누락:', { tAtsNm, baseYm, areaCd, signguCd });
    return [];
  }

  const serviceKey = 'zXAUUzWGYyqVJ2Sjs5%2FYMAuZSvrLnCVkAXE9mQBT5wYhg9IembK9FDYBwEY42xDZIwHkMHWH%2Bf1sreY1J9Exrw%3D%3D';
  const url = 'https://apis.data.go.kr/B551011/TarRlteTarService1/searchKeyword1';
  const params = new URLSearchParams({
    pageNo: '1',
    numOfRows: '10000',
    MobileOS: 'ETC',
    MobileApp: 'AppTest',
    // baseYM: baseYm,
    baseYm: 2503,
    areaCd: areaCd,
    signguCd: signguCd,
    keyword: tAtsNm,
    _type: 'json'
  });
  const fullUrl = `${url}?serviceKey=${serviceKey}&${params.toString()}`;
  console.log('[KTO Nearby Keyword] 요청 URL:', fullUrl);

  try {
    const resp = await fetch(fullUrl, { timeout: 10000 });
    console.log('[KTO Nearby Keyword] fetch 완료');
    const text = await resp.text();
    console.log('[KTO Nearby Keyword] 응답 text:', text.slice(0, 500));
    let data;
    try {
      data = JSON.parse(text);
      console.log('[KTO Nearby Keyword] JSON 파싱 성공');
    } catch (e) {
      console.error('KTO Nearby Keyword API 응답이 JSON이 아님:', text);
      return [];
    }
    if (data.response?.header?.resultCode !== '0000') {
      const resultCode = data.response?.header?.resultCode;
      const resultMsg = data.response?.header?.resultMsg || 'KTO Unknown Error';
      console.error(`[KTO Nearby Keyword] KTO API Business Error: ${resultCode} - ${resultMsg}`);
      return [];
    }
    const itemsRaw = data?.response?.body?.items;
    console.log('[KTO Nearby Keyword] itemsRaw:', itemsRaw);
    let items;
    if (Array.isArray(itemsRaw?.item)) {
      items = itemsRaw.item;
    } else if (itemsRaw?.item) {
      items = [itemsRaw.item];
    } else if (itemsRaw === "" || itemsRaw == null) {
      items = [];
    } else {
      items = [];
    }
    console.log('[KTO Nearby Keyword] items length:', items.length);
    console.log('[KTO Nearby Keyword] items:', items);
    // ↓↓↓ 프론트로 내려가는 값도 로그
    console.log('[KTO Nearby Keyword] 최종 nearbyAttractions:', items);
    return items;
  } catch (e) {
    console.error('[KTO Nearby Keyword] API 호출 실패:', e);
    return [];
  }
}

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
        return nameMatch;
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
      return nameMatch;
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
            return nameMatch;
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

// --- ★★★ 신규 엔드포인트 추가: 장소 좌표 정보 조회 (2단계 호출용) ★★★ ---
app.get('/api/places/coordinates', async (req, res, next) => {
  console.log('[DEBUG] /api/places/coordinates route defined successfully');
  try {
    const { id } = req.query;

    // 1. 입력값 검증 (ID 필수)
    if (!id || typeof id !== 'string') {
      throw new AppError('유효하지 않은 장소 ID입니다.', 400);
    }

    // 2. 장소 상세 정보 파일 읽기 시도
    // FileUtils.getPlaceDetails는 전체 상세 정보를 읽어옴.
    // 좌표만 필요하지만, 효율성을 위해 일단 전체 파일을 읽고 필요한 부분만 추출.
    // (만약 place_details.json 파일이 매우 크다면 좌표만 따로 저장/읽는 방식 고려)
    console.log(`[Coordinates] Attempting to fetch details for coordinates. ID: ${id}`);
    const details = await FileUtils.getPlaceDetails(id); // 기존 함수 재활용

    // 3. 좌표 정보 추출 및 확인
    // **주의:** 실제 place_details.json 파일에 'coordinates' 키 아래에
    //        { lat: 숫자, lng: 숫자 } 형태의 데이터가 있다고 가정합니다.
    //        만약 데이터 구조가 다르거나 필드가 없다면 이 부분을 수정해야 합니다.
    const coordinates = details?.coordinates; // 옵셔널 체이닝 사용
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      // 파일이 없거나(readJSON이 {} 반환), coordinates 필드가 없거나, 형식이 잘못된 경우
      console.warn(`[Coordinates] Coordinates data not found or invalid for ID: ${id}. Details fetched:`, details);
      // 404 에러를 반환하여 클라이언트에게 정보 없음을 알림
      throw new AppError('좌표 정보를 찾을 수 없습니다.', 404);
    }

    // 4. 좌표 정보만 JSON으로 응답
    console.log(`[Coordinates] Returning coordinates for ID: ${id}`, coordinates);
    res.json(coordinates); // 예: { "lat": 37.5796, "lng": 126.9770 }

  } catch (error) {
    // AppError 또는 기타 에러는 중앙 에러 핸들러로 전달
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

    let yyMMdd; // 사용할 날짜 변수 (yyMMdd 형식)
    if (date) { // date는 'YYYY-MM-DD'
      // YYYY-MM-DD -> yyMMdd 변환
      yyMMdd = date.substring(2, 4) + date.substring(5, 7) + date.substring(8, 10);
    }
    console.log(`[Details] Using date yyMMdd: ${yyMMdd}`);

    // 병렬 데이터 로드
    const [place, details, variableData] = await Promise.all([
      cache.getPlace(id),
      FileUtils.getPlaceDetails(id),
      FileUtils.getVariableData(id, date)
    ]);

    if (!place) {
      throw new AppError('장소를 찾을 수 없습니다.', 404);
    }

    try {
      await updateFrequency(id); // frequencyManager.js의 함수 호출
      console.log(`[Frequency] Updated frequency for place ID: ${id}`);
    } catch (freqError) {
      console.error(`[Frequency] Failed to update frequency for place ID: ${id}`, freqError);
      // 빈도수 업데이트 실패는 전체 요청 실패로 간주하지 않음
    }

    let ktoCongestionRate = null; // 최종 반환될 혼잡도 값

    if (details.areaCd && details.signguCd) { // 필수 코드 확인
      try {
        // 3-1. GCS 캐시에서 KTO 데이터 조회 시도
        const cachedKtoData = await getKtoCongestionData(yyMMdd, id); // 수정된 FileUtils 함수 사용

        if (cachedKtoData && cachedKtoData.congestionRate !== undefined && cachedKtoData.congestionRate !== null) {
          console.log(`[KTO Cache] Cache HIT for place ${id} on ${yyMMdd}`);
          ktoCongestionRate = cachedKtoData.congestionRate;
        } else {
          console.log(`[KTO Cache] Cache MISS for place ${id} on ${yyMMdd}. Fetching from KTO API...`);
          // 3-2. 캐시 없으면 KTO API 호출 (헬퍼 함수 사용)
          const ktoApiResponse = await fetchKtoApiDirectly(
            details.areaCd,
            details.signguCd,
            details.name // tAtsNm으로 사용될 관광지 이름
          );
          console.log('[DEBUG] ktoApiResponse (response.body) received:', JSON.stringify(ktoApiResponse, null, 2));

          if (ktoApiResponse?.items) {
            const items = ktoApiResponse.items;
            console.log('[DEBUG] ktoApiResponse.items content:', JSON.stringify(items, null, 2));
            const itemsToProcess = Array.isArray(items?.item) ? items.item : (items?.item ? [items.item] : []); // item 없을 경우 빈 배열 처리 추가
            console.log(`[DEBUG] itemsToProcess length: ${itemsToProcess.length}`);
            const savePromises = []; // 비동기 저장을 위한 Promise 배열

            for (const item of itemsToProcess) {
              console.log(`[DEBUG] Inside save loop, processing item:`, item);
              const itemYmd = item?.baseYmd; // KTO 응답은 여전히 YYYYMMDD
              if (itemYmd && item.cnctrRate !== undefined) {
                // --- ★★★ 저장 시 yyMMdd 형식으로 변환하여 전달 ★★★ ---
                const itemyyMMdd = itemYmd.slice(2); // YYYYMMDD -> yyMMdd
                savePromises.push(
                  saveKtoCongestionData(itemyyMMdd, id, item) // 변환된 yyMMdd 전달
                    .catch(saveErr => console.error(`[KTO Save] Failed for ${id} on ${itemyyMMdd}:`, saveErr))
                );
                // --- ★★★ ---

                // 프론트가 요청한 날짜(yyMMdd)와 비교
                if (itemyyMMdd === yyMMdd) { // 비교 대상도 yyMMdd
                  const rate = parseFloat(item.cnctrRate);
                  ktoCongestionRate = isNaN(rate) ? null : rate;
                }
              }
            }
            // 저장 작업 완료를 기다리지 않음
            Promise.allSettled(savePromises).then(results => {
              const savedCount = results.filter(r => r.status === 'fulfilled').length;
              console.log(`[KTO Save] Background save attempts finished for place ${id}. Success: ${savedCount}/${results.length}`);
            });

          } else {
            console.warn(`[KTO API] No items received for ${details.name} (${details.areaCd}/${details.signguCd})`);
          }
        }
      } catch (ktoError) {
        console.error(`[KTO] Error processing KTO data for place ${id}:`, ktoError);
        // KTO 데이터 처리 중 오류 발생 시에도 null 반환 (선택적)
        ktoCongestionRate = null;
      }
    } else {
      console.warn(`[KTO] Missing areaCd or signguCd for place ${id}. Cannot fetch KTO data.`);
    }

    const baseYm = (date ? date.replace(/-/g, '').slice(0, 6) : new Date().toISOString().slice(0, 7).replace('-', ''));
    let nearbyAttractions = [];
    if (details.name) {
      nearbyAttractions = await fetchNearbyAttractionsByKeyword(details.name, baseYm, details.areaCd, details.signguCd);
    }

    // 응답 데이터 구조화
    res.json({
      ...details,
      crowd: variableData?.crowd,
      weather: variableData?.weather,
      ktoCongestionRate: ktoCongestionRate,
      nearbyAttractions: nearbyAttractions.map(item => ({
        name: item.rlteTatsNm,
        category: item.rlteCtgryMclsNm,
        rank: item.rlteRank,
        baseYm: item.baseYm
      }))
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

    // weather를 객체로 검증 (status: string, temperature: number)
    if (
      !weather ||
      typeof weather !== 'object' ||
      typeof weather.status !== 'string' ||
      typeof weather.temperature !== 'number'
    ) {
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
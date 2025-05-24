// frequentUpdater.js

import { readJSON, writeJSON } from './fileUtils.js';
import cache from './cache.js';
import { measurePerformance } from './monitoring.js';
import { AppError } from './errorHandler.js';

// 상수 정의
const PLACES_FILE = 'data/base_places.json';
const FREQUENT_FILE = 'data/frequent_places.json';
const FREQUENCY_FILE = 'data/frequency.json';
const FREQUENT_THRESHOLD = 20;

// 유틸리티 함수
function isValidPlace(place) {
  return place && typeof place.id === 'string' && typeof place.name === 'string';
}

function validatePlaceData(place) {
  const requiredFields = ['id', 'name'];
  const missingFields = requiredFields.filter(field => !place?.[field]);
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

const updateFrequentPlaces = measurePerformance(async function updateFrequentPlaces() {
  const logPrefix = `[${new Date().toISOString()}] [FrequentUpdater]`;
  const lockKey = 'frequent_places_update';
  
  if (cache.getLock(lockKey)) {
    console.log(`${logPrefix} Update already in progress`);
    return;
  }
  
  try {
    cache.setLock(lockKey);
    console.log(`${logPrefix} Starting update.`);
    
    // 병렬 데이터 로드
    const [allPlacesData, frequencyData] = await Promise.all([
      readJSON(PLACES_FILE),
      readJSON(FREQUENCY_FILE)
    ]);

    // 데이터 유효성 검사
    if (!allPlacesData?.places) {
      throw new AppError('Invalid places data structure', 500);
    }

    // 필터링 로직 개선
    const frequentPlaces = allPlacesData.places
      .filter(isValidPlace)
      .filter(place => {
        const validation = validatePlaceData(place);
        if (!validation.isValid) {
          console.warn(`${logPrefix} Invalid place data:`, validation.missingFields);
          return false;
        }
        return (frequencyData?.[place.id] || 0) >= FREQUENT_THRESHOLD;
      })
      .map(place => ({
        id: place.id,
        name: place.name,
        address: place.address,
        averageCrowd: place.averageCrowd
      }));

    console.log(`${logPrefix} Found ${frequentPlaces.length} frequent places. Writing to ${FREQUENT_FILE}`);
    
    // 파일 저장 및 캐시 업데이트
    await writeJSON(FREQUENT_FILE, frequentPlaces);
    cache.frequentPlaces = frequentPlaces;

    return frequentPlaces;
  } catch (error) {
    console.error(`${logPrefix} Update failed:`, error);
    throw error;
  } finally {
    cache.releaseLock(lockKey);
  }
});

const getFrequentPlaces = measurePerformance(async function getFrequentPlaces() {
  const logPrefix = `[${new Date().toISOString()}] [FrequentUpdater]`;
  try {
    // 캐시 확인
    if (cache.frequentPlaces && Array.isArray(cache.frequentPlaces)) {
      console.log(`${logPrefix} Cache hit.`);
      return cache.frequentPlaces;
    }

    console.log(`${logPrefix} Cache miss. Reading from file: ${FREQUENT_FILE}`);
    const dataFromFile = await readJSON(FREQUENT_FILE);

    if (dataFromFile && Array.isArray(dataFromFile)) {
      console.log(`${logPrefix} Successfully read ${dataFromFile.length} frequent places`);
      cache.frequentPlaces = dataFromFile;
      return dataFromFile;
    } else {
      console.warn(`${logPrefix} Invalid or empty data read from ${FREQUENT_FILE}`);
      cache.frequentPlaces = [];
      return [];
    }
  } catch (error) {
    console.error(`${logPrefix} Error fetching frequent places:`, error);
    throw error;
  }
});

export { updateFrequentPlaces, getFrequentPlaces };

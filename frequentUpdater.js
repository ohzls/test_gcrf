// frequentUpdater.js

import { readJSON, writeJSON } from './fileUtils.js';
import cache from './cache.js';

const PLACES_FILE = 'data/base_places.json';
const FREQUENT_FILE = 'data/frequent_places.json';
const FREQUENT_THRESHOLD = 20;  // 예시: 호출 빈도가 20 이상인 관광지만 자주 호출된 곳으로 처리

async function updateFrequentPlaces() {
  const logPrefix = `[${new Date().toISOString()}] [FrequentUpdater:updateFrequentPlaces]`;
  try {
    console.log(`${logPrefix} Starting update.`);
    // base_places.json과 frequency.json을 읽는 부분은 그대로 둡니다. readJSON이 오류 시 {} 반환.
    const allPlacesData = await readJSON(PLACES_FILE);
    const frequencyData = await readJSON('data/frequency.json');

    // allPlacesData가 { places: [...] } 구조인지, 아니면 [...] 구조인지 확인 필요.
    // 이전 base_places.json 내용을 바탕으로 { places: [...] } 구조라고 가정.
    const placesArray = (allPlacesData && Array.isArray(allPlacesData.places)) ? allPlacesData.places : [];
    if (!allPlacesData || !Array.isArray(allPlacesData.places)) {
        console.warn(`${logPrefix} Invalid structure or no places array in ${PLACES_FILE}`);
    }

    const frequentPlaces = placesArray.filter(place => {
      // frequencyData가 {} 일 경우를 대비하여 || 0 사용
      const count = (frequencyData && place && place.id && frequencyData[String(place.id)]) || 0;
      return count >= FREQUENT_THRESHOLD;
    });

    console.log(`${logPrefix} Found ${frequentPlaces.length} frequent places. Writing to ${FREQUENT_FILE}`);
    // frequentPlaces는 항상 배열이므로 그대로 writeJSON 호출 가능
    await writeJSON(FREQUENT_FILE, frequentPlaces);
    // 캐시 업데이트 (배열로 업데이트)
    cache.frequentPlaces = frequentPlaces;
    console.log(`${logPrefix} Update complete.`);

    return frequentPlaces;
  } catch (error) {
    console.error(`${logPrefix} Error:`, error.stack || error);
    // 실패 시 빈 배열 반환하거나 오류를 다시 throw 할 수 있음
    return [];
  }
}

async function getFrequentPlaces() {
  const logPrefix = `[${new Date().toISOString()}] [FrequentUpdater:getFrequentPlaces]`; // Optional: For better logging
  try {
    // Check cache first - ensure it's an array too
    if (cache.frequentPlaces && Array.isArray(cache.frequentPlaces)) {
      console.log(`${logPrefix} Cache hit.`);
      return cache.frequentPlaces;
    }
    console.log(`${logPrefix} Cache miss or invalid cache. Reading from file: ${FREQUENT_FILE}`);

    const dataFromFile = await readJSON(FREQUENT_FILE); // readJSON returns {} on error/empty

    // Check if dataFromFile is actually an array
    if (dataFromFile && Array.isArray(dataFromFile)) {
      console.log(`${logPrefix} Successfully read and parsed array from ${FREQUENT_FILE}. Length: ${dataFromFile.length}`);
      cache.frequentPlaces = dataFromFile; // Update cache with the valid array
      return dataFromFile;
    } else {
      // Handle cases where readJSON returned {} or non-array data
      console.warn(`${logPrefix} Invalid or empty data read from ${FREQUENT_FILE}. Returning empty array.`);
      cache.frequentPlaces = []; // Store empty array in cache
      return [];
    }
  } catch (error) {
    // This catch block might be less likely to be hit now if readJSON handles errors,
    // but keep it for unexpected issues.
    console.error(`${logPrefix} Error fetching frequent places:`, error.stack || error);
    return []; // Return empty array on any unexpected error
  }
}

export { updateFrequentPlaces, getFrequentPlaces };

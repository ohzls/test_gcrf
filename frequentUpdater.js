// frequentUpdater.js

import { readJSON, writeJSON } from './fileUtils.js';
import cache from './cache.js';

const PLACES_FILE = 'data/base_places.json';
const FREQUENT_FILE = 'data/frequent_places.json';
const FREQUENT_THRESHOLD = 20;  // 예시: 호출 빈도가 20 이상인 관광지만 자주 호출된 곳으로 처리

async function updateFrequentPlaces() {
  try {
    const allPlaces = await readJSON(PLACES_FILE);
    const frequencyData = await readJSON('data/frequency.json');

    const frequentPlaces = allPlaces.filter(place => {
      const count = frequencyData[String(place.id)] || 0;
      return count >= FREQUENT_THRESHOLD;
    });

    await writeJSON(FREQUENT_FILE, frequentPlaces);
    cache.frequentPlaces = frequentPlaces;

    return frequentPlaces;
  } catch (error) {
    console.error('자주 검색되는 장소 업데이트 실패:', error);
    return [];
  }
}

async function getFrequentPlaces() {
  try {
    if (!cache.frequentPlaces) {
      cache.frequentPlaces = await readJSON(FREQUENT_FILE);
    }
    return cache.frequentPlaces;
  } catch (error) {
    console.error('자주 검색되는 장소 조회 실패:', error);
    return [];
  }
}

export { updateFrequentPlaces, getFrequentPlaces };

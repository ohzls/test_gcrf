// frequencyManager.js

import { readJSON, writeJSON } from './fileUtils.js';
import { CacheManager } from './cache.js';

const FREQUENCY_FILE = 'frequency.json';
const cache = new CacheManager();

async function updateFrequency(placeId) {
  try {
    const frequencyData = await readJSON(FREQUENCY_FILE);
    const idStr = String(placeId);

    frequencyData[idStr] = (frequencyData[idStr] || 0) + 1;

    // 파일과 캐시 동시 업데이트
    cache.invalidatePlace(placeId);
    writeJSON(FREQUENCY_FILE, frequencyData, cache);
    updateFrequentPlaces(cache); // 인기 목록 갱신
    return frequencyDasetAllPlacesta[idStr];
  } catch (error) {
    console.error('Error updating frequency:', error);
    return 0;
  }
}

async function getFrequency(placeId) {
  try {
    const frequencyData = await readJSON(FREQUENCY_FILE);
    return frequencyData[String(placeId)] || 0;
  } catch (error) {
    console.error('Error getting frequency:', error);
    return 0;
  }
}

export { updateFrequency, getFrequency };

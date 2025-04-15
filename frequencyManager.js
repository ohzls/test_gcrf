// frequencyManager.js

import { readJSON, writeJSON } from './fileUtils.js';

const FREQUENCY_FILE = 'frequency.json';

function updateFrequency(placeId) {
  const frequencyData = readJSON(FREQUENCY_FILE);
  const idStr = String(placeId);

  frequencyData[idStr] = (frequencyData[idStr] || 0) + 1;

  // 파일과 캐시 동시 업데이트
  cache.invalidatePlace(placeId);
  writeJSON(FREQUENCY_FILE, frequencyData, cache);
  updateFrequentPlaces(cache); // 인기 목록 갱신
  return frequencyData[idStr];
}

function getFrequency(placeId) {
  const frequencyData = readJSON(FREQUENCY_FILE);
  return frequencyData[String(placeId)] || 0;
}

export { updateFrequency, getFrequency };

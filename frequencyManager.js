// frequencyManager.js

import { readJSON, writeJSON } from './fileUtils.js';
import cache from './cache.js';
import { updateFrequentPlaces } from './frequentUpdater.js';

const FREQUENCY_FILE = 'data/frequency.json';

async function updateFrequency(placeId) {
  try {
    const frequencyData = await readJSON(FREQUENCY_FILE);
    const idStr = String(placeId);

    frequencyData[idStr] = (frequencyData[idStr] || 0) + 1;

    // 파일과 캐시 동시 업데이트
    await writeJSON(FREQUENCY_FILE, frequencyData);
    await updateFrequentPlaces();
    return frequencyData[idStr];
  } catch (error) {
    console.error('호출 빈도 업데이트 실패:', error);
    return 0;
  }
}

async function getFrequency(placeId) {
  try {
    const frequencyData = await readJSON(FREQUENCY_FILE);
    return frequencyData[String(placeId)] || 0;
  } catch (error) {
    console.error('호출 빈도 조회 실패:', error);
    return 0;
  }
}

export { updateFrequency, getFrequency };

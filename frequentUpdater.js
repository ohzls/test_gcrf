// frequentUpdater.js

import { readJSON, writeJSON } from './fileUtils.js';

const PLACES_FILE = 'places.json';
const FREQUENT_FILE = 'frequentPlaces.json';
const FREQUENT_THRESHOLD = 20;  // 예시: 호출 빈도가 20 이상인 관광지만 자주 호출된 곳으로 처리

let frequentPlacesCache = null;

function updateFrequentPlaces(cache) {
  const allPlaces = readJSON(PLACES_FILE);
  const frequencyData = readJSON('frequency.json');

  const frequentPlaces = allPlaces.filter(place => {
    const count = frequencyData[String(place.id)] || 0;
    return count >= FREQUENT_THRESHOLD;
  });

  writeJSON(FREQUENT_FILE, frequentPlaces, cache);
  frequentPlacesCache = frequentPlaces;

  return frequentPlaces;
}

function getFrequentPlaces() {
  if (!frequentPlacesCache) {
    frequentPlacesCache = readJSON(FREQUENT_FILE);
  }
  return frequentPlacesCache;
}

export { updateFrequentPlaces, getFrequentPlaces };

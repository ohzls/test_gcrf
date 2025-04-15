// fileUtils.js

import fs from 'fs';
import path from 'path';

function readJSON(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return {};
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

function writeJSON(filename, data, cache) {
  const filePath = path.join(__dirname, filename);
  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonData, 'utf8');

  // 캐시 갱신
  if (filename === 'places.json' && cache.allPlacesCache) {
    cache.allPlacesCache = data;
    Object.keys(data).forEach(id => {
      cache.individualPlaceCache[id] = attachDynamicFields(data[id]);
    });
  }
  if (filename === 'frequentPlaces.json' && cache.frequentPlacesCache) {
    cache.frequentPlacesCache = data;
  }
}

export { readJSON, writeJSON };

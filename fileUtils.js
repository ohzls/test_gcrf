// fileUtils.js

import { Storage } from '@google-cloud/storage';
import { fileURLToPath } from 'url';
import path from 'path';
import { attachDynamicFields } from './generateData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cloud Storage 클라이언트 초기화
const storage = new Storage();
const bucketName = 'run-sources-predictourist-api-us-central1';
const basePath = 'services/popular-places/data/';

async function readJSON(filename) {
  try {
    const filePath = `${basePath}${filename}`;
    const file = storage.bucket(bucketName).file(filePath);
    const [exists] = await file.exists();
    
    if (!exists) {
      console.warn(`File ${filePath} does not exist in bucket ${bucketName}`);
      return {};
    }

    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch (error) {
    console.error(`Error reading ${filename} from Cloud Storage:`, error);
    return {};
  }
}

async function writeJSON(filename, data, cache) {
  try {
    const filePath = `${basePath}${filename}`;
    const file = storage.bucket(bucketName).file(filePath);
    const jsonData = JSON.stringify(data, null, 2);
    
    await file.save(jsonData, {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache'
      }
    });

    // 캐시 갱신
    if (cache) {
      if (filename === 'places.json') {
        const enrichedData = data.map(attachDynamicFields);
        cache.setAllPlaces(enrichedData);
        data.forEach(place => {
          cache.setPlace(place.id, attachDynamicFields(place));
        });
      }
      if (filename === 'frequentPlaces.json') {
        cache.frequentPlaces = data;
      }
    }

    console.log(`Successfully wrote ${filePath} to Cloud Storage`);
  } catch (error) {
    console.error(`Error writing ${filename} to Cloud Storage:`, error);
    throw error;
  }
}

export { readJSON, writeJSON };

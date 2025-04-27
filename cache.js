// cache.js
import FileUtils from './fileUtils.js';
import { config } from './config.js';

class Cache {
  constructor() {
    this.places = new Map();
    this.frequentPlaces = [];
    this.syncInProgress = false;
    this.SYNC_INTERVAL = config.cache.syncInterval;
    this.locks = new Map();
  }

  getLock(key) {
    return this.locks.get(key);
  }

  setLock(key) {
    this.locks.set(key, true);
  }

  releaseLock(key) {
    this.locks.delete(key);
  }

  async initialize() {
    console.log('[Cache] Initializing cache...');
    let retryCount = 0;
    
    while (retryCount < config.cache.maxRetries) {
      try {
        // Promise.all을 사용하여 병렬로 데이터 로드
        const [basePlacesData, frequentPlaces] = await Promise.all([
          FileUtils.getBasePlaces(),
          FileUtils.readJSON('data/frequent_places.json')
        ]);
        
        // 데이터 유효성 검사
        if (!basePlacesData?.places) {
          throw new Error('Invalid base_places.json structure');
        }

        // places Map 초기화
        this.places.clear();
        basePlacesData.places.forEach(place => {
          if (place?.id) {
            this.places.set(String(place.id), place);
          }
        });

        // frequentPlaces 초기화
        this.frequentPlaces = Array.isArray(frequentPlaces) ? frequentPlaces : [];

        // 초기화 완료 로깅
        console.log(`[Cache] Initialized with ${this.places.size} places and ${this.frequentPlaces.length} frequent places`);
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === config.cache.maxRetries) {
          console.error('[Cache] Initialization failed after retries:', error);
          throw error;
        }
        console.log(`[Cache] Retry ${retryCount}/${config.cache.maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  startSync() {
    setInterval(() => this.sync(), this.SYNC_INTERVAL);
  }

  async sync() {
    if (this.syncInProgress) {
      console.log('[Cache] Sync already in progress, skipping...');
      return;
    }
    
    let retryCount = 0;
    
    while (retryCount < config.cache.maxRetries) {
      try {
        this.syncInProgress = true;
        console.log('[Cache] Starting sync...');
        
        // 동기화 작업
        await Promise.all([
          FileUtils.writeJSON('data/frequent_places.json', this.frequentPlaces)
        ]);
        
        console.log('[Cache] Sync completed successfully');
        break;
      } catch (error) {
        retryCount++;
        if (retryCount === config.cache.maxRetries) {
          console.error('[Cache] Sync failed after retries:', error);
          break;
        }
        console.log(`[Cache] Retry ${retryCount}/${config.cache.maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      } finally {
        this.syncInProgress = false;
      }
    }
  }

  getPlace(id) {
    return this.places.get(id);
  }
}

const cache = new Cache();
export { cache as CacheManager };
export default cache;
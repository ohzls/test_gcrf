// cache.js
import FileUtils from './fileUtils.js';

class Cache {
  constructor() {
    this.places = new Map();
    this.variableData = new Map();
    this.syncInProgress = false;
    this.SYNC_INTERVAL = 30000; // 30초
  }

  async initialize() {
    console.log('[Cache] Initializing cache...');
    try {
      console.log('[Cache] Reading base places...');
      const basePlacesData = await FileUtils.getBasePlaces(); // data/base_places.json 읽기
      console.log('[Cache] Read base places data:', basePlacesData ? 'Data received' : 'No data');
  
      // base_places.json이 { "places": [...] } 구조라고 가정하고 처리
      if (basePlacesData && Array.isArray(basePlacesData.places)) {
        console.log(`[Cache] Populating cache with ${basePlacesData.places.length} places...`);
        basePlacesData.places.forEach(place => {
          if (place && place.id) { // place 객체와 id 유효성 검사
            this.places.set(String(place.id), place); // ★★★ place.id ("place_1" 등)를 키로 사용 ★★★
          } else {
            console.warn('[Cache] Invalid place data found:', place);
          }
        });
        console.log(`[Cache] Populated cache map size: ${this.places.size}`);
      } else {
        console.warn('[Cache] base_places.json structure is not { "places": [...] } or places array is missing.');
      }
      // ... variableData 처리 및 sync ...
       console.log('[Cache] Cache initialization completed successfully.');
    } catch (error) {
      console.error('[Cache] Cache initialization failed:', error.stack || error);
    }
  }

  startSync() {
    setInterval(() => this.sync(), this.SYNC_INTERVAL);
  }

  async sync() {
    if (this.syncInProgress) return;
    
    try {
      this.syncInProgress = true;
      
      const variableData = Object.fromEntries(this.variableData);
      await FileUtils.updateVariableData(variableData);
      
      console.log('캐시 동기화 완료');
    } catch (error) {
      console.error('캐시 동기화 실패:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  getPlace(id) {
    return this.places.get(id);
  }

  getVariableData(id) {
    return this.variableData.get(id);
  }

  setVariableData(id, data) {
    this.variableData.set(id, {
      ...data,
      lastUpdated: new Date().toISOString()
    });
    this.sync(); // 변경사항이 있을 때마다 동기화 시도
  }
}

const cache = new Cache();
export { cache as CacheManager };
export default cache;
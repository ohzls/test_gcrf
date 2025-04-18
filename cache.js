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
    try {
      const basePlaces = await FileUtils.getBasePlaces();
      const variableData = await FileUtils.getVariableData();
      
      Object.entries(basePlaces).forEach(([id, data]) => {
        this.places.set(id, data);
      });
      
      Object.entries(variableData).forEach(([id, data]) => {
        this.variableData.set(id, data);
      });
      
      this.startSync();
    } catch (error) {
      console.error('캐시 초기화 실패:', error);
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

export default new Cache();
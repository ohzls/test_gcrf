// cache.js
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class CacheManager {
  constructor() {
    this.allPlaces = null;
    this.individualPlaces = new Map();
    this.frequentPlaces = null;
    this.expiryTimes = {
      allPlaces: 0,
      individual: new Map(),
      frequent: 0
    };
  }

  getPlace(id) {
    if (this.individualPlaces.has(id) && Date.now() < this.expiryTimes.individual.get(id)) {
      return this.individualPlaces.get(id);
    }
    return null;
  }

  setPlace(id, data) {
    this.individualPlaces.set(id, data);
    this.expiryTimes.individual.set(id, Date.now() + ONE_DAY_MS);
  }
  
  invalidateAll() {
    this.allPlaces = null;
    this.expiryTimes.allPlaces = 0;
  }

  invalidatePlace(id) {
    this.individualPlaces.delete(id);
    this.expiryTimes.individual.delete(id);
  }
}
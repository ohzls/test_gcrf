// fileUtils.js

import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucket = storage.bucket('run-sources-predictourist-api-us-central1');

class FileUtils {
  static async getBasePlaces() {
    try {
      const [file] = await bucket.file('data/base_places.json').download();
      return JSON.parse(file);
    } catch (error) {
      console.error('기본 장소 데이터 로드 실패:', error);
      return {};
    }
  }

  static async getPlaceDetails(placeId) {
    try {
      const [file] = await bucket.file(`data/place_details/${placeId}.json`).download();
      return JSON.parse(file);
    } catch (error) {
      console.error('장소 상세 정보 로드 실패:', error);
      return {};
    }
  }

  static async getVariableData() {
    try {
      const [file] = await bucket.file('data/variable_data.json').download();
      return JSON.parse(file);
    } catch (error) {
      console.error('변동 데이터 로드 실패:', error);
      return {};
    }
  }

  static async updateBasePlaces(data) {
    try {
      await bucket.file('data/base_places.json').save(JSON.stringify(data));
    } catch (error) {
      console.error('기본 장소 데이터 업데이트 실패:', error);
      throw error;
    }
  }

  static async updatePlaceDetails(placeId, data) {
    try {
      await bucket.file(`data/place_details/${placeId}.json`).save(JSON.stringify(data));
    } catch (error) {
      console.error('장소 상세 정보 업데이트 실패:', error);
      throw error;
    }
  }

  static async updateVariableData(data) {
    try {
      await bucket.file('data/variable_data.json').save(JSON.stringify(data));
    } catch (error) {
      console.error('변동 데이터 업데이트 실패:', error);
      throw error;
    }
  }
}

export default FileUtils;

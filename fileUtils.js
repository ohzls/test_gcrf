// fileUtils.js

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: 'predictourist-api',
});
const bucket = storage.bucket('run-sources-predictourist-api-us-central1');

class FileUtils {
  static async readJSON(filePath) {
    try {
      const [file] = await bucket.file(filePath).download();
      return JSON.parse(file);
    } catch (error) {
      console.error(`JSON 파일 로드 실패 (${filePath}):`, error);
      return {};
    }
  }

  static async writeJSON(filePath, data) {
    try {
      await bucket.file(filePath).save(JSON.stringify(data));
    } catch (error) {
      console.error(`JSON 파일 저장 실패 (${filePath}):`, error);
      throw error;
    }
  }

  static async getBasePlaces() {
    return this.readJSON('data/base_places.json');
  }

  static async getPlaceDetails(placeId) {
    return this.readJSON(`data/place_details/${placeId}.json`);
  }

  static async getVariableData() {
    return this.readJSON('data/variable_data.json');
  }

  static async updateBasePlaces(data) {
    await this.writeJSON('data/base_places.json', data);
  }

  static async updatePlaceDetails(placeId, data) {
    await this.writeJSON(`data/place_details/${placeId}.json`, data);
  }

  static async updateVariableData(data) {
    await this.writeJSON('data/variable_data.json', data);
  }
}

// 개별 메서드 export
export const readJSON = FileUtils.readJSON.bind(FileUtils);
export const writeJSON = FileUtils.writeJSON.bind(FileUtils);

// 클래스 export
export default FileUtils;

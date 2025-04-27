// fileUtils.js

import { Storage } from '@google-cloud/storage';
import { isNaN } from './utils.js';

const storage = new Storage({
  projectId: 'predictourist-api',
});
const bucket = storage.bucket('run-sources-predictourist-api-us-central1');

class FileUtils {
  
  // --- readJSON, writeJSON 메서드는 이전과 동일 (null 반환 로직 유지 권장) ---
  static async readJSON(filePath) {
    console.log(`[FileUtils] Attempting to read GCS: ${bucket.name}/${filePath}`);
    try {
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (!exists) {
        console.warn(`[FileUtils] File ${filePath} does not exist in bucket ${bucket.name}`);
        return null; // 파일 없을 때 null 반환
      }
      const [content] = await file.download();
      const jsonData = JSON.parse(content.toString());
      console.log(`[FileUtils] Successfully read and parsed JSON for: ${filePath}`);
      return jsonData;
    } catch (error) {
      console.error(`[FileUtils] JSON 파일 로드 실패 (${filePath}):`, error.stack || error);
      return null; // 오류 시 null 반환
    }
  }

  static async writeJSON(filePath, data) {
    const fullPath = `${bucket.name}/${filePath}`;
    console.log(`[FileUtils] Attempting to write GCS: ${fullPath}`);
    try {
      const file = bucket.file(filePath);
      await file.save(JSON.stringify(data, null, 2), {
        contentType: 'application/json',
        resumable: false,
      });
      console.log(`[FileUtils] Successfully wrote to GCS: ${fullPath}`);
    } catch (error) {
      console.error(`[FileUtils] JSON 파일 저장 실패 (${filePath}):`, error.stack || error);
      throw error;
    }
  }

  static async getBasePlaces() {
    return this.readJSON('data/base_places.json');
  }

  static async getPlaceDetails(placeId) {
    return this.readJSON(`data/place_details/${placeId}.json`);
  }

  static async getVariableData(placeId, date) {
    let dateStr;
    console.log(`[FileUtils] getVariableData: Using date: ${date}`);
    if (date) { // date는 'YYYY-MM-DD' 형식으로 가정
        dateStr = date.substring(2, 4) + date.substring(5, 7) + date.substring(8, 10); // yyMMdd 추출
    } else { // 기본값: 오늘 날짜
        dateStr = new Date().toISOString().slice(2, 8); // yyMMdd 추출 (T 포함 안 함)
    }
    console.log(`[FileUtils] getVariableData: Using dateStr: ${dateStr} for placeId: ${placeId}`);
    return this.readJSON(`data/variable_data/${dateStr}/${placeId}.json`);
  }

  static async updateBasePlaces(data) {
    await this.writeJSON('data/base_places.json', data);
  }

  static async updatePlaceDetails(placeId, data) {
    await this.writeJSON(`data/place_details/${placeId}.json`, data);
  }

  static async updateVariableData(placeId, data) {
    const dateStr = new Date().toISOString().slice(2, 10);
    await this.writeJSON(`data/variable_data/${dateStr}/${placeId}.json`, data);
  }
  
  /**
   * 특정 장소/날짜의 KTO 혼잡도 데이터를 GCS에서 읽어옵니다.
   * @param {string} yyMMdd - 날짜 (yyMMdd 형식)
   * @param {string} placeId - 서비스 내부 장소 ID
   * @returns {Promise<object | null>} 저장된 데이터 객체({ congestionRate: 값 }) 또는 null
   */
  static async getKtoCongestionData(yyMMdd, placeId) {
    // 파일 경로: kto/yyMMdd/{placeId}.json
    const filePath = `kto/${yyMMdd}/${placeId}.json`;
    return this.readJSON(filePath);
  }

  /**
   * KTO API로부터 받은 특정 날짜의 혼잡도 데이터를 GCS에 저장합니다.
   * @param {string} yyMMdd - 날짜 (yyMMdd 형식)
   * @param {string} placeId - 서비스 내부 장소 ID
   * @param {object} rawItemData - KTO API 응답의 개별 item 객체 (cnctrRate 포함)
   */
  static async saveKtoCongestionData(yyMMdd, placeId, rawItemData) {
    // 파일 경로: kto/yyMMdd/{placeId}.json
    const filePath = `kto/${yyMMdd}/${placeId}.json`;

    // 저장할 데이터 구성: { congestionRate: 값 }
    const rate = parseFloat(rawItemData?.cnctrRate);
    const dataToSave = {
      congestionRate: isNaN(rate) ? null : rate
      // 필요하다면 여기에 lastUpdated 타임스탬프 등 추가 가능
      // lastUpdated: new Date().toISOString()
    };

    // writeJSON 호출
    await this.writeJSON(filePath, dataToSave);
  }
  // --- ★★★ 추가된 함수 끝 ★★★ ---
}

// --- 기존 export 방식 유지 ---
// 개별 메서드 export (필요한 경우 새 함수 추가)
export const readJSON = FileUtils.readJSON.bind(FileUtils);
export const writeJSON = FileUtils.writeJSON.bind(FileUtils);
export const getKtoCongestionData = FileUtils.getKtoCongestionData.bind(FileUtils); // 새 함수 추가
export const saveKtoCongestionData = FileUtils.saveKtoCongestionData.bind(FileUtils); // 새 함수 추가

// 클래스 export
export default FileUtils;
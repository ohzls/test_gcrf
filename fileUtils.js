// fileUtils.js

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: 'predictourist-api',
});
const bucket = storage.bucket('run-sources-predictourist-api-us-central1');

class FileUtils {
  static async readJSON(filePath) {
    // 로그 추가: 어떤 파일을 읽으려고 시도하는지 확인
    console.log(`[FileUtils] Attempting to read GCS: ${bucket.name}/${filePath}`);
    try {
      const file = bucket.file(filePath);

      // 로그 추가: 파일 존재 여부 확인 시도
      console.log(`[FileUtils] Checking existence for: ${filePath}`);
      const [exists] = await file.exists();
      // 로그 추가: 파일 존재 여부 결과
      console.log(`[FileUtils] File exists check result for ${filePath}: ${exists}`);

      if (!exists) {
        console.warn(`[FileUtils] File ${filePath} does not exist in bucket ${bucket.name}`);
        // 파일이 없을 때 빈 객체 반환 (기존 로직 유지)
        // 또는 여기서 new Error(`File not found: ${filePath}`) 를 throw하여 상위 catch에서 처리하게 할 수도 있음
        return {};
      }

      // 로그 추가: 파일 다운로드 시도
      console.log(`[FileUtils] Attempting to download: ${filePath}`);
      const [content] = await file.download();
      // 로그 추가: 다운로드 성공 및 내용 크기 확인
      console.log(`[FileUtils] Successfully downloaded ${filePath}. Content length: ${content?.length ?? 'N/A'}`);

      // 로그 추가: JSON 파싱 시도
      console.log(`[FileUtils] Attempting to parse JSON for: ${filePath}`);
      const jsonData = JSON.parse(content.toString());
      console.log(`[FileUtils] Successfully parsed JSON for: ${filePath}`); // 파싱 성공 로그 추가
      return jsonData;

    } catch (error) {
      // 로그 추가: 오류 발생 시 상세 정보 로깅 (파일 경로 포함)
      console.error(`[FileUtils] JSON 파일 로드 실패 (${filePath}):`, error.stack || error);
      // 오류 시 빈 객체 반환 (기존 로직 유지)
      return {};
    }
  }

  static async writeJSON(filePath, data) {
    const fullPath = `${bucket.name}/${filePath}`;
    console.log(`[FileUtils] Attempting to write GCS: ${fullPath}`); // 쓰기 시도 로그 추가
    try {
      const file = bucket.file(filePath); // 파일 객체 생성
      await file.save(JSON.stringify(data), {
        contentType: 'application/json', // 콘텐츠 타입 명시
        // 필요한 경우 다른 옵션 추가 (예: cacheControl)
      });
      console.log(`[FileUtils] Successfully wrote to GCS: ${fullPath}`); // 쓰기 성공 로그 추가
    } catch (error) {
      console.error(`[FileUtils] JSON 파일 저장 실패 (${filePath}):`, error.stack || error); // 스택 트레이스 로깅
      throw error; // 쓰기 오류는 상위로 전파
    }
  }

  static async getBasePlaces() {
    return this.readJSON('data/base_places.json');
  }

  static async getPlaceDetails(placeId) {
    return this.readJSON(`data/place_details/${placeId}.json`);
  }

  static async getVariableData(placeId, date) {
    const dateStr = date ? date.replace(/-/g, '') : new Date().toISOString().slice(2, 10);
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
}

// 개별 메서드 export
export const readJSON = FileUtils.readJSON.bind(FileUtils);
export const writeJSON = FileUtils.writeJSON.bind(FileUtils);

// 클래스 export
export default FileUtils;

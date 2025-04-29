// config.js

export const config = {
  cache: {
    syncInterval: 30000,
    maxRetries: 3
  },
  api: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15분
      max: 100 // IP당 최대 요청 수
    }
  },
  cors: {
    origins: [
      "http://localhost:5173",
      "http://192.168.0.59:5173",
      "http://192.168.219.102:5173",
      "https://seoseongwon.gitlab.io",
      "https://predictourist.com",
      "http://apis.data.go.kr/"
    ]
  }
};
# Node.js 런타임 베이스 이미지 사용
FROM node:18-alpine

# 앱 디렉토리 생성
WORKDIR /app

# 소스 코드 복사
COPY package*.json ./
COPY *.js ./

# 의존성 설치
RUN npm install

# 환경 변수 설정
ENV PORT=8080
ENV NODE_ENV=production

# 포트 노출
EXPOSE 8080

# 애플리케이션 실행
CMD ["node", "index.js"]

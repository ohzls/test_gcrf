# Node.js 런타임 베이스 이미지 사용
FROM node:18-alpine

# 앱 디렉토리 생성
WORKDIR /app

# 소스 코드 복사
COPY package*.json ./
COPY *.js ./

# 데이터 디렉토리 생성
RUN mkdir -p /app/data

# 의존성 설치
RUN npm install

# 데이터 볼륨 마운트 포인트
VOLUME /app/data

# 환경 변수 설정
ENV DATA_DIR=/app/data

# 포트 노출
EXPOSE 8080

# 애플리케이션 실행
CMD ["node", "index.js"]

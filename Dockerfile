# Node.js 런타임 베이스 이미지 사용
FROM node:22

# 앱 디렉토리 생성
WORKDIR /usr/src/app

# 패키지 파일 복사 및 종속성 설치
COPY package*.json ./
RUN npm install --production

# 소스 코드 복사
COPY . .

# 포트 노출 (Cloud Run은 PORT 환경변수 사용)
ENV PORT=8080
EXPOSE 8080

# 앱 실행
CMD [ "npm", "start" ]

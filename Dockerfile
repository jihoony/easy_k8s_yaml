# ==========================================
# 1단계: Go 애플리케이션 빌드 (Builder Stage)
# ==========================================
FROM golang:1.21-alpine AS builder

WORKDIR /app

# 의존성 정의 파일 복사 및 다운로드
COPY go.mod go.sum ./
RUN go mod download

# 소스 코드 복사 및 빌드
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# ==========================================
# 2단계: 최종 실행 환경 (Runtime Stage)
# ==========================================
FROM alpine:3.19

# 백엔드가 'docker' 명령어를 실행할 수 있도록 docker-cli 바이너리 설치
RUN apk add --no-cache docker-cli

WORKDIR /app

# 빌드 완료된 바이너리 및 정적 자산(UI) 복사
COPY --from=builder /app/main .
COPY --from=builder /app/static ./static

# 포트 개방
EXPOSE 8080

# 애플리케이션 실행
ENTRYPOINT ["./main"]

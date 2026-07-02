#!/bin/bash

# 호스트의 Docker 소켓과 임시 디렉터리(/tmp)를 볼륨 바인딩하여 
# 컨테이너 내부에서 Docker-out-of-Docker(DooD)가 가능하도록 실행합니다.
docker run --rm -it \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  easy-k8s-yaml

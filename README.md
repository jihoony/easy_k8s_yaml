# Easy K8s YAML Generator ⎈

웹 인터페이스를 통해 Kubernetes **Secret**, **ConfigMap**, **Service**, **Deployment** 리소스의 YAML 정의서를 손쉽게 생성하고 조립할 수 있는 Go 기반 웹 애플리케이션입니다.  
내부적으로 호스트의 `kubectl` CLI 설치 유무와 무관하게 **Docker 기반의 `kubectl` 컨테이너**를 실행하여 정확한 K8s Manifest 스키마의 초안을 얻고, 상세 설정(볼륨 마운트, 환경 변수 주입 등)을 Go 백엔드에서 후처리하여 완성도 높은 통합 YAML을 제공합니다.

---

## 🚀 주요 특징

1. **단일 통합 앱 이름 관리**
   - 중복 입력 번거로움 없이 하나의 **앱 이름**(`app-name`)으로 Secret, ConfigMap, Service, Deployment의 이름과 리소스 간 참조(볼륨 명칭 등)가 자동 동기화됩니다.

2. **4단계 원페이지 인터페이스 (Secret → ConfigMap → Service → Deployment)**
   - 탭 구분 없이 한 화면에 세로로 스크롤하며 순차적으로 정의할 수 있는 모던한 글래스모피즘(Glassmorphism) UI를 제공합니다.
   - 좌측 폼 영역과 우측 YAML 생성 뷰어 영역이 **독립적으로 스크롤**되어 사용자 편의성이 극대화되었습니다.

3. **실시간 리소스 연동**
   - **Secret(1단계)** 및 **ConfigMap(2단계)** 에 입력된 환경 변수 키와 업로드된 파일명이 **Deployment(4단계)** 의 설정 카드에 실시간 반영됩니다.

4. **상세 연동 기능**
   - **환경 변수 주입**: ConfigMap/Secret의 키 목록을 체크박스로 선택하여 컨테이너 환경 변수(`valueFrom.configMapKeyRef`/`valueFrom.secretKeyRef`)로 자동 인젝션합니다.
   - **개별 파일 볼륨 마운트**: 업로드한 비밀 파일이나 설정 파일마다 개별 컨테이너 내부 마운트 경로를 지정하여 `subPath`를 사용한 파일 단위 마운트를 자동 생성합니다.
   - **임의 환경 변수**: UI에서 수동으로 추가한 환경 변수도 컨테이너 `env` 영역에 리터럴 값(`value: "..."`)으로 함께 주입됩니다.

5. **비설치형 Kubectl 환경 (Docker Sidecar)**
   - 호스트 환경에 `kubectl`이 없어도 백엔드가 `docker run --rm bitnami/kubectl:latest`를 수행하여 안정적인 드라이런(`--dry-run=client -o yaml`) 초안을 뽑아냅니다.
   - Non-root 컨테이너(Bitnami `uid 1001`) 권한 오류를 원천 방지하기 위해 파일 업로드 시 임시 디렉터리(`0755`) 및 업로드 파일(`0644`)의 권한 보정이 기본 내장되어 있습니다.

---

## 🛠 기술 스택

- **Backend**: Go (Standard Library `net/http`, `gopkg.in/yaml.v3`)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design Tokens, Flex/Grid Layout), JS (ES6 Core Logic)
- **Code Styling**: Highlight.js (Atom One Dark theme)
- **CLI Sandbox**: Docker (`bitnami/kubectl:latest`)

---

## 📂 프로젝트 구조

```text
easy_k8s_yaml/
├── go.mod                  # Go 모듈 의존성 정의 (yaml.v3 사용)
├── main.go                 # 웹 서버 기동 및 API 엔드포인트 라우팅
├── handlers/               # 리소스별 YAML 가공 및 비즈니스 로직
│   ├── helpers.go          # 공통 응답 처리 및 유틸리티
│   ├── secret.go           # Secret 생성 API 핸들러
│   ├── configmap.go        # ConfigMap 생성 API 핸들러
│   ├── service.go          # Service 생성 API 핸들러 (NodePort/ClusterIP 후처리)
│   └── deployment.go       # Deployment 생성 API 핸들러 (볼륨 마운트/환경변수 주입 후처리)
├── kubectl/
│   └── runner.go           # Docker kubectl 구동 코어 모듈
└── static/                 # 프론트엔드 정적 파일
    ├── index.html          # 메인 원페이지 마크업
    ├── style.css           # 모던 다크테마 글래스모피즘 CSS 스타일링
    └── app.js              # 실시간 UI 동기화 및 API 호출 제어 JS
```

---

## 📝 실행 방법

### 방법 A. 로컬 Go 환경에서 직접 실행

#### 1. 사전 요구사항
- 호스트 머신에 **Docker**가 실행 중이어야 합니다.
- **Go** (1.20 버전 이상 권장)가 설치되어 있어야 합니다.

#### 2. 의존성 다운로드
```bash
go mod tidy
```

#### 3. 애플리케이션 실행
```bash
go run main.go
```
서버가 시작되면 브라우저에서 `http://localhost:8080`에 접속합니다.

---

### 방법 B. Docker 컨테이너 환경에서 실행 (DooD - Docker out of Docker)

백엔드 프로그램이 `kubectl` 리소스를 가공할 때 호스트의 Docker 데몬을 통해 `bitnami/kubectl` 컨테이너를 구동하므로, 컨테이너화하여 실행할 때는 **Docker 소켓 마운트**와 **임시 업로드용 볼륨 마운트**가 함께 요구됩니다.

#### 1. Docker 이미지 빌드
```bash
docker build -t easy-k8s-yaml:latest .
```

#### 2. Docker 컨테이너 실행
```bash
docker run -d \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  --name easy-k8s-yaml \
  easy-k8s-yaml:latest
```

> [!IMPORTANT]
> **마운트 플래그 설명**
> - `-v /var/run/docker.sock:/var/run/docker.sock`: 컨테이너 내부의 `docker-cli`가 호스트의 Docker Daemon에 접근해 컨테이너를 생성(DooD)할 수 있게 해줍니다.
> - `-v /tmp:/tmp`: 사용자가 웹 화면에서 업로드한 파일들이 Go 서버 컨테이너의 `/tmp/k8s-configmap-*` 혹은 `/tmp/k8s-secret-*` 경로에 쓰여집니다. 이 경로가 호스트의 `/tmp`에 그대로 대응되어야 외부 `bitnami/kubectl` 컨테이너가 마운트된 파일들을 무리 없이 읽을 수 있습니다.

---

## ⚙️ 작동 아키텍처 (Behind the Scenes)

```
[ 브라우저 (HTML/JS) ] ──(FormData / JSON)──> [ Go 백엔드 서버 ]
                                                    │
 (YAML 병합 및 후처리) <──(드라이런 YAML 출력)── [ Docker (kubectl 컨테이너) ]
```

1. **Kubectl Dry-run**: 백엔드가 호출되면 사용자가 업로드한 파일들을 호스트 임시 경로에 복사한 뒤, Docker 볼륨 바인딩 옵션으로 컨테이너 내부에 임시 노출시킵니다. 컨테이너 내에서 `kubectl create -o yaml --dry-run=client`를 구동하여 K8s 표준 포맷의 순수 리소스를 반환받습니다.
2. **YAML Post-Processor**: `kubectl` 명령어 옵션만으로는 제어하기 힘든 복잡한 파드 상세 스펙(`volumeMounts[].subPath`, `valueFrom.secretKeyRef`, Service의 `nodePort` 매핑 등)을 Go의 `yaml.v3` 파서를 이용하여 AST 기반으로 안전하게 조작(Injection)하여 완전한 리소스 YAML을 완성합니다.
3. **통합 다운로드**: 최종 생성된 각 리소스의 YAML 카드는 개별 복사가 가능할 뿐만 아니라, 우측 상단의 **전체 복사** / **다운로드** 버튼을 통해 `---` 구분자로 합쳐진 하나의 `k8s-manifests.yaml` 파일로 원클릭 획득할 수 있습니다.

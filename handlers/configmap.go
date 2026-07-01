package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"easy-k8s-yaml/kubectl"
)

// HandleConfigMap handles POST /api/configmap
// Accepts multipart/form-data with:
//   - name: ConfigMap name
//   - envVars: JSON array of {key, value} objects
//   - files: one or more uploaded files
func HandleConfigMap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (max 32 MB)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, "폼 파싱 실패: "+err.Error(), http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	if name == "" {
		name = "my-configmap"
	}

	// Create a temp directory for uploaded files.
	// Must be world-readable (0755) so the bitnami/kubectl container
	// (which runs as non-root uid 1001) can access the mounted files.
	tmpDir, err := os.MkdirTemp("", "k8s-configmap-*")
	if err != nil {
		writeError(w, "임시 디렉터리 생성 실패", http.StatusInternalServerError)
		return
	}
	if err := os.Chmod(tmpDir, 0755); err != nil {
		writeError(w, "임시 디렉터리 권한 설정 실패", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tmpDir)

	// Build kubectl args
	args := []string{"create", "configmap", name}

	// Handle environment variables
	envVarsJSON := r.FormValue("envVars")
	if envVarsJSON != "" {
		var envVars []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := json.Unmarshal([]byte(envVarsJSON), &envVars); err == nil {
			for _, ev := range envVars {
				if ev.Key != "" {
					args = append(args, fmt.Sprintf("--from-literal=%s=%s", ev.Key, ev.Value))
				}
			}
		}
	}

	// Handle file uploads
	hasMountDir := false
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		for _, fileHeaders := range r.MultipartForm.File {
			for _, fh := range fileHeaders {
				f, err := fh.Open()
				if err != nil {
					continue
				}

				dstPath := filepath.Join(tmpDir, fh.Filename)
				// Use 0644 so the non-root kubectl container user can read the file.
				dst, err := os.OpenFile(dstPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
				if err != nil {
					f.Close()
					continue
				}

				_, _ = io.Copy(dst, f)
				f.Close()
				dst.Close()

				// Reference the file inside the container's /uploads directory
				args = append(args, fmt.Sprintf("--from-file=/uploads/%s", fh.Filename))
				hasMountDir = true
			}
		}
	}

	args = append(args, "--dry-run=client", "-o", "yaml")

	mountDir := ""
	if hasMountDir {
		mountDir = tmpDir
	}

	yamlOutput, err := kubectl.Run(args, mountDir)
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{"yaml": yamlOutput})
}

package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"

	"easy-k8s-yaml/kubectl"
	"gopkg.in/yaml.v3"
)

// MountItem represents a single file to be mounted from a ConfigMap or Secret,
// with its individual mount path inside the container.
type MountItem struct {
	Key       string `json:"key"`       // ConfigMap or Secret key (= uploaded filename)
	MountPath string `json:"mountPath"` // absolute path inside the container
}

type CustomEnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type ManualMount struct {
	Name      string `json:"name"`
	Type      string `json:"type"`      // "hostPath", "emptyDir", "pvc"
	Source    string `json:"source"`    // Host path or PVC claimName
	MountPath string `json:"mountPath"` // container mount path
}

type DeploymentRequest struct {
	Name             string         `json:"name"`
	Namespace        string         `json:"namespace"`
	Image            string         `json:"image"`
	Replicas         string         `json:"replicas"`
	Port             string         `json:"port"`
	ConfigMapName    string         `json:"configMapName"`
	SecretName       string         `json:"secretName"`
	MountItems       []MountItem    `json:"mountItems"`       // per-file volume mounts (subPath) for ConfigMap
	SecretMountItems []MountItem    `json:"secretMountItems"` // per-file volume mounts (subPath) for Secret
	EnvKeys          []string       `json:"envKeys"`          // ConfigMap keys to inject as env vars
	SecretEnvKeys    []string       `json:"secretEnvKeys"`    // Secret keys to inject as env vars
	CustomEnvVars    []CustomEnvVar `json:"customEnvVars"`    // arbitrary manual env vars
	ManualMounts     []ManualMount  `json:"manualMounts"`     // manually configured volume mounts
}

// HandleDeployment handles POST /api/deployment
// Generates a base Deployment via kubectl and then post-processes the YAML
// to inject ConfigMap / Secret environment variables and file mounts.
func HandleDeployment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DeploymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "요청 파싱 실패: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		req.Name = "my-deployment"
	}
	if req.Image == "" {
		req.Image = "nginx:latest"
	}
	if req.Replicas == "" {
		req.Replicas = "1"
	}
	if req.Port == "" {
		req.Port = "8080"
	}

	// Build CLI arguments for kubectl create deployment
	args := []string{
		"create", "deployment", req.Name,
		"--image=" + req.Image,
		"--replicas=" + req.Replicas,
		"--port=" + req.Port,
	}
	if req.Namespace != "" {
		args = append(args, "--namespace="+req.Namespace)
	}
	args = append(args, "--dry-run=client", "-o", "yaml")

	yamlOutput, err := kubectl.Run(args, "")
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Parse YAML once into object map
	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlOutput), &obj); err != nil {
		writeError(w, "YAML 파싱 실패: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Post-process 1: inject env vars from ConfigMap (valueFrom.configMapKeyRef)
	if req.ConfigMapName != "" && len(req.EnvKeys) > 0 {
		addEnvFromConfigMap(obj, req.ConfigMapName, req.EnvKeys)
	}

	// Post-process 1.2: inject env vars from Secret (valueFrom.secretKeyRef)
	if req.SecretName != "" && len(req.SecretEnvKeys) > 0 {
		addEnvFromSecret(obj, req.SecretName, req.SecretEnvKeys)
	}

	// Post-process 1.5: inject arbitrary custom environment variables (value)
	if len(req.CustomEnvVars) > 0 {
		addCustomEnvVars(obj, req.CustomEnvVars)
	}

	// Post-process 2: add per-file ConfigMap volume mounts (subPath)
	if req.ConfigMapName != "" && len(req.MountItems) > 0 {
		addConfigMapMount(obj, req.ConfigMapName, req.MountItems)
	}

	// Post-process 2.2: add per-file Secret volume mounts (subPath)
	if req.SecretName != "" && len(req.SecretMountItems) > 0 {
		addSecretMount(obj, req.SecretName, req.SecretMountItems)
	}

	// Post-process 3: inject manual volume mounts (hostPath, emptyDir, PVC)
	if len(req.ManualMounts) > 0 {
		addManualVolumeMounts(obj, req.ManualMounts)
	}

	// Serialize with explicit 2-spaces indentation to fix formatting issue
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(obj); err != nil {
		writeError(w, "YAML 직렬화 실패: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{"yaml": buf.String()})
}

// addConfigMapMount injects ConfigMap volume + per-file volumeMounts (with subPath)
// into the first container of the Deployment's pod spec.
func addConfigMapMount(obj map[string]interface{}, configMapName string, mountItems []MountItem) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}

	volumeName := configMapName + "-vol"

	cmItems := make([]interface{}, 0, len(mountItems))
	for _, item := range mountItems {
		cmItems = append(cmItems, map[string]interface{}{
			"key":  item.Key,
			"path": item.Key,
		})
	}

	var volumesList []interface{}
	if vols, ok := podSpec["volumes"].([]interface{}); ok {
		volumesList = vols
	}
	volumesList = append(volumesList, map[string]interface{}{
		"name": volumeName,
		"configMap": map[string]interface{}{
			"name":  configMapName,
			"items": cmItems,
		},
	})
	podSpec["volumes"] = volumesList

	containers, ok := podSpec["containers"].([]interface{})
	if ok && len(containers) > 0 {
		container, ok := containers[0].(map[string]interface{})
		if ok {
			var mountsList []interface{}
			if mounts, ok := container["volumeMounts"].([]interface{}); ok {
				mountsList = mounts
			}
			for _, item := range mountItems {
				mountsList = append(mountsList, map[string]interface{}{
					"name":      volumeName,
					"mountPath": item.MountPath,
					"subPath":   item.Key,
				})
			}
			container["volumeMounts"] = mountsList
		}
	}
}

// addSecretMount injects Secret volume + per-file volumeMounts (with subPath)
// into the first container of the Deployment's pod spec.
func addSecretMount(obj map[string]interface{}, secretName string, mountItems []MountItem) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}

	volumeName := secretName + "-sec-vol"

	secretItems := make([]interface{}, 0, len(mountItems))
	for _, item := range mountItems {
		secretItems = append(secretItems, map[string]interface{}{
			"key":  item.Key,
			"path": item.Key,
		})
	}

	var volumesList []interface{}
	if vols, ok := podSpec["volumes"].([]interface{}); ok {
		volumesList = vols
	}
	volumesList = append(volumesList, map[string]interface{}{
		"name": volumeName,
		"secret": map[string]interface{}{
			"secretName": secretName,
			"items":      secretItems,
		},
	})
	podSpec["volumes"] = volumesList

	containers, ok := podSpec["containers"].([]interface{})
	if ok && len(containers) > 0 {
		container, ok := containers[0].(map[string]interface{})
		if ok {
			var mountsList []interface{}
			if mounts, ok := container["volumeMounts"].([]interface{}); ok {
				mountsList = mounts
			}
			for _, item := range mountItems {
				mountsList = append(mountsList, map[string]interface{}{
					"name":      volumeName,
					"mountPath": item.MountPath,
					"subPath":   item.Key,
				})
			}
			container["volumeMounts"] = mountsList
		}
	}
}

// addEnvFromConfigMap injects ConfigMap key references as individual environment variables
// inside the first container's 'env' list.
func addEnvFromConfigMap(obj map[string]interface{}, configMapName string, envKeys []string) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return
	}

	var envList []interface{}
	if existing, ok := container["env"].([]interface{}); ok {
		envList = existing
	}

	for _, key := range envKeys {
		envList = append(envList, map[string]interface{}{
			"name": key,
			"valueFrom": map[string]interface{}{
				"configMapKeyRef": map[string]interface{}{
					"name": configMapName,
					"key":  key,
				},
			},
		})
	}
	container["env"] = envList
}

// addEnvFromSecret injects Secret key references as individual environment variables
// inside the first container's 'env' list.
func addEnvFromSecret(obj map[string]interface{}, secretName string, envKeys []string) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return
	}

	var envList []interface{}
	if existing, ok := container["env"].([]interface{}); ok {
		envList = existing
	}

	for _, key := range envKeys {
		envList = append(envList, map[string]interface{}{
			"name": key,
			"valueFrom": map[string]interface{}{
				"secretKeyRef": map[string]interface{}{
					"name": secretName,
					"key":  key,
				},
			},
		})
	}
	container["env"] = envList
}

// addCustomEnvVars appends manually typed key-value pairs to the first container's env.
func addCustomEnvVars(obj map[string]interface{}, customEnvVars []CustomEnvVar) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return
	}

	var envList []interface{}
	if existing, ok := container["env"].([]interface{}); ok {
		envList = existing
	}

	for _, ev := range customEnvVars {
		envList = append(envList, map[string]interface{}{
			"name":  ev.Key,
			"value": ev.Value,
		})
	}
	container["env"] = envList
}

// addManualVolumeMounts injects user-defined volumes and volumeMounts into the first container.
func addManualVolumeMounts(obj map[string]interface{}, manualMounts []ManualMount) {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return
	}

	// --- Add manual volumes ---
	var volumesList []interface{}
	if vols, ok := podSpec["volumes"].([]interface{}); ok {
		volumesList = vols
	}

	for _, mm := range manualMounts {
		vol := map[string]interface{}{
			"name": mm.Name,
		}
		switch mm.Type {
		case "hostPath":
			vol["hostPath"] = map[string]interface{}{
				"path": mm.Source,
			}
		case "emptyDir":
			vol["emptyDir"] = map[string]interface{}{}
		case "pvc":
			vol["persistentVolumeClaim"] = map[string]interface{}{
				"claimName": mm.Source,
			}
		}
		volumesList = append(volumesList, vol)
	}
	podSpec["volumes"] = volumesList

	// --- Add manual volumeMounts ---
	containers, ok := podSpec["containers"].([]interface{})
	if ok && len(containers) > 0 {
		container, ok := containers[0].(map[string]interface{})
		if ok {
			var mountsList []interface{}
			if mounts, ok := container["volumeMounts"].([]interface{}); ok {
				mountsList = mounts
			}
			for _, mm := range manualMounts {
				mountsList = append(mountsList, map[string]interface{}{
					"name":      mm.Name,
					"mountPath": mm.MountPath,
				})
			}
			container["volumeMounts"] = mountsList
		}
	}
}

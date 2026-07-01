package handlers

import (
	"encoding/json"
	"fmt"
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

type DeploymentRequest struct {
	Name             string         `json:"name"`
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

	args := []string{
		"create", "deployment", req.Name,
		"--image=" + req.Image,
		"--replicas=" + req.Replicas,
		"--port=" + req.Port,
		"--dry-run=client", "-o", "yaml",
	}

	yamlOutput, err := kubectl.Run(args, "")
	if err != nil {
		writeError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Post-process 1: inject env vars from ConfigMap (valueFrom.configMapKeyRef)
	if req.ConfigMapName != "" && len(req.EnvKeys) > 0 {
		processed, err := addEnvFromConfigMap(yamlOutput, req.ConfigMapName, req.EnvKeys)
		if err == nil {
			yamlOutput = processed
		}
	}

	// Post-process 1.2: inject env vars from Secret (valueFrom.secretKeyRef)
	if req.SecretName != "" && len(req.SecretEnvKeys) > 0 {
		processed, err := addEnvFromSecret(yamlOutput, req.SecretName, req.SecretEnvKeys)
		if err == nil {
			yamlOutput = processed
		}
	}

	// Post-process 1.5: inject arbitrary custom environment variables (value)
	if len(req.CustomEnvVars) > 0 {
		processed, err := addCustomEnvVars(yamlOutput, req.CustomEnvVars)
		if err == nil {
			yamlOutput = processed
		}
	}

	// Post-process 2: add per-file ConfigMap volume mounts (subPath)
	if req.ConfigMapName != "" && len(req.MountItems) > 0 {
		processed, err := addConfigMapMount(yamlOutput, req.ConfigMapName, req.MountItems)
		if err == nil {
			yamlOutput = processed
		}
	}

	// Post-process 2.2: add per-file Secret volume mounts (subPath)
	if req.SecretName != "" && len(req.SecretMountItems) > 0 {
		processed, err := addSecretMount(yamlOutput, req.SecretName, req.SecretMountItems)
		if err == nil {
			yamlOutput = processed
		}
	}

	writeJSON(w, map[string]string{"yaml": yamlOutput})
}

// addConfigMapMount injects ConfigMap volume + per-file volumeMounts (with subPath)
// into the first container of the Deployment's pod spec.
func addConfigMapMount(yamlStr, configMapName string, mountItems []MountItem) (string, error) {
	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("spec not found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("template not found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("pod spec not found")
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

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

// addSecretMount injects Secret volume + per-file volumeMounts (with subPath)
// into the first container of the Deployment's pod spec.
func addSecretMount(yamlStr, secretName string, mountItems []MountItem) (string, error) {
	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("spec not found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("template not found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("pod spec not found")
	}

	volumeName := secretName + "-sec-vol"

	secItems := make([]interface{}, 0, len(mountItems))
	for _, item := range mountItems {
		secItems = append(secItems, map[string]interface{}{
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
			"items":      secItems,
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

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

// addEnvFromConfigMap injects env vars into the first container using valueFrom.configMapKeyRef.
func addEnvFromConfigMap(yamlStr, configMapName string, envKeys []string) (string, error) {
	if len(envKeys) == 0 {
		return yamlStr, nil
	}

	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("spec not found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("template not found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("pod spec not found")
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return yamlStr, nil
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return yamlStr, nil
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

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

// addEnvFromSecret injects env vars into the first container using valueFrom.secretKeyRef.
func addEnvFromSecret(yamlStr, secretName string, secretEnvKeys []string) (string, error) {
	if len(secretEnvKeys) == 0 {
		return yamlStr, nil
	}

	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("spec not found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("template not found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("pod spec not found")
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return yamlStr, nil
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return yamlStr, nil
	}

	var envList []interface{}
	if existing, ok := container["env"].([]interface{}); ok {
		envList = existing
	}

	for _, key := range secretEnvKeys {
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

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

// addCustomEnvVars injects manual env vars (name and direct value) into the first container.
func addCustomEnvVars(yamlStr string, customEnvVars []CustomEnvVar) (string, error) {
	if len(customEnvVars) == 0 {
		return yamlStr, nil
	}

	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("spec not found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("template not found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, fmt.Errorf("pod spec not found")
	}
	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return yamlStr, nil
	}
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return yamlStr, nil
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

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

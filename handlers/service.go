package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"easy-k8s-yaml/kubectl"
	"gopkg.in/yaml.v3"
)

type ServiceRequest struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	ServiceType string `json:"serviceType"` // "clusterip" or "nodeport"
	PortName    string `json:"portName"`
	ServicePort string `json:"servicePort"`
	TargetPort  string `json:"targetPort"`
	NodePort    string `json:"nodePort"` // only used when serviceType == "nodeport"
}

// HandleService handles POST /api/service
// Accepts JSON body with service configuration.
// Post-processes the kubectl output to add portName and nodePort fields
// since kubectl CLI does not support them directly.
func HandleService(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ServiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "요청 파싱 실패: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		req.Name = "my-service"
	}
	if req.ServicePort == "" {
		req.ServicePort = "80"
	}
	if req.TargetPort == "" {
		req.TargetPort = "8080"
	}

	serviceType := strings.ToLower(req.ServiceType)
	if serviceType != "nodeport" {
		serviceType = "clusterip"
	}

	args := []string{
		"create", "service", serviceType, req.Name,
		fmt.Sprintf("--tcp=%s:%s", req.ServicePort, req.TargetPort),
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

	// Post-process: inject portName and/or nodePort into the YAML
	// (kubectl CLI does not support these options directly)
	if req.PortName != "" || (serviceType == "nodeport" && req.NodePort != "") {
		processed, err := postProcessService(yamlOutput, req.PortName, req.NodePort)
		if err == nil {
			yamlOutput = processed
		}
	}

	writeJSON(w, map[string]string{"yaml": yamlOutput})
}

// postProcessService parses the kubectl-generated Service YAML and injects
// the portName and nodePort fields that kubectl does not expose via CLI flags.
func postProcessService(yamlStr, portName, nodePort string) (string, error) {
	var obj map[string]interface{}
	if err := yaml.Unmarshal([]byte(yamlStr), &obj); err != nil {
		return yamlStr, err
	}

	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return yamlStr, nil
	}

	ports, ok := spec["ports"].([]interface{})
	if !ok || len(ports) == 0 {
		return yamlStr, nil
	}

	for _, p := range ports {
		port, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		if portName != "" {
			port["name"] = portName
		}
		if nodePort != "" {
			var np int
			fmt.Sscanf(nodePort, "%d", &np)
			if np > 0 {
				port["nodePort"] = np
			}
		}
	}

	out, err := yaml.Marshal(obj)
	if err != nil {
		return yamlStr, err
	}
	return string(out), nil
}

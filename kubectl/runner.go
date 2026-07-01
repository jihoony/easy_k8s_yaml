package kubectl

import (
	"fmt"
	"os/exec"
)

const KubectlImage = "bitnami/kubectl:latest"

// Run executes a kubectl command inside a Docker container.
// If mountDir is provided (non-empty), the host directory is mounted as /uploads inside the container.
func Run(args []string, mountDir string) (string, error) {
	dockerArgs := []string{"run", "--rm"}

	if mountDir != "" {
		dockerArgs = append(dockerArgs, "-v", fmt.Sprintf("%s:/uploads", mountDir))
	}

	dockerArgs = append(dockerArgs, KubectlImage)
	dockerArgs = append(dockerArgs, args...)

	cmd := exec.Command("docker", dockerArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("kubectl command failed: %v\nOutput: %s", err, string(output))
	}

	return string(output), nil
}

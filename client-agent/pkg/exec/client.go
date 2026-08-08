package exec

import (
	"os/exec"
	"runtime"
	"strings"
)

// RunCommand executes a command on the endpoint and returns combined output.
func RunCommand(name string, args ...string) (string, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		fullCmd := name + " " + strings.Join(args, " ")
		cmd = exec.Command("powershell", "-NoProfile", "-Command", fullCmd)
	} else {
		if len(args) == 0 && strings.Contains(name, " ") {
			cmd = exec.Command("/bin/sh", "-c", name)
		} else {
			cmd = exec.Command(name, args...)
		}
	}

	out, err := cmd.CombinedOutput()
	return string(out), err
}


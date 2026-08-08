package tools

import (
    "context"
    "fmt"
    "os"
    "time"

    "github.com/helpdesk-ai/client-agent/pkg/exec"
)

type Tool interface {
    Name() string
    Execute(ctx context.Context, input map[string]interface{}) (interface{}, error)
}

var registry = map[string]Tool{}

func Register(t Tool) {
    registry[t.Name()] = t
}

func Get(name string) (Tool, bool) {
    t, ok := registry[name]
    return t, ok
}

func List() []string {
    keys := []string{}
    for k := range registry {
        keys = append(keys, k)
    }
    return keys
}

// Simple helper to run with timeout
func RunWithTimeout(ctx context.Context, t Tool, input map[string]interface{}, timeout time.Duration) (interface{}, error) {
    ctx2, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()
    return t.Execute(ctx2, input)
}

// --- Basic Tools ---
type PingTool struct{}

func (PingTool) Name() string { return "ping" }

func (PingTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    host, _ := input["host"].(string)
    if host == "" {
        return nil, fmt.Errorf("missing host")
    }
    // best-effort: use system ping
    out, err := exec.RunCommand("ping", "-c", "3", host)
    if err != nil {
        // try Windows flag
        out, err = exec.RunCommand("ping", "-n", "3", host)
    }
    return out, err
}

type ServiceStatusTool struct{}

func (ServiceStatusTool) Name() string { return "service_status" }

func (ServiceStatusTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    name, _ := input["service_name"].(string)
    if name == "" {
        return nil, fmt.Errorf("missing service_name")
    }
    if os.PathSeparator == '\\' {
        return exec.RunCommand("sc", "query", name)
    }
    out, err := exec.RunCommand("systemctl", "status", name)
    if err != nil {
        out, err = exec.RunCommand("service", name, "status")
    }
    return out, err
}

type TraceRouteTool struct{}

func (TraceRouteTool) Name() string { return "traceroute" }

func (TraceRouteTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    host, _ := input["host"].(string)
    if host == "" {
        return nil, fmt.Errorf("missing host")
    }
    if os.PathSeparator == '\\' {
        return exec.RunCommand("tracert", host)
    }
    return exec.RunCommand("traceroute", host)
}

type DiskTool struct{}

func (DiskTool) Name() string { return "disk" }

func (DiskTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    device, _ := input["device"].(string)
    if os.PathSeparator == '\\' {
        if device != "" {
            return exec.RunCommand("wmic", "logicaldisk", "where", fmt.Sprintf("Caption='%s'", device), "get", "caption,freespace,size")
        }
        return exec.RunCommand("wmic", "logicaldisk", "get", "caption,freespace,size")
    }
    if device != "" {
        return exec.RunCommand("df", "-h", device)
    }
    return exec.RunCommand("df", "-h")
}

type SmartctlTool struct{}

func (SmartctlTool) Name() string { return "smartctl" }

func (SmartctlTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    device, _ := input["device"].(string)
    if device == "" {
        if os.PathSeparator == '\\' {
            return nil, fmt.Errorf("missing device for smartctl")
        }
        device = "/dev/sda"
    }
    return exec.RunCommand("smartctl", "-a", device)
}

type EchoTool struct{}

func (EchoTool) Name() string { return "echo" }

func (EchoTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
    msg, _ := input["msg"].(string)
    return msg, nil
}

func init() {
    Register(PingTool{})
    Register(ServiceStatusTool{})
    Register(TraceRouteTool{})
    Register(DiskTool{})
    Register(SmartctlTool{})
    Register(EchoTool{})
}

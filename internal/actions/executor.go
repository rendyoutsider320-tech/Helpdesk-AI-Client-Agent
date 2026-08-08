package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

type ActionType string

const (
	ActionTypeReboot         ActionType = "reboot"
	ActionTypeClearLogs      ActionType = "clear_logs"
	ActionTypeRestartService ActionType = "restart_service"
	ActionTypeRunScript      ActionType = "run_script"
	ActionTypeKillProcess    ActionType = "kill_process"
)

type ActionStatus string

const (
	ActionStatusPending   ActionStatus = "pending"
	ActionStatusRunning   ActionStatus = "running"
	ActionStatusCompleted ActionStatus = "completed"
	ActionStatusFailed    ActionStatus = "failed"
)

type ExecutionRequest struct {
	ID         string                 `json:"id"`
	Type       ActionType             `json:"type"`
	Target     string                 `json:"target"`
	Parameters map[string]interface{} `json:"parameters"`
	ApprovedBy string                 `json:"approved_by"`
	ApprovedAt time.Time              `json:"approved_at"`
	TicketID   string                 `json:"ticket_id"`
}

type ExecutionResult struct {
	ID        string       `json:"id"`
	RequestID string       `json:"request_id"`
	Status    ActionStatus `json:"status"`
	Output    string       `json:"output"`
	Error     string       `json:"error,omitempty"`
	StartTime time.Time    `json:"start_time"`
	EndTime   time.Time    `json:"end_time"`
	Duration  int64        `json:"duration"` // milliseconds
}

type Executor struct {
	mu             sync.Mutex
	results        map[string]ExecutionResult
	allowedActions map[ActionType]bool
	requestQueue   chan ExecutionRequest
	maxQueueSize   int
	workers        int
	workerWg       sync.WaitGroup
	stopChan       chan struct{}
}

func NewExecutor(maxQueueSize, workers int) *Executor {
	allowedActions := map[ActionType]bool{
		ActionTypeReboot:         false, // disabled by default for safety
		ActionTypeClearLogs:      true,
		ActionTypeRestartService: true,
		ActionTypeRunScript:      false,
		ActionTypeKillProcess:    false,
	}

	return &Executor{
		results:        make(map[string]ExecutionResult),
		allowedActions: allowedActions,
		requestQueue:   make(chan ExecutionRequest, maxQueueSize),
		maxQueueSize:   maxQueueSize,
		workers:        workers,
		stopChan:       make(chan struct{}),
	}
}

func (ex *Executor) Start(ctx context.Context) {
	for i := 0; i < ex.workers; i++ {
		ex.workerWg.Add(1)
		go ex.processRequests(ctx, i)
	}
	log.Printf("Action executor started with %d workers", ex.workers)
}

func (ex *Executor) Stop() {
	close(ex.stopChan)
	ex.workerWg.Wait()
	close(ex.requestQueue)
	log.Println("Action executor stopped")
}

func (ex *Executor) SubmitRequest(req ExecutionRequest) (string, error) {
	if !ex.allowedActions[req.Type] {
		return "", fmt.Errorf("action type %s is not allowed", req.Type)
	}

	if req.ID == "" {
		req.ID = uuid.New().String()
	}

	select {
	case ex.requestQueue <- req:
		return req.ID, nil
	case <-ex.stopChan:
		return "", fmt.Errorf("executor is stopped")
	default:
		return "", fmt.Errorf("request queue is full")
	}
}

func (ex *Executor) GetResult(resultID string) (ExecutionResult, bool) {
	ex.mu.Lock()
	defer ex.mu.Unlock()
	result, exists := ex.results[resultID]
	return result, exists
}

func (ex *Executor) processRequests(ctx context.Context, workerID int) {
	defer ex.workerWg.Done()

	for {
		select {
		case <-ex.stopChan:
			log.Printf("Worker %d shutting down", workerID)
			return
		case req, ok := <-ex.requestQueue:
			if !ok {
				return
			}
			result := ex.execute(ctx, req)
			ex.mu.Lock()
			ex.results[result.ID] = result
			ex.mu.Unlock()
			ex.logExecution(req, result)
		}
	}
}

func (ex *Executor) execute(ctx context.Context, req ExecutionRequest) ExecutionResult {
	result := ExecutionResult{
		ID:        uuid.New().String(),
		RequestID: req.ID,
		Status:    ActionStatusRunning,
		StartTime: time.Now(),
	}

	switch req.Type {
	case ActionTypeClearLogs:
		result.Output, result.Error = ex.clearLogs(ctx, req.Target)
	case ActionTypeRestartService:
		result.Output, result.Error = ex.restartService(ctx, req.Target)
	case ActionTypeKillProcess:
		result.Output, result.Error = ex.killProcess(ctx, req.Target)
	case ActionTypeRunScript:
		if script, ok := req.Parameters["script"].(string); ok {
			result.Output, result.Error = ex.runScript(ctx, script)
		} else {
			result.Error = "script parameter missing"
		}
	default:
		result.Error = fmt.Sprintf("unknown action type: %s", req.Type)
	}

	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime).Milliseconds()

	if result.Error != "" {
		result.Status = ActionStatusFailed
	} else {
		result.Status = ActionStatusCompleted
	}

	return result
}

func (ex *Executor) clearLogs(ctx context.Context, target string) (string, string) {
	if runtime.GOOS == "windows" {
		return ex.clearLogsWindows(ctx, target)
	}
	return ex.clearLogsLinux(ctx, target)
}

func (ex *Executor) clearLogsWindows(ctx context.Context, target string) (string, string) {
	cmd := exec.CommandContext(ctx, "powershell", "-Command", fmt.Sprintf("Clear-EventLog -LogName %s", target))
	_, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Sprintf("failed to clear logs: %v", err)
	}
	return fmt.Sprintf("Cleared log: %s", target), ""
}

func (ex *Executor) clearLogsLinux(ctx context.Context, target string) (string, string) {
	logPath := fmt.Sprintf("/var/log/%s", target)
	cmd := exec.CommandContext(ctx, "sh", "-c", fmt.Sprintf("> %s", logPath))
	if err := cmd.Run(); err != nil {
		return "", fmt.Sprintf("failed to clear logs at %s: %v", logPath, err)
	}
	return fmt.Sprintf("Cleared log: %s", logPath), ""
}

func (ex *Executor) restartService(ctx context.Context, serviceName string) (string, string) {
	if runtime.GOOS == "windows" {
		return ex.restartServiceWindows(ctx, serviceName)
	}
	return ex.restartServiceLinux(ctx, serviceName)
}

func (ex *Executor) restartServiceWindows(ctx context.Context, serviceName string) (string, string) {
	stopCmd := exec.CommandContext(ctx, "powershell", "-Command", fmt.Sprintf("Stop-Service -Name %s", serviceName))
	if err := stopCmd.Run(); err != nil {
		return "", fmt.Sprintf("failed to stop service: %v", err)
	}

	time.Sleep(2 * time.Second)

	startCmd := exec.CommandContext(ctx, "powershell", "-Command", fmt.Sprintf("Start-Service -Name %s", serviceName))
	if err := startCmd.Run(); err != nil {
		return "", fmt.Sprintf("failed to start service: %v", err)
	}

	return fmt.Sprintf("Service %s restarted successfully", serviceName), ""
}

func (ex *Executor) restartServiceLinux(ctx context.Context, serviceName string) (string, string) {
	cmd := exec.CommandContext(ctx, "systemctl", "restart", serviceName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Sprintf("failed to restart service: %v", err)
	}
	return fmt.Sprintf("Service %s restarted: %s", serviceName, string(output)), ""
}

func (ex *Executor) killProcess(ctx context.Context, processName string) (string, string) {
	if runtime.GOOS == "windows" {
		cmd := exec.CommandContext(ctx, "taskkill", "/IM", processName, "/F")
		output, err := cmd.CombinedOutput()
		if err != nil {
			return "", fmt.Sprintf("failed to kill process: %v", err)
		}
		return fmt.Sprintf("Process killed: %s", string(output)), ""
	}

	cmd := exec.CommandContext(ctx, "pkill", "-f", processName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Sprintf("failed to kill process: %v", err)
	}
	return fmt.Sprintf("Process killed: %s", string(output)), ""
}

func (ex *Executor) runScript(ctx context.Context, scriptContent string) (string, string) {
	tmpFile, err := os.CreateTemp("", "action_script_*.sh")
	if err != nil {
		return "", fmt.Sprintf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(scriptContent); err != nil {
		return "", fmt.Sprintf("failed to write script: %v", err)
	}
	tmpFile.Close()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-File", tmpFile.Name())
	} else {
		cmd = exec.CommandContext(ctx, "bash", tmpFile.Name())
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Sprintf("script execution failed: %v", err)
	}
	return string(output), ""
}

func (ex *Executor) logExecution(req ExecutionRequest, result ExecutionResult) {
	auditLog := &db.AuditLog{
		ID:           result.ID,
		Action:       string(req.Type),
		ResourceType: "action_execution",
		ResourceID:   &req.ID,
		OldValues:    toJSON(req),
		NewValues:    toJSON(result),
		Timestamp:    time.Now(),
	}

	if err := db.DB.Create(auditLog).Error; err != nil {
		log.Printf("Failed to log action execution: %v", err)
	}
}

func toJSON(data interface{}) []byte {
	b, _ := json.Marshal(data)
	return b
}

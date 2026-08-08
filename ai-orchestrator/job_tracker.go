package main

import (
	"context"
	"encoding/json"
	"log"
	"time"
)

// JobStatus represents execution status of a playbook
type JobStatus struct {
	JobID       string    `json:"job_id"`
	AgentID     string    `json:"agent_id"`
	PlaybookID  string    `json:"playbook_id"`
	Status      string    `json:"status"` // pending, running, completed, failed
	StartTime   int64     `json:"start_time"`
	EndTime     int64     `json:"end_time,omitempty"`
	Result      string    `json:"result,omitempty"`
	Error       string    `json:"error,omitempty"`
	UpdatedAt   int64     `json:"updated_at"`
}

// JobTracker manages async job execution status
type JobTracker struct {
	// In production, use Redis or a database
	// For now, just log to demonstrate the pattern
}

// StartJob creates a new job record
func (jt *JobTracker) StartJob(ctx context.Context, jobID, agentID, playbookID string) error {
	job := JobStatus{
		JobID:      jobID,
		AgentID:    agentID,
		PlaybookID: playbookID,
		Status:     "pending",
		StartTime:  time.Now().Unix(),
		UpdatedAt:  time.Now().Unix(),
	}
	data, _ := json.Marshal(job)
	log.Printf("[JOB] %s created for %s/%s: %s", jobID, agentID, playbookID, string(data))
	return nil
}

// UpdateJobStatus updates job execution status
func (jt *JobTracker) UpdateJobStatus(ctx context.Context, jobID, status, result, errMsg string) error {
	job := JobStatus{
		JobID:     jobID,
		Status:    status,
		Result:    result,
		Error:     errMsg,
		UpdatedAt: time.Now().Unix(),
	}
	if status == "completed" || status == "failed" {
		job.EndTime = time.Now().Unix()
	}
	log.Printf("[JOB] %s updated: status=%s, error=%s, result=%s", jobID, status, errMsg, result)
	return nil
}

// GetJobStatus retrieves job status
func (jt *JobTracker) GetJobStatus(ctx context.Context, jobID string) (*JobStatus, error) {
	log.Printf("[JOB] retrieving status for %s", jobID)
	return &JobStatus{JobID: jobID, Status: "pending"}, nil
}

// New creates a new job tracker
func NewJobTracker() *JobTracker {
	return &JobTracker{}
}

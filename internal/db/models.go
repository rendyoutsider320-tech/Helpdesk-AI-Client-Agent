package db

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// User represents a system user
type User struct {
	ID                string     `gorm:"primaryKey" json:"id"`
	Name              string     `json:"name"`
	Username          string     `gorm:"uniqueIndex:users_username_key" json:"username"`
	Email             string     `gorm:"uniqueIndex:users_email_key" json:"email"`
	PasswordHash      string     `json:"-"`
	Role              string     `json:"role"` // admin, technician, user
	Status            string     `json:"status"`
	IsOnline          bool       `gorm:"column:is_online;default:false" json:"is_online"`
	MFAEnabled        bool       `json:"mfa_enabled"`
	MFASecret         string     `json:"-"`
	LastLogin         *time.Time `json:"last_login"`
	IPAddress         string     `json:"ip_address"`
	DeviceFingerprint string     `json:"device_fingerprint"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	DeletedAt         *time.Time `json:"-"`
}

// Ticket represents a support ticket
type Ticket struct {
	ID             string     `gorm:"primaryKey" json:"id"`
	TicketNo       string     `gorm:"uniqueIndex:tickets_ticket_no_key" json:"ticket_no"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	Severity       string     `gorm:"index" json:"severity"` // low, medium, high, critical, p1_emergency
	Status         string     `json:"status"`   // created, open, assigned, in_progress, need_approval, resolved, closed, archived
	CreatedBy      string     `json:"created_by"`
	Category       string     `json:"category"`
	SubCategory    string     `json:"sub_category"`
	Device         string     `json:"device"`
	Department     string     `json:"department"`
	Creator        *User      `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"` // <-- UBAH BARIS INI
	AssignedTo     *string    `json:"assigned_to"`
	Assignee       *User      `gorm:"foreignKey:AssignedTo" json:"assignee,omitempty"` // <-- UBAH BARIS INI
	AISummary      string     `json:"ai_summary"`
	RootCause      string     `json:"root_cause"`
	Resolution     string     `json:"resolution"`
	TelegramChatID int64      `json:"telegram_chat_id"`
	SLADue         *time.Time `json:"sla_due"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	ClosedAt       *time.Time `json:"closed_at"`
	CreatedAt      time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	DeletedAt      *time.Time `json:"-"`

	// Relations
	Comments    []TicketComment    `json:"comments,omitempty"`
	Attachments []TicketAttachment `json:"attachments,omitempty"`
	Escalations []Escalation       `json:"escalations,omitempty"`
	Actions     []TicketAction     `json:"actions,omitempty"`
}

func (Ticket) TableName() string {
	return "tickets"
}

// TicketAction represents an automated action suggested by AI
type TicketAction struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	TicketID   string    `json:"ticket_id"`
	ActionType string    `json:"action_type"`
	Target     string    `json:"target"`
	Command    string    `json:"command"`
	Status     string    `json:"status"` // proposed, approved, rejected, executing, completed, failed
	ApprovedBy *string   `json:"approved_by"`
	Result     string    `json:"result"`
	Error      string    `json:"error"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// TechnicianPresence represents real-time technician status
type TechnicianPresence struct {
	ID              string    `gorm:"primaryKey" json:"id"`
	TechnicianID    string    `gorm:"uniqueIndex:unique_technician_presence" json:"technician_id"`
	Technician      *User     `gorm:"foreignKey:TechnicianID" json:"technician,omitempty"`
	Status          string    `json:"status"` // online, offline, busy, idle, on_ticket, on_break
	Shift           string    `json:"shift"`  // Pagi, Siang, Sore
	CurrentTicketID *string   `json:"current_ticket_id"`
	LastHeartbeat   time.Time `json:"last_heartbeat"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TicketComment represents a comment on a ticket
type TicketComment struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	TicketID   string    `json:"ticket_id"`
	UserID     string    `json:"user_id"`
	User       *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Comment    string    `json:"comment"`
	IsInternal bool      `json:"is_internal"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// TicketAttachment represents an attachment to a ticket
type TicketAttachment struct {
	ID         string    `gorm:"primaryKey" json:"id"`
	TicketID   string    `json:"ticket_id"`
	Filename   string    `json:"filename"`
	FilePath   string    `json:"file_path"`
	FileSize   int64     `json:"file_size"`
	MimeType   string    `json:"mime_type"`
	UploadedBy string    `json:"uploaded_by"`
	Uploader   *User     `gorm:"foreignKey:UploadedBy" json:"uploader,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// Device represents a monitored device
type Device struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	DeviceName string     `gorm:"uniqueIndex:devices_device_name_key" json:"device_name"`
	DeviceType string     `json:"device_type"`
	IPAddress  string     `json:"ip_address"`
	MACAddress string     `json:"mac_address"`
	Location   string     `json:"location"`
	Status     string     `json:"status"`
	LastSeen   *time.Time `json:"last_seen"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	IPLan          string     `gorm:"-" json:"ip_lan"`
	IPWifi         string     `gorm:"-" json:"ip_wifi"`
	OSName         string     `gorm:"-" json:"os_name"`
	RustDeskID     string     `gorm:"column:rustdesk_id" json:"rustdesk_id"`
	RustDeskStatus string     `gorm:"column:rustdesk_status" json:"rustdesk_status"`

	// Relations
	Metrics []Metric `json:"metrics,omitempty"`
	Alerts  []Alert  `json:"alerts,omitempty"`
}

// Metric represents a device metric
type Metric struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	DeviceID    string    `json:"device_id"`
	MetricType  string    `json:"metric_type"`
	MetricValue float64   `json:"metric_value"`
	MetricLabel string    `json:"metric_label"`
	Timestamp   time.Time `json:"timestamp"`
}

// Alert represents a system alert
type Alert struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	DeviceID   *string    `gorm:"index" json:"device_id"`
	Device     *Device    `gorm:"foreignKey:DeviceID" json:"device,omitempty"`
	Severity   string     `gorm:"index" json:"severity"` // info, warning, critical
	Metric     string     `json:"metric"`
	Value      string     `json:"value"`
	Message    string     `json:"message"`
	Status     string     `json:"status"`
	ResolvedAt *time.Time `json:"resolved_at"`
	CreatedAt  time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// Incident represents a major incident
type Incident struct {
	ID          string     `gorm:"primaryKey" json:"id"`
	IncidentNo  string     `gorm:"uniqueIndex:incidents_incident_no_key" json:"incident_no"`
	TicketID    *string    `gorm:"index" json:"ticket_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	RootCause   string     `json:"root_cause"`
	Impact      string     `json:"impact"`
	Status      string     `json:"status"`
	Severity    string     `gorm:"index" json:"severity"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	CreatedAt   time.Time  `gorm:"index" json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// KBArticle represents a knowledge base article
type KBArticle struct {
	ID           string         `gorm:"primaryKey" json:"id"`
	Title        string         `json:"title"`
	Content      string         `json:"content"`
	Category     string         `json:"category"`
	Tags         pq.StringArray `gorm:"type:text[]" json:"tags"`
	AuthorID     *string        `json:"author_id"`
	Author       *User          `gorm:"foreignKey:AuthorID" json:"author,omitempty"`
	ViewsCount   int            `json:"views_count"`
	HelpfulCount int            `json:"helpful_count"`
	Status       string         `json:"status"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

// Embedding represents an AI embedding for RAG
type Embedding struct {
	ID           string          `gorm:"primaryKey" json:"id"`
	DocumentID   string          `json:"document_id"`
	DocumentType string          `json:"document_type"`
	Content      string          `json:"content"`
	Embedding    json.RawMessage `json:"embedding" gorm:"type:jsonb"`
	CreatedAt    time.Time       `json:"created_at"`
}

// AuditLog represents an audit log entry
type AuditLog struct {
	ID           string          `gorm:"primaryKey" json:"id"`
	UserID       *string         `json:"user_id"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resource_type"`
	ResourceID   *string         `json:"resource_id"`
	OldValues    json.RawMessage `json:"old_values" gorm:"type:jsonb"`
	NewValues    json.RawMessage `json:"new_values" gorm:"type:jsonb"`
	IPAddress    string          `json:"ip_address"`
	UserAgent    string          `json:"user_agent"`
	Timestamp    time.Time       `json:"timestamp"`
}

// Escalation represents a ticket escalation
type Escalation struct {
	ID               string    `gorm:"primaryKey" json:"id"`
	TicketID         string    `json:"ticket_id"`
	FromTechnicianID *string   `json:"from_technician_id"`
	ToTechnicianID   *string   `json:"to_technician_id"`
	Level            int       `json:"level"`
	Reason           string    `json:"reason"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Notification represents a user notification
type Notification struct {
	ID               string     `gorm:"primaryKey" json:"id"`
	UserID           string     `json:"user_id"`
	Title            string     `json:"title"`
	Message          string     `json:"message"`
	NotificationType string     `json:"notification_type"`
	ResourceType     string     `json:"resource_type"`
	ResourceID       *string    `json:"resource_id"`
	IsRead           bool       `json:"is_read"`
	ReadAt           *time.Time `json:"read_at"`
	CreatedAt        time.Time  `json:"created_at"`
}

type AgentRegistry struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Hostname     string    `gorm:"unique;not null" json:"hostname"`
	AgentVersion string    `json:"agent_version"`
	Status       string    `json:"status"`
	IPAddress    string    `json:"ip_address"`
	OS             string    `json:"os"`
	RustDeskID     string    `gorm:"column:rustdesk_id" json:"rustdesk_id"`
	RustDeskStatus string    `gorm:"column:rustdesk_status" json:"rustdesk_status"`
	LastSeen       time.Time `json:"last_seen"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Action struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name            string    `gorm:"unique;not null" json:"name"`
	Description     string    `json:"description"`
	CommandTemplate string    `gorm:"not null" json:"command_template"`
	RiskLevel       string    `json:"risk_level"`
	Category        string    `json:"category"`
	CreatedAt       time.Time `json:"created_at"`
}

type AutomationJob struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TicketID        *uuid.UUID `json:"ticket_id,omitempty"`
	AgentID         uuid.UUID  `gorm:"not null" json:"agent_id"`
	ActionID        uuid.UUID  `gorm:"not null" json:"action_id"`
	Status          string     `json:"status"`
	CommandExecuted string     `json:"command_executed"`
	Output          string     `json:"output"`
	ErrorLog        string     `json:"error_log"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	FinishedAt      *time.Time `json:"finished_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Approval struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TicketID    uuid.UUID  `gorm:"not null" json:"ticket_id"`
	JobID       uuid.UUID  `json:"job_id"`
	RequestedBy uuid.UUID  `json:"requested_by"`
	ApprovedBy  *uuid.UUID `json:"approved_by,omitempty"`
	Status      string     `json:"status"`
	Reason      string     `json:"reason"`
	RiskScore   int        `json:"risk_score"`
	CreatedAt   time.Time  `json:"created_at"`
	ApprovedAt  *time.Time `json:"approved_at,omitempty"`
}

type TelemetryData struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	DeviceID      uuid.UUID `gorm:"index" json:"device_id"`
	CPUUsage      float64   `json:"cpu_usage"`
	RAMUsage      float64   `json:"ram_usage"`
	DiskUsage     float64   `json:"disk_usage"`
	NetworkRXKbps float64   `json:"network_rx_kbps"`
	NetworkTXKbps float64   `json:"network_tx_kbps"`
	Timestamp     time.Time `gorm:"index" json:"timestamp"`
}

func (AgentRegistry) TableName() string { return "agent_registry" }
func (Action) TableName() string        { return "actions" }
func (AutomationJob) TableName() string { return "automation_jobs" }
func (Approval) TableName() string      { return "approvals" }
func (TelemetryData) TableName() string { return "telemetry" }
func (TechnicianPresence) TableName() string { return "technician_presences" }
func (KBArticle) TableName() string          { return "kb_articles" }

type Asset struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	DeviceID        *string    `gorm:"index" json:"device_id"`
	Hostname        string     `gorm:"not null;index" json:"hostname"`
	SerialNumber    string     `json:"serial_number"`
	Manufacturer    string     `json:"manufacturer"`
	Model           string     `json:"model"`
	CPUModel        string     `json:"cpu_model"`
	CPUCores        int        `json:"cpu_cores"`
	RAMTotalGB      float64    `json:"ram_total_gb"`
	OSName          string     `json:"os_name"`
	OSVersion       string     `json:"os_version"`
	IPAddress       string     `json:"ip_address"`
	MACAddress      string     `json:"mac_address"`
	DNSServers      string     `json:"dns_servers"`
	IPLan           string     `json:"ip_lan"`
	IPWifi          string     `json:"ip_wifi"`
	OperatingSystem string     `json:"operating_system"`
	USBPorts        string     `json:"usb_ports"`
	AssetInfo       string     `json:"asset_info"`
	RustDeskID      string     `gorm:"column:rustdesk_id" json:"rustdesk_id"`
	RustDeskStatus  string     `gorm:"column:rustdesk_status" json:"rustdesk_status"`
	OwnerID         *uuid.UUID `json:"owner_id,omitempty"`
	WarrantyExpiry  *time.Time `json:"warranty_expiry,omitempty"`
	PurchaseDate    *time.Time `json:"purchase_date,omitempty"`
	LocationID      string     `json:"location_id"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

type SoftwareInventory struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID     uuid.UUID  `gorm:"not null" json:"asset_id"`
	Name        string     `gorm:"not null" json:"name"`
	Version     string     `json:"version"`
	Publisher   string     `json:"publisher"`
	InstallDate *time.Time `json:"install_date,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type USBInventory struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID      uuid.UUID `gorm:"not null;index" json:"asset_id"`
	Name         string    `gorm:"not null" json:"name"`
	DeviceID     string    `json:"device_id"`
	VendorID     string    `json:"vendor_id"`
	ProductID    string    `json:"product_id"`
	SerialNumber string    `json:"serial_number"`
	Class        string    `json:"class"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}

type SystemEventLog struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID   uuid.UUID `gorm:"not null;index" json:"asset_id"`
	Hostname  string    `gorm:"index" json:"hostname"`
	Source    string    `json:"source"`
	LogLevel  string    `json:"log_level"`
	Message   string    `json:"message"`
	LogTime   string    `json:"log_time"`
	Raw       string    `json:"raw"`
	CreatedAt time.Time `json:"created_at"`
}

type MonitoredAppStatus struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID   uuid.UUID `gorm:"not null;index" json:"asset_id"`
	Hostname  string    `gorm:"index" json:"hostname"`
	AppName   string    `gorm:"not null" json:"app_name"`
	Status    string    `json:"status"`
	Details   string    `json:"details"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Asset) TableName() string              { return "assets" }
func (SoftwareInventory) TableName() string  { return "software_inventory" }
func (USBInventory) TableName() string       { return "usb_inventory" }
func (SystemEventLog) TableName() string     { return "system_event_logs" }
func (MonitoredAppStatus) TableName() string { return "monitored_app_statuses" }

type RefreshToken struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	UserID     string     `gorm:"index" json:"user_id"`
	TokenHash  string     `gorm:"uniqueIndex" json:"token_hash"`
	IsRevoked  bool       `json:"is_revoked"`
	ExpiresAt  time.Time  `json:"expires_at"`
	ReplacedBy string     `json:"replaced_by"`
	CreatedAt  time.Time  `json:"created_at"`
}

type BlacklistedToken struct {
	TokenHash string    `gorm:"primaryKey" json:"token_hash"`
	ExpiresAt time.Time `gorm:"index" json:"expires_at"`
}

func (RefreshToken) TableName() string     { return "refresh_tokens" }
func (BlacklistedToken) TableName() string { return "blacklisted_tokens" }

// WebsiteMonitor mewakili konfigurasi pemantauan situs web
type WebsiteMonitor struct {
	ID                 string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	URL                string         `gorm:"unique;not null" json:"url"`
	Name               string         `gorm:"not null" json:"name"`
	Description        string         `json:"description"`
	Tags               pq.StringArray `gorm:"type:text[]" json:"tags"`
	IntervalSeconds    int            `gorm:"default:60" json:"interval_seconds"`
	TimeoutSeconds     int            `gorm:"default:15" json:"timeout_seconds"`
	CheckType          string         `gorm:"default:'HTTPS'" json:"check_type"`
	ExpectedStatusCode int            `gorm:"default:200" json:"expected_status_code"`
	CheckSSL           bool           `gorm:"default:true" json:"check_ssl"`
	FollowRedirects    bool           `gorm:"default:true" json:"follow_redirects"`
	KeywordCheck       string         `json:"keyword_check"`
	ScreenshotEnabled  bool           `gorm:"default:false" json:"screenshot_enabled"`
	Location           string         `gorm:"default:'Jakarta'" json:"location"`
	CreatedBy          string         `json:"created_by"`
	IsActive           bool           `gorm:"default:true" json:"is_active"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`

	// Relations
	Incidents []WebsiteMonitorIncident `gorm:"foreignKey:MonitorID" json:"incidents,omitempty"`
}

// WebsiteMonitorMetric mewakili riwayat metrik kinerja pemantauan website
type WebsiteMonitorMetric struct {
	ID               string     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MonitorID        string     `gorm:"type:uuid;index" json:"monitor_id"`
	Available        bool       `json:"available"`
	ResponseTimeMs   int        `json:"response_time_ms"`
	TTFBMs           int        `json:"ttfb_ms"`
	DNSMs            int        `json:"dns_ms"`
	ConnectMs        int        `json:"connect_ms"`
	TLSMs            int        `json:"tls_ms"`
	StatusCode       int        `json:"status_code"`
	SSLDaysRemaining int        `json:"ssl_days_remaining"`
	PageSizeBytes    int        `json:"page_size_bytes"`
	RedirectCount    int        `json:"redirect_count"`
	CertIssuer       string     `json:"cert_issuer"`
	CertSubject      string     `json:"cert_subject"`
	CertFingerprint  string     `json:"cert_fingerprint"`
	CertValidFrom    *time.Time `json:"cert_valid_from"`
	CertValidTo      *time.Time `json:"cert_valid_to"`
	KeywordFound     bool       `json:"keyword_found"`
	ErrorMessage     string     `json:"error_message"`
	Timestamp        time.Time  `gorm:"index" json:"timestamp"`
}

// WebsiteMonitorIncident mewakili insiden pemantauan website
type WebsiteMonitorIncident struct {
	ID              string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MonitorID       string         `gorm:"type:uuid;index;not null" json:"monitor_id"`
	Monitor         *WebsiteMonitor `gorm:"foreignKey:MonitorID" json:"monitor,omitempty"`
	Title           string         `gorm:"not null" json:"title"`
	Description     string         `json:"description"`
	Severity        string         `gorm:"default:'warning'" json:"severity"` // info, warning, critical
	Status          string         `gorm:"default:'open'" json:"status"`       // open, resolved
	StartedAt       time.Time      `gorm:"index" json:"started_at"`
	ResolvedAt      *time.Time     `json:"resolved_at"`
	DurationSeconds int            `json:"duration_seconds"`
	ErrorMessage    string         `json:"error_message"`
	AffectedChecks  pq.StringArray `gorm:"type:text[]" json:"affected_checks"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// SreSlo mewakili konfigurasi target SLO SRE
type SreSlo struct {
	ID                 string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name               string    `gorm:"unique;not null" json:"name"`
	TargetPercent      float64   `gorm:"type:decimal(5,2)" json:"target_percent"`
	WindowDays         int       `gorm:"default:30" json:"window_days"`
	SliType            string    `gorm:"not null" json:"sli_type"`
	CurrentValue       float64   `gorm:"type:decimal(5,2)" json:"current_value"`
	ErrorBudgetPercent float64   `gorm:"type:decimal(5,2)" json:"error_budget_percent"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// SlaBreachLog mencatat peristiwa pelanggaran SLA tiket
type SlaBreachLog struct {
	ID              string     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TicketID        string     `gorm:"type:uuid;index" json:"ticket_id"`
	SLAType         string     `gorm:"not null" json:"sla_type"`
	DueAt           time.Time  `json:"due_at"`
	ResolvedAt      *time.Time `json:"resolved_at,omitempty"`
	DurationSeconds int        `json:"duration_seconds"`
	Breached        bool       `gorm:"default:true" json:"breached"`
	EscalationLevel int        `gorm:"default:0" json:"escalation_level"`
	CreatedAt       time.Time  `json:"created_at"`
}

// CMDBRelationship memetakan dependensi relasional antar Item Konfigurasi (CI)
type CMDBRelationship struct {
	ID               string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	SourceItemID     string    `gorm:"type:uuid;not null;uniqueIndex:idx_cmdb_rel" json:"source_item_id"`
	TargetItemID     string    `gorm:"type:uuid;not null;uniqueIndex:idx_cmdb_rel" json:"target_item_id"`
	RelationshipType string    `gorm:"not null;uniqueIndex:idx_cmdb_rel" json:"relationship_type"`
	ImpactDirection  string    `gorm:"default:'bidirectional'" json:"impact_direction"`
	CreatedAt        time.Time `json:"created_at"`
}

func (WebsiteMonitor) TableName() string         { return "website_monitors" }
func (WebsiteMonitorMetric) TableName() string   { return "website_monitor_metrics" }
func (WebsiteMonitorIncident) TableName() string { return "website_monitor_incidents" }
func (SreSlo) TableName() string                 { return "sre_slos" }
func (SlaBreachLog) TableName() string           { return "sla_breach_logs" }
func (CMDBRelationship) TableName() string       { return "cmdb_relationships" }


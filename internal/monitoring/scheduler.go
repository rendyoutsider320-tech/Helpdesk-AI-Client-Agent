package monitoring

import (
	"log"
	"sync"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
)

// Scheduler mengelola jadwal probe per monitor secara independen
type Scheduler struct {
	mu       sync.Mutex
	timers   map[string]*time.Ticker
	stopChan map[string]chan struct{}
	wg       sync.WaitGroup
}

var globalScheduler = &Scheduler{
	timers:   make(map[string]*time.Ticker),
	stopChan: make(map[string]chan struct{}),
}

// StartWebsiteProber memulai scheduler dan menjalankan probe awal
func StartWebsiteProber() {
	log.Println("Starting Website Monitoring Scheduler...")
	go globalScheduler.run()
}

// run adalah goroutine utama scheduler yang mengelola semua monitor
func (s *Scheduler) run() {
	// Run initial probe on all active monitors
	probeAllActive()

	// Main scheduler loop: setiap 10 detik cek status monitor
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		probeAllActive()
	}
}

// probeAllActive melakukan probe terhadap semua monitor yang aktif
func probeAllActive() {
	var monitors []db.WebsiteMonitor
	if err := db.DB.Where("is_active = ?", true).Find(&monitors).Error; err != nil {
		log.Printf("Scheduler: error fetching monitors: %v", err)
		return
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, 10) // max 10 concurrent probes

	for _, m := range monitors {
		wg.Add(1)
		go func(monitor db.WebsiteMonitor) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			executeProbe(monitor)
		}(m)
	}

	wg.Wait()
}

// executeProbe menjalankan satu probe dan menyimpan hasilnya
func executeProbe(monitor db.WebsiteMonitor) {
	// Cek interval agar probe tidak berjalan berlebihan (menghindari spamming)
	var lastMetric db.WebsiteMonitorMetric
	if err := db.DB.Where("monitor_id = ?", monitor.ID).Order("timestamp DESC").First(&lastMetric).Error; err == nil {
		interval := time.Duration(monitor.IntervalSeconds) * time.Second
		if interval <= 0 {
			interval = 60 * time.Second
		}
		// Toleransi 2 detik agar scheduler 10s bisa memicu interval 10s/15s dengan pas
		if time.Since(lastMetric.Timestamp) < interval-2*time.Second {
			return
		}
	}

	timeout := time.Duration(monitor.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 15 * time.Second
	}

	res := ProbeWebsiteWithOptions(
		monitor.URL,
		timeout,
		monitor.FollowRedirects,
		monitor.KeywordCheck,
		"",
	)

	// Simpan metric
	if err := SaveMetric(monitor.ID, res); err != nil {
		log.Printf("Scheduler: failed to save metric for %s: %v", monitor.Name, err)
	}

	// Deteksi dan kelola incident
	DetectAndCreateIncident(monitor, res)

	// Generate alert jika SSL akan expire atau sudah expire (COMMENTED OUT TO STOP SSL ALERTS RECREATION)
	/*
	if res.SSLDaysRemaining != -1 && res.SSLDaysRemaining <= 30 {
		severity := "warning"
		var msg string
		if res.SSLDaysRemaining <= 0 {
			severity = "critical"
			msg = fmt.Sprintf("%s SSL certificate sudah EXPIRED (%d hari yang lalu)", monitor.Name, -res.SSLDaysRemaining)
		} else {
			if res.SSLDaysRemaining <= 7 {
				severity = "critical"
			}
			msg = fmt.Sprintf("%s SSL certificate akan expire dalam %d hari", monitor.Name, res.SSLDaysRemaining)
		}
		as := &AlertService{}
		_, _ = as.CreateAlert(monitor.ID, severity, "ssl_expiry", "expiring", msg)
	}
	*/
}

// ProbeNow melakukan probe manual segera untuk satu monitor
func ProbeNow(monitorID string) (*ProbeResult, error) {
	var monitor db.WebsiteMonitor
	if err := db.DB.Where("id = ?", monitorID).First(&monitor).Error; err != nil {
		return nil, err
	}

	timeout := time.Duration(monitor.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 15 * time.Second
	}

	res := ProbeWebsiteWithOptions(
		monitor.URL,
		timeout,
		monitor.FollowRedirects,
		monitor.KeywordCheck,
		"",
	)

	_ = SaveMetric(monitor.ID, res)
	DetectAndCreateIncident(monitor, res)

	return &res, nil
}

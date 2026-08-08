package monitoring

import (
	"crypto/sha256"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"

	"github.com/helpdesk-ai/core/internal/db"
)

// ProbeResult merupakan hasil lengkap probe website
type ProbeResult struct {
	Available        bool
	ResponseTime     time.Duration
	TTFB             time.Duration
	DNSTime          time.Duration
	ConnectTime      time.Duration
	TLSTime          time.Duration
	StatusCode       int
	SSLDaysRemaining int
	PageSizeBytes    int
	RedirectCount    int
	CertIssuer       string
	CertSubject      string
	CertFingerprint  string
	CertValidFrom    *time.Time
	CertValidTo      *time.Time
	KeywordFound     bool
	ErrorMessage     string
}

// ProbeWebsite melakukan probe lengkap terhadap URL
func ProbeWebsite(url string, timeout time.Duration) ProbeResult {
	return ProbeWebsiteWithOptions(url, timeout, true, "", "")
}

// ProbeWebsiteWithOptions melakukan probe dengan opsi tambahan
func ProbeWebsiteWithOptions(targetURL string, timeout time.Duration, followRedirects bool, keywordCheck string, _ string) ProbeResult {
	result := ProbeResult{
		SSLDaysRemaining: -1,
	}

	// Timing variables
	var (
		dnsStart    time.Time
		dnsEnd      time.Time
		connectEnd  time.Time
		tlsStart    time.Time
		tlsEnd      time.Time
		ttfbStart   time.Time
	)

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		DisableKeepAlives: true,
	}

	redirectCount := 0
	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}

	if !followRedirects {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
	} else {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			redirectCount++
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		}
	}

	trace := &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) {
			dnsStart = time.Now()
		},
		DNSDone: func(_ httptrace.DNSDoneInfo) {
			dnsEnd = time.Now()
		},
		ConnectDone: func(_, _ string, _ error) {
			connectEnd = time.Now()
		},
		TLSHandshakeStart: func() {
			tlsStart = time.Now()
		},
		TLSHandshakeDone: func(_ tls.ConnectionState, _ error) {
			tlsEnd = time.Now()
		},
		GotFirstResponseByte: func() {
			result.TTFB = time.Since(ttfbStart)
		},
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		result.Available = false
		result.ErrorMessage = "Failed to create request: " + err.Error()
		return result
	}
	req.Header.Set("User-Agent", "SAMS-WebMonitor/2.0")
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	start := time.Now()
	ttfbStart = start

	resp, err := client.Do(req)
	if err != nil {
		result.Available = false
		result.ErrorMessage = "Connection failed: " + err.Error()
		return result
	}
	defer resp.Body.Close()

	// Baca body untuk page size dan keyword check
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024)) // max 5MB
	result.PageSizeBytes = len(body)

	totalTime := time.Since(start)

	result.Available = true
	result.StatusCode = resp.StatusCode
	result.ResponseTime = totalTime
	result.RedirectCount = redirectCount

	// Hitung timing
	if !dnsEnd.IsZero() && !dnsStart.IsZero() {
		result.DNSTime = dnsEnd.Sub(dnsStart)
	}
	if !connectEnd.IsZero() && !dnsEnd.IsZero() {
		result.ConnectTime = connectEnd.Sub(dnsEnd)
	}
	if !tlsEnd.IsZero() && !tlsStart.IsZero() {
		result.TLSTime = tlsEnd.Sub(tlsStart)
	}

	// SSL/TLS certificate details
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		result.SSLDaysRemaining = int(time.Until(cert.NotAfter).Hours() / 24)
		result.CertIssuer = cert.Issuer.CommonName
		result.CertSubject = cert.Subject.CommonName
		validFrom := cert.NotBefore
		validTo := cert.NotAfter
		result.CertValidFrom = &validFrom
		result.CertValidTo = &validTo

		// Generate fingerprint SHA256
		h := sha256.New()
		h.Write(cert.Raw)
		result.CertFingerprint = fmt.Sprintf("%X", h.Sum(nil))
	}

	// Keyword check
	if keywordCheck != "" {
		result.KeywordFound = strings.Contains(string(body), keywordCheck)
	} else {
		result.KeywordFound = true // no keyword check = pass
	}

	return result
}

// SaveMetric menyimpan hasil probe ke database
func SaveMetric(monitorID string, res ProbeResult) error {
	metric := db.WebsiteMonitorMetric{
		MonitorID:        monitorID,
		Available:        res.Available,
		ResponseTimeMs:   int(res.ResponseTime.Milliseconds()),
		TTFBMs:           int(res.TTFB.Milliseconds()),
		DNSMs:            int(res.DNSTime.Milliseconds()),
		ConnectMs:        int(res.ConnectTime.Milliseconds()),
		TLSMs:            int(res.TLSTime.Milliseconds()),
		StatusCode:       res.StatusCode,
		SSLDaysRemaining: res.SSLDaysRemaining,
		PageSizeBytes:    res.PageSizeBytes,
		RedirectCount:    res.RedirectCount,
		CertIssuer:       res.CertIssuer,
		CertSubject:      res.CertSubject,
		CertFingerprint:  res.CertFingerprint,
		CertValidFrom:    res.CertValidFrom,
		CertValidTo:      res.CertValidTo,
		KeywordFound:     res.KeywordFound,
		ErrorMessage:     res.ErrorMessage,
		Timestamp:        time.Now(),
	}
	return db.DB.Create(&metric).Error
}

package integrations

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

type TelegramService struct {
	Token string
}

func NewTelegramService() *TelegramService {
	return &TelegramService{
		Token: os.Getenv("TELEGRAM_BOT_TOKEN"),
	}
}

type Update struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		MessageID int `json:"message_id"`
		From      struct {
			ID int64 `json:"id"`
		} `json:"from"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text    string `json:"text"`
		Caption string `json:"caption"`
		Photo   []struct {
			FileID   string `json:"file_id"`
			FileSize int64  `json:"file_size"`
			Width    int    `json:"width"`
			Height   int    `json:"height"`
		} `json:"photo"`
	} `json:"message"`
}

func (s *TelegramService) SetWebhook(baseURL string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook?url=%s/api/v1/integrations/telegram/webhook", s.Token, baseURL)
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (s *TelegramService) SendMessage(chatID int64, text string) error {
	if s.Token == "" {
		return fmt.Errorf("telegram bot token not configured")
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.Token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram api error: status %d", resp.StatusCode)
	}

	return nil
}

func (s *TelegramService) StartPolling(handler func(Update)) {
	if s.Token == "" {
		return
	}

	go func() {
		offset := 0
		for {
			url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=30", s.Token, offset)
			resp, err := http.Get(url)
			if err != nil {
				fmt.Printf("Telegram polling error: %v\n", err)
				continue
			}

			var result struct {
				OK     bool     `json:"ok"`
				Result []Update `json:"result"`
			}
			json.NewDecoder(resp.Body).Decode(&result)
			resp.Body.Close()

			if result.OK {
				for _, update := range result.Result {
					handler(update)
					offset = update.UpdateID + 1
				}
			}
		}
	}()
}

func (s *TelegramService) DownloadFile(fileID string, destPath string) (int64, error) {
	if s.Token == "" {
		return 0, fmt.Errorf("telegram bot token not configured")
	}

	// 1. Get file path
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", s.Token, fileID)
	resp, err := http.Get(url)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("telegram getFile error: status %d", resp.StatusCode)
	}

	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
			FileSize int64  `json:"file_size"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	if !result.OK || result.Result.FilePath == "" {
		return 0, fmt.Errorf("failed to get file path from telegram response")
	}

	// 2. Download file
	downloadURL := fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", s.Token, result.Result.FilePath)
	fileResp, err := http.Get(downloadURL)
	if err != nil {
		return 0, err
	}
	defer fileResp.Body.Close()

	if fileResp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("telegram download error: status %d", fileResp.StatusCode)
	}

	// Create destination file
	out, err := os.Create(destPath)
	if err != nil {
		return 0, err
	}
	defer out.Close()

	// Write the body to file
	written, err := io.Copy(out, fileResp.Body)
	if err != nil {
		return 0, err
	}

	return written, nil
}

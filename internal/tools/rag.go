package tools

import (
	"context"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"sort"
	"strings"
	"unicode"

	"github.com/helpdesk-ai/core/internal/db"
	"github.com/helpdesk-ai/core/internal/embeddings"
)

type RAGSearchTool struct{}

func (r *RAGSearchTool) Name() string {
	return "rag_search"
}

func (r *RAGSearchTool) Description() string {
	return "Search the knowledge base using a vector-style relevance ranking"
}

func cleanSearchQuery(q string) string {
	lines := strings.Split(q, "\n")
	var cleanedLines []string
	for _, l := range lines {
		lower := strings.ToLower(l)
		if strings.Contains(lower, "bantu hitung") || strings.Contains(lower, "hitunglah") || strings.Contains(lower, "kalkulasi") {
			continue
		}
		cleanedLines = append(cleanedLines, l)
	}
	res := strings.TrimSpace(strings.Join(cleanedLines, " "))
	if res == "" {
		return q
	}
	return res
}

func (r *RAGSearchTool) Execute(ctx context.Context, input map[string]interface{}) (interface{}, error) {
	rawQuery, err := getStringParam(input, "query")
	if err != nil {
		return nil, err
	}

	query := cleanSearchQuery(rawQuery)

	if qdrantResults, err := embeddings.SearchQdrant(ctx, query, 5); err == nil {
		var filtered []map[string]interface{}
		for _, item := range qdrantResults {
			if score, ok := item["score"].(float64); ok && score >= 0.55 {
				filtered = append(filtered, item)
			}
		}
		if len(filtered) > 0 {
			return map[string]interface{}{
				"query":   query,
				"results": filtered,
			}, nil
		}
	} else {
		log.Printf("Qdrant search unavailable, falling back to DB search: %v", err)
	}

	pattern := fmt.Sprintf("%%%s%%", query)
	var articles []db.KBArticle
	if err := db.DB.Where("title ILIKE ? OR content ILIKE ? OR category ILIKE ?", pattern, pattern, pattern).
		Limit(50).
		Find(&articles).Error; err != nil {
		return nil, err
	}

	if len(articles) == 0 {
		// Fallback to keyword-based searching instead of indiscriminately returning top DB articles
		words := strings.Fields(query)
		var matchConditions []string
		var args []interface{}
		for _, w := range words {
			wClean := strings.Trim(strings.ToLower(w), ".,!?\"'()")
			if len(wClean) >= 3 && !isStopWord(wClean) {
				matchConditions = append(matchConditions, "(title ILIKE ? OR content ILIKE ? OR category ILIKE ?)")
				pat := "%" + wClean + "%"
				args = append(args, pat, pat, pat)
			}
		}
		if len(matchConditions) > 0 {
			queryWhere := strings.Join(matchConditions, " OR ")
			_ = db.DB.Where(queryWhere, args...).Limit(30).Find(&articles).Error
		}
	}

	queryVec := textToVector(query)
	type scoredArticle struct {
		Article db.KBArticle `json:"article"`
		Score   float64      `json:"score"`
	}

	var scored []scoredArticle
	for _, article := range articles {
		vector := textToVector(article.Title + " " + article.Content)
		score := cosineSimilarity(queryVec, vector)
		// Only consider articles with a minimum relevance score
		if score >= 0.15 {
			scored = append(scored, scoredArticle{Article: article, Score: score})
		}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].Score > scored[j].Score
	})

	limit := 5
	if len(scored) < limit {
		limit = len(scored)
	}

	results := make([]map[string]interface{}, 0, limit)
	for _, entry := range scored[:limit] {
		results = append(results, map[string]interface{}{
			"id":       entry.Article.ID,
			"title":    entry.Article.Title,
			"category": entry.Article.Category,
			"snippet":  entry.Article.Content,
			"score":    entry.Score,
		})
	}

	return map[string]interface{}{
		"query":   query,
		"results": results,
	}, nil
}

func isStopWord(word string) bool {
	stops := map[string]bool{
		"bantu": true, "hitung": true, "tidak": true, "bisa": true,
		"yang": true, "dengan": true, "atau": true, "pada": true,
		"adalah": true, "untuk": true, "dari": true, "ini": true,
	}
	return stops[word]
}

func snippet(content, query string) string {
	lower := strings.ToLower(content)
	needle := strings.ToLower(query)
	idx := strings.Index(lower, needle)
	if idx == -1 {
		if len(content) <= 160 {
			return content
		}
		return content[:160] + "..."
	}

	start := idx - 40
	if start < 0 {
		start = 0
	}
	end := idx + len(needle) + 40
	if end > len(content) {
		end = len(content)
	}

	return strings.TrimSpace(content[start:end])
}

func textToVector(text string) []float64 {
	vector := make([]float64, 64)
	for _, token := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	}) {
		if token == "" {
			continue
		}
		idx := int(hashString(token) % uint64(len(vector)))
		vector[idx] += 1.0
	}
	return vector
}

func hashString(value string) uint64 {
	h := fnv.New64a()
	h.Write([]byte(value))
	return h.Sum64()
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) {
		return 0
	}

	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

package capcut

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type TimelineSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	IsActive bool   `json:"isActive"`
	IsMain   bool   `json:"isMain"`
}

type DraftSelection struct {
	Token                 string            `json:"token"`
	Name                  string            `json:"name"`
	DraftPath             string            `json:"draftPath"`
	RequiresTimelineChoice bool             `json:"requiresTimelineChoice"`
	RecommendedTimelineId  string           `json:"recommendedTimelineId,omitempty"`
	Timelines             []TimelineSummary `json:"timelines"`
	Warnings              []string          `json:"warnings"`
}

type DraftReader struct{}

func NewDraftReader() *DraftReader {
	return &DraftReader{}
}

// InspectDraft verifies the folder/file safety, detects draft_content.json,
// and extracts timeline choices if multiple timelines exist.
func (r *DraftReader) InspectDraft(inputPath string) (*DraftSelection, error) {
	cleanPath := filepath.Clean(inputPath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("cannot access path: %w", err)
	}

	targetFile := cleanPath
	folderName := filepath.Base(cleanPath)
	if info.IsDir() {
		targetFile = filepath.Join(cleanPath, "draft_content.json")
		if _, err := os.Stat(targetFile); err != nil {
			return nil, errors.New("draft_content.json not found in chosen directory")
		}
	} else {
		folderName = filepath.Base(filepath.Dir(cleanPath))
	}

	data, err := os.ReadFile(targetFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read draft content: %w", err)
	}

	// Parse basic timeline info to check if selection is needed
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("invalid draft JSON: %w", err)
	}

	selection := &DraftSelection{
		Token:     targetFile,
		Name:      folderName,
		DraftPath: targetFile,
		Timelines: []TimelineSummary{},
		Warnings:  []string{},
	}

	// Check tracks/materials
	if tracks, ok := raw["tracks"].([]interface{}); ok && len(tracks) > 0 {
		selection.Timelines = append(selection.Timelines, TimelineSummary{
			ID:       "main",
			Name:     folderName,
			IsActive: true,
			IsMain:   true,
		})
	}

	return selection, nil
}

func (r *DraftReader) ReadContent(token string) (string, error) {
	cleanPath := filepath.Clean(token)
	// Security: only allow reading draft_content.json or .json files
	if !strings.HasSuffix(strings.ToLower(cleanPath), ".json") {
		return "", errors.New("invalid draft file type")
	}

	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

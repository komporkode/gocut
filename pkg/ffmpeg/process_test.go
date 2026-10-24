package ffmpeg

import (
	"testing"
)

func TestParseRotation(t *testing.T) {
	// Case 1: Tag rotate = "90"
	tags90 := map[string]string{"rotate": "90"}
	if rot := parseRotation(tags90, nil); rot != 90 {
		t.Fatalf("Expected 90, got %d", rot)
	}

	// Case 2: Tag rotate = "-90" -> normalized to 270
	tagsMinus90 := map[string]string{"rotate": "-90"}
	if rot := parseRotation(tagsMinus90, nil); rot != 270 {
		t.Fatalf("Expected 270, got %d", rot)
	}

	// Case 3: Display Matrix side data with rotation -90
	sideData := []map[string]interface{}{
		{"side_data_type": "Display Matrix", "rotation": float64(-90)},
	}
	if rot := parseRotation(nil, sideData); rot != 270 {
		t.Fatalf("Expected 270, got %d", rot)
	}

	// Case 4: No rotation tags
	if rot := parseRotation(nil, nil); rot != 0 {
		t.Fatalf("Expected 0, got %d", rot)
	}
}

func TestApplyRotationDimensions(t *testing.T) {
	w, h := 1920, 1080
	rot := 90
	swappedW, swappedH := applyRotationDimensions(w, h, rot)
	if swappedW != 1080 || swappedH != 1920 {
		t.Fatalf("Expected 1080x1920 for 90deg rotation, got %dx%d", swappedW, swappedH)
	}

	rot0 := 0
	normalW, normalH := applyRotationDimensions(w, h, rot0)
	if normalW != 1920 || normalH != 1080 {
		t.Fatalf("Expected 1920x1080 for 0deg rotation, got %dx%d", normalW, normalH)
	}
}

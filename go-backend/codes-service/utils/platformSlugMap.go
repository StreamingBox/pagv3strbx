package utils

import (
	"regexp"
	"strings"
)

var normalizeRe1 = regexp.MustCompile(`\s+`)
var normalizeRe2 = regexp.MustCompile(`[^a-z0-9 ]`)

func normalizeKey(s string) string {
	lower := strings.ToLower(strings.TrimSpace(s))
	spaced := normalizeRe1.ReplaceAllString(lower, " ")
	return normalizeRe2.ReplaceAllString(spaced, "")
}

func ToCodeSlug(platformSlug string) string {
	key := normalizeKey(platformSlug)

	if strings.Contains(key, "chatgpt") || strings.Contains(key, "chat gpt") {
		return "chatgpt"
	}
	if strings.Contains(key, "spotify") {
		return "spotify"
	}
	if strings.Contains(key, "prime") {
		return "prime"
	}
	if strings.Contains(key, "netflix") {
		return "netflix"
	}

	aliases := map[string]string{
		"netflix": "netflix",
		"spotify": "spotify",
		"chatgpt": "chatgpt",
		"prime":   "prime",
	}

	if alias, exists := aliases[key]; exists {
		return alias
	}

	return strings.ReplaceAll(key, " ", "")
}

func NormalizeSlug(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

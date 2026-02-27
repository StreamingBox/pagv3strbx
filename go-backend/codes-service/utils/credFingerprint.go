package utils

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func CredFingerprint(password, pin string) string {
	raw := fmt.Sprintf("%s::%s", password, pin)
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}

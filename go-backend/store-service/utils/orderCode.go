package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func MakeOrderCode() string {
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 36)
	b := make([]byte, 3)
	rand.Read(b)
	rnd := hex.EncodeToString(b)

	code := fmt.Sprintf("ORD-%s-%s", timestamp, rnd)
	return strings.ToUpper(code)
}

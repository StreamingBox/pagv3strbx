package utils

import (
	"fmt"
	"strings"
	"time"

	"pagv2strbx-store/models"
)

type WhatsappResultItem struct {
	SubscriptionID int
	PlanName       string
	Account        models.PlatformAccount
	ExpiresAt      time.Time
	Token          string
}

func BuildWhatsappMessage(orderCode string, results []WhatsappResultItem, baseUrl string) string {
	cleanBaseUrl := strings.TrimRight(baseUrl, "/")

	var lines []string
	lines = append(lines, fmt.Sprintf("🧾 Orden: %s", orderCode))
	lines = append(lines, fmt.Sprintf("📦 Pedido múltiple (%d items)", len(results)))
	lines = append(lines, "")

	for _, r := range results {
		yyyy := r.ExpiresAt.Format("2006-01-02")
		credentialUrl := fmt.Sprintf("%s/s/%s", cleanBaseUrl, r.Token)

		lines = append(lines, fmt.Sprintf("🆔 ID: %d | 🖥️ %s", r.SubscriptionID, r.PlanName))
		lines = append(lines, fmt.Sprintf("📧 Correo: %s", r.Account.Email))
		lines = append(lines, fmt.Sprintf("🔑 Contraseña: %s", r.Account.Password))

		if r.Account.ProfileNumber > 0 {
			lines = append(lines, fmt.Sprintf("👤 Perfil: %d", r.Account.ProfileNumber))
		}

		if strings.TrimSpace(r.Account.Pin) != "" {
			lines = append(lines, fmt.Sprintf("🔢 Pin: %s", r.Account.Pin))
		}

		lines = append(lines, fmt.Sprintf("📅 Expira: %s", yyyy))
		lines = append(lines, fmt.Sprintf("*🔗⚠️ Debido a que en ocasiones se bloquea o cambia la clave, en este enlace %s puedes consultar la contraseña hasta tu último día contratado. 💻🔑:*", credentialUrl))
		lines = append(lines, "")
		lines = append(lines, "")
	}

	return strings.Join(lines, "\n")
}

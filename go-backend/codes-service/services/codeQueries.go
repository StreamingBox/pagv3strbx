package services

import (
	"errors"
	"pagv2strbx-codes/config"
	"pagv2strbx-codes/models"
)

func GetCodePlatformBySlug(slug string) (models.CodePlatform, error) {
	var platform models.CodePlatform
	if config.DB == nil {
		return platform, errors.New("database not connected")
	}
	result := config.DB.Where("slug = ? AND is_active = 1", slug).First(&platform)
	return platform, result.Error
}

func GetSubscriptionWithAccount(orderNumber string) (models.JoinedSubscriptionAccount, error) {
	var sub models.JoinedSubscriptionAccount

	if config.DB == nil {
		return sub, errors.New("database not connected")
	}

	query := `
		SELECT 
			o.order_number as orderNumber,
			o.user_id as userId,
			p.slug as platformSlug,
			p.name as platformName,
			u.email as userEmail,
			a.email as accountEmail,
			a.password as accountPassword,
			a.pin as accountPin,
			a.id as platformAccountId,
			o.status,
			o.expires_at
		FROM orders o
		LEFT JOIN users u ON o.user_id = u.id
		LEFT JOIN accounts a ON o.account_id = a.id
		LEFT JOIN platforms p ON o.platform_id = p.id
		WHERE o.order_number = ?
		LIMIT 1
	`

	result := config.DB.Raw(query, orderNumber).Scan(&sub)
	return sub, result.Error
}

type LastDelivered struct {
	CredentialFingerprint string
}

func GetLastDelivered(orderNumber string, platformSlug string) (string, error) {
	var last LastDelivered
	if config.DB == nil {
		return "", errors.New("database not connected")
	}

	query := `
		SELECT credential_fingerprint 
		FROM code_logs 
		WHERE order_number = ? AND platform = ? AND status = 'delivered'
		ORDER BY id DESC LIMIT 1
	`
	result := config.DB.Raw(query, orderNumber, platformSlug).Scan(&last)
	return last.CredentialFingerprint, result.Error
}

func SaveCodeLogDelivery(orderNumber string, platformSlug string, fingerprint string, code string, status string) {
	if config.DB == nil {
		return
	}
	query := `
		INSERT INTO code_logs (order_number, platform, credential_fingerprint, code, status, created_at)
		VALUES (?, ?, ?, ?, ?, NOW())
	`
	config.DB.Exec(query, orderNumber, platformSlug, fingerprint, code, status)
}

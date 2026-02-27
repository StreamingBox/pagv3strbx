package models

import "time"

type OrderSubscription struct {
	ID                int       `gorm:"primaryKey" json:"id"`
	OrderNumber       string    `json:"order_number"`
	UserId            int       `json:"user_id"`
	PlatformSlug      string    `json:"platform_slug"` // Sometimes name
	UserEmail         string    `json:"user_email"`
	AccountEmail      string    `json:"account_email"`
	AccountPassword   string    `json:"account_password"`
	AccountPin        string    `json:"account_pin"`
	PlatformAccountId int       `json:"platform_account_id"`
	Status            string    `json:"status"`
	ExpiresAt         time.Time `json:"expires_at"`
}

// Emulating the previous query `getSubscriptionWithAccount`
type JoinedSubscriptionAccount struct {
	OrderNumber       string    `json:"orderNumber"`
	UserId            int       `json:"userId"`
	PlatformSlug      string    `json:"platformSlug"`
	PlatformName      string    `json:"platformName"`
	UserEmail         string    `json:"userEmail"`
	AccountEmail      string    `json:"accountEmail"`
	AccountPassword   string    `json:"accountPassword"`
	AccountPin        string    `json:"accountPin"`
	PlatformAccountId int       `json:"platformAccountId"`
	Status            string    `json:"status"`
	ExpiresAt         time.Time `json:"expires_at"`
}

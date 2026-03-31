package models

import "time"

type PlatformPrice struct {
	ID         int     `gorm:"primaryKey" json:"id"`
	PlatformID int     `json:"platform_id"`
	DurationID int     `json:"duration_id"`
	Price      float64 `json:"price"`
	Currency   string  `json:"currency"`
	IsActive   int     `json:"is_active"`
}

type Order struct {
	ID        int       `gorm:"primaryKey" json:"id"`
	UserID    int       `json:"user_id"`
	OrderCode string    `json:"order_code"`
	Total     float64   `json:"total"`
	Currency  string    `json:"currency"`
	CreatedAt time.Time `json:"created_at"`
}

type Wallet struct {
	ID          int     `gorm:"primaryKey" json:"id"`
	UserID      int     `json:"user_id"`
	Balance     float64 `json:"balance"`
	ProfitTotal float64 `json:"profit_total"`
	Currency    string  `json:"currency"`
}

type Subscription struct {
	ID                int       `gorm:"primaryKey" json:"id"`
	UserID            int       `json:"user_id"`
	PlatformID        int       `json:"platform_id"`
	PlatformPriceID   int       `json:"platform_price_id"`
	DurationID        int       `json:"duration_id"`
	PlatformAccountID int       `json:"platform_account_id"`
	Status            string    `json:"status"` // 'active', 'expired'
	ExpiresAt         time.Time `json:"expires_at"`
	Price             float64   `json:"price"`
	Currency          string    `json:"currency"`
}

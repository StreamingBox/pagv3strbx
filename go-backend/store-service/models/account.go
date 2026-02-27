package models

import "time"

type PlatformAccount struct {
	ID               int        `gorm:"primaryKey" json:"id"`
	PlatformId       int        `json:"platform_id"`
	AccountType      string     `json:"account_type"` // 'complete', 'profile'
	Email            string     `json:"email"`
	Password         string     `json:"password"`
	Pin              string     `json:"pin,omitempty"`
	ProfileNumber    int        `json:"profile_number,omitempty"`
	AccessUrl        string     `json:"access_url,omitempty"`
	Status           string     `json:"status"` // 'available', 'assigned', 'suspended', 'expired'
	CreatedByUserId  int        `json:"created_by_user_id"`
	AssignedToUserId int        `json:"assigned_to_user_id,omitempty"`
	AssignedAt       *time.Time `json:"assigned_at,omitempty"`
	ExpiresAt        *time.Time `json:"expires_at,omitempty"`
}

func (PlatformAccount) TableName() string {
	return "platform_accounts"
}

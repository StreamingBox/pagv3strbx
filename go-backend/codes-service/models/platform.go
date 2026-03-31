package models

type CodePlatform struct {
	ID            int    `gorm:"primaryKey" json:"id"`
	Slug          string `json:"slug"`
	Name          string `json:"name"`
	GmailFrom     string `json:"gmail_from"`
	CodeRegex     string `json:"code_regex"`
	MaxAgeMinutes int    `json:"max_age_minutes"`
	IsActive      int    `json:"is_active"` // 1 = true, 0 = false
}

func (CodePlatform) TableName() string {
	return "code_platforms"
}

package services

type CodePlatformMock struct {
	Slug          string `json:"slug"`
	GmailFrom     string `json:"gmail_from"`
	CodeRegex     string `json:"code_regex"`
	MaxAgeMinutes int    `json:"max_age_minutes"`
	IsActive      int    `json:"is_active"`
}

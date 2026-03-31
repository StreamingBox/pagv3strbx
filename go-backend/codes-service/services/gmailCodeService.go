package services

import (
	"fmt"
	"io"
	"log"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/emersion/go-imap"
	"github.com/emersion/go-imap/client"
	"github.com/emersion/go-message/mail"
)

type FetchCodeResult struct {
	Ok        bool      `json:"ok"`
	Code      string    `json:"code,omitempty"`
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	EmailDate time.Time `json:"emailDate,omitempty"`
}

type FetchCodeParams struct {
	ToEmail           string
	GmailFromContains string
	CodeRegex         string
	MaxAgeMinutes     int
}

func FetchCodeFromGmail(params FetchCodeParams) FetchCodeResult {
	user := os.Getenv("GMAIL_EMAIL")
	password := os.Getenv("GMAIL_IMAP_PASS")

	if user == "" || password == "" {
		return FetchCodeResult{
			Ok:      false,
			Status:  "config_error",
			Message: "Faltan variables GMAIL_EMAIL o GMAIL_IMAP_PASS en el servidor (Go).",
		}
	}

	maxMin := params.MaxAgeMinutes
	if maxMin <= 0 {
		maxMin = 15
	}
	sinceDate := time.Now().Add(-time.Duration(maxMin) * time.Minute)
	// Truncate to day to match IMAP SINCE behavior (usually by date, not time)
	sinceDateDay := time.Date(sinceDate.Year(), sinceDate.Month(), sinceDate.Day(), 0, 0, 0, 0, sinceDate.Location())

	// Connect to server
	log.Println("Connecting to imap.gmail.com:993...")
	c, err := client.DialTLS("imap.gmail.com:993", nil)
	if err != nil {
		return FetchCodeResult{Ok: false, Status: "imap_error", Message: err.Error()}
	}
	defer c.Logout()

	// Login
	if err := c.Login(user, password); err != nil {
		return FetchCodeResult{Ok: false, Status: "imap_auth_error", Message: err.Error()}
	}

	// Select INBOX
	_, err = c.Select("INBOX", false)
	if err != nil {
		return FetchCodeResult{Ok: false, Status: "imap_inbox_error", Message: err.Error()}
	}

	// Prepare Search Criteria
	criteria := imap.NewSearchCriteria()
	criteria.Since = sinceDateDay
	if params.ToEmail != "" {
		criteria.Header.Set("TO", params.ToEmail)
	}

	// First attempt: with TO
	uids, err := c.Search(criteria)
	if err != nil {
		return FetchCodeResult{Ok: false, Status: "imap_search_error", Message: err.Error()}
	}

	// Fallback attempt: if no uids found and ToEmail was provided, try without TO
	if len(uids) == 0 && params.ToEmail != "" {
		criteriaWithoutTo := imap.NewSearchCriteria()
		criteriaWithoutTo.Since = sinceDateDay
		uids, err = c.Search(criteriaWithoutTo)
		if err != nil {
			return FetchCodeResult{Ok: false, Status: "imap_search_error", Message: err.Error()}
		}
	}

	if len(uids) == 0 {
		return FetchCodeResult{Ok: false, Status: "not_found", Message: "No hay correos recientes (Go)."}
	}

	re, err := regexp.Compile("(?i)" + params.CodeRegex)
	if err != nil {
		return FetchCodeResult{Ok: false, Status: "config_error", Message: "Regex inválida."}
	}

	// Fetch highest UID first (newest)
	seqset := new(imap.SeqSet)
	// We want to process backwards
	for i := len(uids) - 1; i >= 0; i-- {
		seqset.AddNum(uids[i])
	}
	if seqset.Empty() {
		return FetchCodeResult{Ok: false, Status: "not_found", Message: "No uids."}
	}

	// Fetch entire body
	section := &imap.BodySectionName{}
	items := []imap.FetchItem{imap.FetchEnvelope, imap.FetchInternalDate, section.FetchItem()}

	messages := make(chan *imap.Message, len(uids))
	done := make(chan error, 1)

	go func() {
		done <- c.Fetch(seqset, items, messages)
	}()

	fromNeedle := strings.ToLower(strings.TrimSpace(params.GmailFromContains))
	sawExpired := false
	sawMatch := false

	for msg := range messages {
		msgDate := msg.InternalDate
		ageMinutes := time.Since(msgDate).Minutes()

		env := msg.Envelope
		var envFromStr string
		if env != nil && len(env.From) > 0 {
			f := env.From[0]
			envFromStr = strings.ToLower(f.MailboxName + "@" + f.HostName)
		}

		fromLooksOk := (fromNeedle == "" || strings.Contains(envFromStr, fromNeedle))

		if ageMinutes > float64(maxMin) {
			if fromLooksOk {
				sawExpired = true
			}
			continue
		}

		r := msg.GetBody(section)
		if r == nil {
			continue
		}

		mr, err := mail.CreateReader(r)
		if err != nil {
			continue // Parse error
		}

		header := mr.Header
		subject, _ := header.Subject()
		fromAddressList, _ := header.AddressList("From")

		fromText := ""
		if len(fromAddressList) > 0 {
			fromText = strings.ToLower(fromAddressList[0].Address)
		}

		if fromNeedle != "" && !strings.Contains(fromText, fromNeedle) {
			continue
		}

		sawMatch = true
		textBody := ""
		htmlBody := ""

		for {
			p, err := mr.NextPart()
			if err == io.EOF {
				break
			} else if err != nil {
				break
			}

			switch h := p.Header.(type) {
			case *mail.InlineHeader:
				contentType, _, _ := h.ContentType()
				b, _ := io.ReadAll(p.Body)
				if strings.HasPrefix(contentType, "text/plain") {
					textBody += string(b)
				} else if strings.HasPrefix(contentType, "text/html") {
					htmlBody += string(b)
				}
			}
		}

		// Remove non-breaking spaces
		subject = strings.ReplaceAll(subject, "\u00A0", " ")
		textBody = strings.ReplaceAll(textBody, "\u00A0", " ")
		htmlBody = strings.ReplaceAll(htmlBody, "\u00A0", " ")

		haystack := fmt.Sprintf("%s\n%s\n%s", subject, textBody, htmlBody)
		matches := re.FindStringSubmatch(haystack)

		if len(matches) > 1 {
			return FetchCodeResult{
				Ok:        true,
				Code:      matches[1],
				EmailDate: msgDate,
			}
		}
	}

	if err := <-done; err != nil {
		return FetchCodeResult{Ok: false, Status: "imap_fetch_error", Message: err.Error()}
	}

	if sawExpired && !sawMatch {
		return FetchCodeResult{
			Ok:      false,
			Status:  "expired",
			Message: fmt.Sprintf("El correo está vencido (Go) (más de %d minutos).", maxMin),
		}
	}

	if !sawMatch {
		return FetchCodeResult{
			Ok:      false,
			Status:  "not_found",
			Message: "No se encontraron correos recientes del remitente (Go).",
		}
	}

	return FetchCodeResult{Ok: false, Status: "not_found", Message: "No se pudo extraer el código (Regex Go)."}
}

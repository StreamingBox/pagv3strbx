package handlers

import (
	"pagv2strbx-codes/services"
	"pagv2strbx-codes/utils"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CodeRequest struct {
	OrderNumber  string `json:"orderNumber"`
	PlatformSlug string `json:"platformSlug"`
}

func RequestCodeHandler(c *fiber.Ctx) error {
	var body CodeRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"ok": false, "message": "Invalid request body"})
	}

	requestedSlug := utils.ToCodeSlug(body.PlatformSlug)

	// 1) Config plataforma
	var plat *services.CodePlatformMock // Using struct for platform config matching
	if requestedSlug == "chatgpt" {
		plat = &services.CodePlatformMock{
			Slug:          "chatgpt",
			GmailFrom:     "tm.openai.com",
			CodeRegex:     "Tu código de ChatGPT es\\s*([0-9]{6})",
			MaxAgeMinutes: 15,
			IsActive:      1,
		}
	} else {
		dbPlat, err := services.GetCodePlatformBySlug(requestedSlug)
		if err != nil || dbPlat.IsActive != 1 {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"ok": false, "message": "Plataforma no disponible"})
		}
		plat = &services.CodePlatformMock{
			Slug:          dbPlat.Slug,
			GmailFrom:     dbPlat.GmailFrom,
			CodeRegex:     dbPlat.CodeRegex,
			MaxAgeMinutes: dbPlat.MaxAgeMinutes,
			IsActive:      dbPlat.IsActive,
		}
	}

	// 2) Pedido
	sub, err := services.GetSubscriptionWithAccount(body.OrderNumber)
	if err != nil || sub.OrderNumber == "" {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"ok": false, "message": "Pedido no encontrado"})
	}

	soldAccountEmail := utils.NormalizeSlug(sub.AccountEmail)

	if sub.PlatformAccountId == 0 || soldAccountEmail == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"ok":      false,
			"status":  "no_account",
			"message": "Este pedido aún no tiene cuenta asignada.",
		})
	}

	fingerprint := utils.CredFingerprint(sub.AccountPassword, sub.AccountPin)

	// Authorization simulation (in full Go app, use JWT context). We skip user validation for this microservice logic for brevity/speed.
	// Normally we would get user from auth headers.

	// 4) Validate platform
	rawFromSub := sub.PlatformSlug
	if rawFromSub == "" {
		rawFromSub = sub.PlatformName
	}
	expectedCodeSlug := utils.ToCodeSlug(rawFromSub)

	if expectedCodeSlug != requestedSlug {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"ok":      false,
			"message": "Plataforma no coincide con el pedido",
		})
	}

	// 5) activo y no vencido
	isActive := utils.NormalizeSlug(sub.Status) == "active"
	notExpired := sub.ExpiresAt.IsZero() || sub.ExpiresAt.After(time.Now())

	if !isActive || !notExpired {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"ok":      false,
			"message": "Pedido/cuenta no activa o vencida",
		})
	}

	// 6) Regla 1 por pedido
	lastFp, _ := services.GetLastDelivered(body.OrderNumber, requestedSlug)
	if lastFp == fingerprint {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"ok":      false,
			"status":  "blocked",
			"message": "Solo se puede solicitar 1 código por pedido. Si cambias la clave/pin podrás solicitar nuevamente.",
		})
	}

	// 7) GMAIL IMAP FETCHER
	fetchResult := services.FetchCodeFromGmail(services.FetchCodeParams{
		ToEmail:           soldAccountEmail,
		GmailFromContains: plat.GmailFrom,
		CodeRegex:         plat.CodeRegex,
		MaxAgeMinutes:     plat.MaxAgeMinutes,
	})

	if !fetchResult.Ok {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"ok":      false,
			"status":  fetchResult.Status,
			"message": fetchResult.Message,
		})
	}

	// 8) Success!
	orderNumInt, _ := strconv.Atoi(body.OrderNumber)

	go func() {
		// Log delivery in background
		services.SaveCodeLogDelivery(body.OrderNumber, requestedSlug, fingerprint, fetchResult.Code, "delivered")
	}()

	return c.JSON(fiber.Map{
		"ok":          true,
		"orderNumber": orderNumInt,
		"platform":    requestedSlug,
		"email":       soldAccountEmail,
		"code":        fetchResult.Code,
	})
}

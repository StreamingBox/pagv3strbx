package handlers

import (
	"pagv2strbx-store/config"
	"pagv2strbx-store/models"
	"pagv2strbx-store/utils"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CheckoutItem struct {
	PlatformPriceId int `json:"platformPriceId"`
}

type CheckoutRequest struct {
	UserId          int            `json:"userId"`
	IncludeWhatsapp bool           `json:"includeWhatsapp"`
	Items           []CheckoutItem `json:"items"`
	RecordProfit    bool           `json:"recordProfit"`
	ProfitAmount    float64        `json:"profitAmount"`
}

func CheckoutHandler(c *fiber.Ctx) error {
	var body CheckoutRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"ok": false, "message": "Invalid request body"})
	}

	priceIds := []int{}
	for _, item := range body.Items {
		if item.PlatformPriceId > 0 {
			priceIds = append(priceIds, item.PlatformPriceId)
		}
	}

	if len(priceIds) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"ok": false, "message": "items debe contener al menos un platformPriceId válido."})
	}

	if len(priceIds) > 20 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"ok": false, "message": "Máximo 20 items por checkout."})
	}

	if body.RecordProfit && body.ProfitAmount < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"ok": false, "message": "profitAmount debe ser un número >= 0."})
	}

	// Begin Transaction
	tx := config.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"ok": false, "message": "Database transaction error"})
	}

	// 1) Fetch Plans
	var plans []struct {
		PlatformPriceID int
		PlatformID      int
		DurationID      int
		Price           float64
		Currency        string
		Days            int
		PlatformName    string
		PlatformSlug    string
	}

	query := `
		SELECT
			pp.id as platform_price_id, pp.platform_id, pp.duration_id, pp.price, pp.currency,
			d.days, p.name as platform_name, p.slug as platform_slug
		FROM platform_prices pp
		JOIN durations d ON d.id = pp.duration_id
		JOIN platforms p ON p.id = pp.platform_id
		WHERE pp.id IN ? AND pp.is_active = 1
	`
	if err := tx.Raw(query, priceIds).Scan(&plans).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"message": "Error retrieving plans"})
	}

	// Validate Plan existence
	planMap := make(map[int]bool)
	for _, p := range plans {
		planMap[p.PlatformPriceID] = true
	}
	missing := []int{}
	for _, id := range priceIds {
		if !planMap[id] {
			missing = append(missing, id)
		}
	}

	if len(missing) > 0 {
		tx.Rollback()
		return c.Status(404).JSON(fiber.Map{"ok": false, "message": "Uno o más planes no existen o están inactivos", "payload": missing})
	}

	// 2) Check Currencies
	firstCurrency := ""
	if len(plans) > 0 {
		firstCurrency = plans[0].Currency
		if firstCurrency == "" {
			firstCurrency = "COP"
		}
	}

	for _, p := range plans {
		curr := p.Currency
		if curr == "" {
			curr = "COP"
		}
		if curr != firstCurrency {
			tx.Rollback()
			return c.Status(400).JSON(fiber.Map{"ok": false, "message": "Todos los items deben tener la misma moneda."})
		}
	}

	// 3) Wallet Lock
	var wallet models.Wallet
	if err := tx.Raw("SELECT id, user_id, balance, currency, profit_total FROM wallets WHERE user_id = ? FOR UPDATE", body.UserId).Scan(&wallet).Error; err != nil {
		// Ignore error, wallet simply might not exist.
	}

	if wallet.ID == 0 {
		wallet = models.Wallet{UserID: body.UserId, Balance: 0, Currency: firstCurrency}
		if err := tx.Create(&wallet).Error; err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"message": "Could not create wallet"})
		}
	}

	wCurrency := wallet.Currency
	if wCurrency == "" {
		wCurrency = "COP"
	}

	if wCurrency != firstCurrency {
		tx.Rollback()
		return c.Status(400).JSON(fiber.Map{"ok": false, "message": "Moneda de carrito distinta a la wallet."})
	}

	// 4) Calculate Total
	var total float64
	for _, id := range priceIds {
		for _, p := range plans {
			if id == p.PlatformPriceID {
				total += p.Price
				break
			}
		}
	}

	if wallet.Balance < total {
		tx.Rollback()
		return c.Status(402).JSON(fiber.Map{"ok": false, "message": "Saldo insuficiente.", "payload": map[string]interface{}{"needed": total, "balance": wallet.Balance}})
	}

	// 5) Create Order
	orderCode := utils.MakeOrderCode()
	order := models.Order{
		UserID:    body.UserId,
		OrderCode: orderCode,
		Total:     total,
		Currency:  firstCurrency,
		CreatedAt: time.Now(),
	}

	if err := tx.Create(&order).Error; err != nil {
		tx.Rollback()
		return c.Status(500).JSON(fiber.Map{"message": "Error creating order"})
	}

	// 6) Assign Accounts and Subscriptions
	var results []utils.WhatsappResultItem

	for _, id := range priceIds {
		// Find selected plan
		var selectedPlan struct {
			PlatformPriceID int
			PlatformID      int
			DurationID      int
			Price           float64
			Currency        string
			Days            int
			PlatformName    string
			PlatformSlug    string
		}
		for _, p := range plans {
			if p.PlatformPriceID == id {
				selectedPlan = p
				break
			}
		}

		var account models.PlatformAccount
		if err := tx.Raw("SELECT id, email, password, pin, profile_number, access_url FROM platform_accounts WHERE platform_id = ? AND status = 'available' ORDER BY id ASC LIMIT 1 FOR UPDATE", selectedPlan.PlatformID).Scan(&account).Error; err != nil {
			// ignore specific err, just check 0
		}

		if account.ID == 0 {
			tx.Rollback()
			return c.Status(409).JSON(fiber.Map{"ok": false, "message": "No hay cuentas disponibles. Contacta al administrador."})
		}

		expiresAt := time.Now().Add(time.Duration(selectedPlan.Days) * 24 * time.Hour)

		sub := models.Subscription{
			UserID:            body.UserId,
			PlatformID:        selectedPlan.PlatformID,
			PlatformPriceID:   selectedPlan.PlatformPriceID,
			DurationID:        selectedPlan.DurationID,
			PlatformAccountID: account.ID,
			Status:            "active",
			ExpiresAt:         expiresAt,
			Price:             selectedPlan.Price,
			Currency:          firstCurrency,
		}

		if err := tx.Create(&sub).Error; err != nil {
			tx.Rollback()
			return c.Status(500).JSON(fiber.Map{"message": "Error creating sub"})
		}

		tx.Exec("UPDATE platform_accounts SET status = 'assigned', assigned_to_user_id = ?, assigned_at = NOW(), expires_at = ? WHERE id = ?", body.UserId, expiresAt, account.ID)

		token := utils.MakeOrderCode() // Mock logic for generating Share token logic for credentials

		tx.Exec("INSERT INTO order_items (order_id, subscription_id, platform_id, platform_price_id, price) VALUES (?, ?, ?, ?, ?)", order.ID, sub.ID, selectedPlan.PlatformID, selectedPlan.PlatformPriceID, selectedPlan.Price)

		results = append(results, utils.WhatsappResultItem{
			SubscriptionID: sub.ID,
			PlanName:       selectedPlan.PlatformName,
			Account:        account,
			ExpiresAt:      expiresAt,
			Token:          token,
		})
	}

	// 7) Wallet deductions
	newBalance := wallet.Balance - total
	profitToAdd := 0.0
	if body.RecordProfit {
		profitToAdd = body.ProfitAmount
	}

	tx.Exec("UPDATE wallets SET balance = ?, profit_total = profit_total + ? WHERE id = ?", newBalance, profitToAdd, wallet.ID)

	tx.Exec("INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'purchase', ?, ?, 'order', ?, ?)", wallet.ID, -total, newBalance, order.ID, "Orden "+orderCode)

	if profitToAdd > 0 {
		tx.Exec("INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, note) VALUES (?, 'profit', ?, ?, 'order', ?, ?)", wallet.ID, profitToAdd, newBalance, order.ID, "Ganancia registrada en orden "+orderCode)
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"message": "Transaction Commit failed"})
	}

	baseUrl := "http://localhost:3000" // Configure via envs
	waMessage := utils.BuildWhatsappMessage(orderCode, results, baseUrl)

	// Fetch final wallet
	var finalWallet models.Wallet
	config.DB.First(&finalWallet, wallet.ID)

	return c.JSON(fiber.Map{
		"ok":              true,
		"orderId":         order.ID,
		"orderCode":       orderCode,
		"count":           len(results),
		"subscriptionIds": []int{},
		"message":         waMessage,
		"total":           total,
		"currency":        firstCurrency,
		"wallet": fiber.Map{
			"balance":      finalWallet.Balance,
			"profit_total": finalWallet.ProfitTotal,
			"currency":     finalWallet.Currency,
		},
	})
}

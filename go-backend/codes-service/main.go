package main

import (
	"crypto/subtle"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"

	"pagv2strbx-codes/config"
	"pagv2strbx-codes/handlers"
)

func isProduction() bool {
	return os.Getenv("GO_ENV") == "production"
}

func requireInternalToken(c *fiber.Ctx) error {
	expected := os.Getenv("INTERNAL_SERVICE_TOKEN")
	if expected == "" && !isProduction() {
		return c.Next()
	}
	if expected == "" {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"ok": false, "message": "Servicio no configurado."})
	}
	received := c.Get("X-Internal-Service-Token")
	if subtle.ConstantTimeCompare([]byte(received), []byte(expected)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"ok": false, "message": "No autorizado."})
	}
	return c.Next()
}

func listenAddress(defaultPort string) string {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	bind := os.Getenv("GO_SERVICE_BIND_ADDR")
	if bind == "" {
		bind = "127.0.0.1"
	}
	return bind + ":" + port
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found in codes-service, using system vars")
	}

	if isProduction() && os.Getenv("INTERNAL_SERVICE_TOKEN") == "" {
		log.Fatal("INTERNAL_SERVICE_TOKEN is required in production")
	}

	config.ConnectDB()

	app := fiber.New(fiber.Config{
		AppName: "pagv2strbx Codes Microservice",
	})
	app.Use(logger.New())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "Codes Service OK"})
	})

	api := app.Group("/api")
	api.Use(requireInternalToken)

	// Límite secundario de 500 por hora
	codesLimiter := limiter.New(limiter.Config{
		Max:        500,
		Expiration: 1 * time.Hour,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"ok":      false,
				"message": "Límite excedido (500/hr).",
			})
		},
	})

	api.Get("/codes/_ping", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"ok": true, "mounted": true})
	})

	api.Post("/codes/request", codesLimiter, handlers.RequestCodeHandler)

	api.Get("/platforms", func(c *fiber.Ctx) error {
		// TODO: Implement Platforms retrieval
		return c.JSON(fiber.Map{"ok": true, "data": []string{}})
	})

	addr := listenAddress("8001")
	log.Printf("Starting Codes Service on %s", addr)
	log.Fatal(app.Listen(addr))
}

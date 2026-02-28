package main

import (
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

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found in codes-service, using system vars")
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

	port := os.Getenv("PORT")
	if port == "" {
		port = "8001"
	}

	log.Printf("Starting Codes Service on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

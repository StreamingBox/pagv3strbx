package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"

	"pagv2strbx-store/config"
	"pagv2strbx-store/handlers"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found in store-service, using system vars")
	}

	config.ConnectDB()

	app := fiber.New(fiber.Config{
		AppName: "pagv2strbx Store Microservice",
	})
	app.Use(logger.New())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "Store Service OK"})
	})

	api := app.Group("/api")

	api.Post("/checkout", handlers.CheckoutHandler)

	api.Get("/catalog", func(c *fiber.Ctx) error {
		// TODO: Implement Catalog retrieval
		return c.JSON(fiber.Map{"ok": true, "data": []string{}})
	})

	api.Get("/orders", func(c *fiber.Ctx) error {
		// TODO: Orders history
		return c.JSON(fiber.Map{"ok": true, "data": []string{}})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8002" // Different port for store
	}

	log.Printf("Starting Store Service on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

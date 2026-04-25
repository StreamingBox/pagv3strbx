package main

import (
	"crypto/subtle"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/joho/godotenv"

	"pagv2strbx-store/config"
	"pagv2strbx-store/handlers"
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
		log.Println("No .env file found in store-service, using system vars")
	}

	if isProduction() && os.Getenv("INTERNAL_SERVICE_TOKEN") == "" {
		log.Fatal("INTERNAL_SERVICE_TOKEN is required in production")
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
	api.Use(requireInternalToken)

	api.Post("/checkout", handlers.CheckoutHandler)

	api.Get("/catalog", func(c *fiber.Ctx) error {
		// TODO: Implement Catalog retrieval
		return c.JSON(fiber.Map{"ok": true, "data": []string{}})
	})

	api.Get("/orders", func(c *fiber.Ctx) error {
		// TODO: Orders history
		return c.JSON(fiber.Map{"ok": true, "data": []string{}})
	})

	addr := listenAddress("8002")
	log.Printf("Starting Store Service on %s", addr)
	log.Fatal(app.Listen(addr))
}

package main

import (
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/proxy"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found in api-gateway, using system environment variables")
	}

	app := fiber.New(fiber.Config{
		AppName: "pagv2strbx API Gateway",
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "https://strbx.com.co, https://www.strbx.com.co",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowCredentials: true,
	}))

	// Local development origins (only if not in production or for local testing)
	if os.Getenv("GO_ENV") != "production" {
		app.Use(cors.New(cors.Config{
			AllowOrigins:     "http://localhost:5173, http://127.0.0.1:5173, http://localhost:54549, http://localhost:5174",
			AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
			AllowCredentials: true,
		}))
	}

	// Microservices URLs
	codesServiceURL := os.Getenv("CODES_SERVICE_URL")
	if codesServiceURL == "" {
		codesServiceURL = "http://localhost:8001"
	}

	storeServiceURL := os.Getenv("STORE_SERVICE_URL")
	if storeServiceURL == "" {
		storeServiceURL = "http://localhost:8002"
	}

	// Gateway Routes
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "Gateway OK"})
	})

	// NOTE: /api/upload/platform-logo is handled by Node.js backend (admin.upload.js)
	// which has requireAuth + requireRole("admin") + multer validation.
	// The fallback proxy below will forward it correctly.

	api := app.Group("/api")

	// Add CORS for the API group if needed, but it's already global

	// Codes Service Routing desactivado temporalmente para usar backend Node:
	// api.All("/codes/*", apiCodesLimiter, func(c *fiber.Ctx) error { ... })

	// Fallback for all other /api/* routes -> forward to Node Backend (Port 3000)
	api.All("/*", func(c *fiber.Ctx) error {
		targetUrl := "http://localhost:3000/api/" + c.Params("*")
		// Forward query params too
		queryString := string(c.Request().URI().QueryString())
		if queryString != "" {
			targetUrl += "?" + queryString
		}
		log.Printf("[Gateway] Proxying unhandled route to Node: %s", targetUrl)
		if err := proxy.Do(c, targetUrl); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Backend service unreachable"})
		}
		// Strip internal headers
		c.Response().Header.Del(fiber.HeaderServer)
		c.Response().Header.Del("X-Powered-By")
		return nil
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("Starting API Gateway on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

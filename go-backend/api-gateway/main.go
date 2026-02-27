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
		AllowOrigins:     "https://strbx.com.co, https://www.strbx.com.co, http://localhost:5173, http://127.0.0.1:5173, http://localhost:54549",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowCredentials: true,
	}))

	// Microservices URLs
	codesServiceURL := os.Getenv("CODES_SERVICE_URL")
	if codesServiceURL == "" {
		codesServiceURL = "http://localhost:8001"
	}

	// Gateway Routes
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "Gateway OK"})
	})

	// -----------------------------------------------------
	// Route Proxies: Forward requests to internal microservices
	// -----------------------------------------------------

	// Explicit Endpoint to upload platform logos (bound to root to avoid group conflicts)
	app.Post("/api/upload/platform-logo", func(c *fiber.Ctx) error {
		form, err := c.MultipartForm()
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to parse form"})
		}
		slugs := form.Value["slug"]
		if len(slugs) == 0 || slugs[0] == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing platform slug"})
		}
		slug := slugs[0]

		files := form.File["logo"]
		if len(files) == 0 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing logo file"})
		}
		file := files[0]

		saveDir := "../../frontend/public/platform-logos"
		os.MkdirAll(saveDir, 0755)
		filename := slug + ".png"
		savePath := saveDir + "/" + filename

		if err := c.SaveFile(file, savePath); err != nil {
			log.Printf("Failed to save logo for %s: %v", slug, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
		}
		return c.JSON(fiber.Map{"ok": true, "message": "Logo uploaded successfully", "filename": filename})
	})

	app.Get("/api/upload/test", func(c *fiber.Ctx) error {
		return c.SendString("Upload route is active")
	})

	api := app.Group("/api")

	// Add CORS for the API group if needed, but it's already global

	// Codes Service Routing
	api.All("/codes/*", func(c *fiber.Ctx) error {
		// Forward anything going to /api/codes to Codes Service
		targetUrl := codesServiceURL + "/api/codes/" + c.Params("*")
		if err := proxy.Do(c, targetUrl); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Codes service unreachable"})
		}
		// Remove proxy headers if necessary
		c.Response().Header.Del(fiber.HeaderServer)
		return nil
	})

	api.All("/platforms/*", func(c *fiber.Ctx) error {
		targetUrl := codesServiceURL + "/api/platforms/" + c.Params("*")
		return proxy.Do(c, targetUrl)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("Starting API Gateway on port %s", port)
	log.Fatal(app.Listen(":" + port))
}

package main

import (
	"log"
	"net/http"

	"easy-k8s-yaml/handlers"
)

func main() {
	// Static files (index.html, style.css, app.js)
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// API endpoints
	http.HandleFunc("/api/secret", handlers.HandleSecret)
	http.HandleFunc("/api/configmap", handlers.HandleConfigMap)
	http.HandleFunc("/api/service", handlers.HandleService)
	http.HandleFunc("/api/deployment", handlers.HandleDeployment)

	addr := ":8080"
	log.Printf("🚀 Server started at http://localhost%s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

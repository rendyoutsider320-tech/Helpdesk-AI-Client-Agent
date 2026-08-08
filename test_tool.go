package main

import (
	"context"
	"fmt"
	"github.com/helpdesk-ai/core/internal/tools"
)

func main() {
	registry := tools.NewRegistry()
	registry.Register(&tools.PingTool{})
	registry.Register(&tools.DNSLookupTool{})

	// Test 1: input with root key
	input1 := map[string]interface{}{
		"host": "cos.sams.id",
	}
	res1, err := registry.GetTool("ping").Execute(context.Background(), input1)
	fmt.Printf("Ping Direct: res=%v, err=%v\n", res1, err)

	// Test 2: input with nested key, simulating handleExecuteTool flattening
	input2 := map[string]interface{}{
		"args": map[string]interface{}{
			"host": "cos.sams.id",
		},
	}
	if args, ok := input2["args"].(map[string]interface{}); ok {
		for k, v := range args {
			input2[k] = v
		}
	}
	res2, err := registry.GetTool("ping").Execute(context.Background(), input2)
	fmt.Printf("Ping Flattened: res=%v, err=%v\n", res2, err)
}

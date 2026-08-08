package cmdb

import (
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/helpdesk-ai/core/internal/db"
)

// Relationship nodes structure for frontend visual graph
type Node struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Type  string `json:"type"` // server, database, website, network, user
}

type Link struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"` // depends_on, runs_on, connects_to
}

type CMDBTopology struct {
	Nodes []Node `json:"nodes"`
	Links []Link `json:"links"`
}

// CreateRelationship adds a CI dependency relationship
func CreateRelationship(source, target, relType, direction string) (*db.CMDBRelationship, error) {
	rel := &db.CMDBRelationship{
		ID:               uuid.New().String(),
		SourceItemID:     source,
		TargetItemID:     target,
		RelationshipType: relType,
		ImpactDirection:  direction,
		CreatedAt:        time.Now(),
	}

	if err := db.DB.Create(rel).Error; err != nil {
		log.Printf("Error creating CMDB relationship: %v", err)
		return nil, err
	}

	return rel, nil
}

// GetTopology compiles the complete active CI mapping topology
func GetTopology() (CMDBTopology, error) {
	var topology CMDBTopology
	topology.Nodes = []Node{}
	topology.Links = []Link{}

	// 1. Fetch CMDB Relationships
	var rels []db.CMDBRelationship
	if err := db.DB.Find(&rels).Error; err != nil {
		return topology, err
	}

	// Track added node IDs to prevent duplicates
	nodeSet := make(map[string]bool)

	addNodeIfNew := func(id string, nodeType string, label string) {
		if !nodeSet[id] {
			nodeSet[id] = true
			topology.Nodes = append(topology.Nodes, Node{
				ID:    id,
				Label: label,
				Type:  nodeType,
			})
		}
	}

	// 2. Fetch Assets & Devices to populate nodes metadata
	var assets []db.Asset
	db.DB.Find(&assets)
	assetMap := make(map[string]db.Asset)
	for _, asset := range assets {
		assetMap[asset.ID.String()] = asset
	}

	var devices []db.Device
	db.DB.Find(&devices)
	deviceMap := make(map[string]db.Device)
	for _, dev := range devices {
		deviceMap[dev.ID] = dev
	}

	var monitors []db.WebsiteMonitor
	db.DB.Find(&monitors)
	monitorMap := make(map[string]db.WebsiteMonitor)
	for _, m := range monitors {
		monitorMap[m.ID] = m
	}

	// Populate Nodes and Links
	for _, r := range rels {
		// Identify source CI node details
		sourceLabel := r.SourceItemID
		sourceType := "unknown"
		if a, ok := assetMap[r.SourceItemID]; ok {
			sourceLabel = a.Hostname
			sourceType = "server"
		} else if d, ok := deviceMap[r.SourceItemID]; ok {
			sourceLabel = d.DeviceName
			sourceType = "network"
		} else if m, ok := monitorMap[r.SourceItemID]; ok {
			sourceLabel = m.Name
			sourceType = "website"
		}
		addNodeIfNew(r.SourceItemID, sourceType, sourceLabel)

		// Identify target CI node details
		targetLabel := r.TargetItemID
		targetType := "unknown"
		if a, ok := assetMap[r.TargetItemID]; ok {
			targetLabel = a.Hostname
			targetType = "server"
		} else if d, ok := deviceMap[r.TargetItemID]; ok {
			targetLabel = d.DeviceName
			targetType = "network"
		} else if m, ok := monitorMap[r.TargetItemID]; ok {
			targetLabel = m.Name
			targetType = "website"
		}
		addNodeIfNew(r.TargetItemID, targetType, targetLabel)

		// Add Link
		topology.Links = append(topology.Links, Link{
			Source: r.SourceItemID,
			Target: r.TargetItemID,
			Type:   r.RelationshipType,
		})
	}

	// Fallback seed: if topology is empty, auto-generate default mapping using existing assets/monitors
	if len(topology.Links) == 0 && len(assets) > 0 {
		log.Println("Seeding default CMDB relationships...")
		var monitorID string
		if len(monitors) > 0 {
			monitorID = monitors[0].ID
		} else {
			// Create dummy monitor UUID
			monitorID = uuid.New().String()
		}

		assetID1 := assets[0].ID.String()
		
		// Seed: Website -> Server
		_, _ = CreateRelationship(monitorID, assetID1, "runs_on", "downstream")
		
		if len(assets) > 1 {
			assetID2 := assets[1].ID.String()
			// Seed: Server -> Database Server
			_, _ = CreateRelationship(assetID1, assetID2, "depends_on", "downstream")
		}

		// Re-fetch
		return GetTopology()
	}

	return topology, nil
}

type ImpactedCI struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	ImpactLevel int    `json:"impact_level"`
}

// ResolveImpactChain recursively traces downstream impacted service nodes when a source CI fails
func ResolveImpactChain(failedCIID string) ([]ImpactedCI, error) {
	var results []ImpactedCI

	query := `
		WITH RECURSIVE impact_chain AS (
			SELECT target_item_id AS item_id, 1 AS level
			FROM cmdb_relationships
			WHERE source_item_id = ? AND impact_direction IN ('downstream', 'bidirectional')
			UNION
			SELECT r.target_item_id, ic.level + 1
			FROM cmdb_relationships r
			INNER JOIN impact_chain ic ON r.source_item_id = ic.item_id
			WHERE r.impact_direction IN ('downstream', 'bidirectional')
		)
		SELECT DISTINCT item_id, level FROM impact_chain ORDER BY level ASC;
	`

	rows, err := db.DB.Raw(query, failedCIID).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Prefetch maps for quick labeling lookup
	var assets []db.Asset
	db.DB.Find(&assets)
	assetMap := make(map[string]db.Asset)
	for _, asset := range assets {
		assetMap[asset.ID.String()] = asset
	}

	var devices []db.Device
	db.DB.Find(&devices)
	deviceMap := make(map[string]db.Device)
	for _, dev := range devices {
		deviceMap[dev.ID] = dev
	}

	var monitors []db.WebsiteMonitor
	db.DB.Find(&monitors)
	monitorMap := make(map[string]db.WebsiteMonitor)
	for _, m := range monitors {
		monitorMap[m.ID] = m
	}

	for rows.Next() {
		var itemID string
		var level int
		if err := rows.Scan(&itemID, &level); err == nil {
			nodeName := itemID
			nodeType := "unknown"

			if a, ok := assetMap[itemID]; ok {
				nodeName = a.Hostname
				nodeType = "server"
			} else if d, ok := deviceMap[itemID]; ok {
				nodeName = d.DeviceName
				nodeType = "network"
			} else if m, ok := monitorMap[itemID]; ok {
				nodeName = m.Name
				nodeType = "website"
			}

			results = append(results, ImpactedCI{
				ID:          itemID,
				Name:        nodeName,
				Type:        nodeType,
				ImpactLevel: level,
			})
		}
	}

	return results, nil
}

# SQL Queries for Database Verification

## Verify All Users Created

```sql
SELECT 
  id,
  name,
  username,
  email,
  role,
  status,
  created_at
FROM users 
ORDER BY created_at;
```

## Verify Technician Presence Status

```sql
SELECT 
  u.id,
  u.name,
  u.username,
  tp.status,
  tp.last_heartbeat,
  tp.current_ticket_id
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
ORDER BY u.name;
```

## Check Technician by Status

### Online Technicians
```sql
SELECT u.name, u.username, tp.status
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
WHERE tp.status = 'online';
```

### Offline Technicians
```sql
SELECT u.name, u.username, tp.status
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
WHERE tp.status = 'offline';
```

### On Ticket (Busy)
```sql
SELECT u.name, u.username, tp.status, tp.current_ticket_id
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
WHERE tp.status IN ('on_ticket', 'busy');
```

### On Break
```sql
SELECT u.name, u.username, tp.status
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
WHERE tp.status = 'on_break';
```

## Update Technician Status (Manual)

```sql
UPDATE technician_presence
SET status = 'online', last_heartbeat = NOW()
WHERE technician_id = (SELECT id FROM users WHERE username = 'rendy.m');
```

## List All Roles Distribution

```sql
SELECT 
  role,
  COUNT(*) as count,
  array_agg(username) as usernames
FROM users
WHERE deleted_at IS NULL
GROUP BY role;
```

## Check Last Heartbeat (Last Activity)

```sql
SELECT 
  u.username,
  u.name,
  tp.status,
  tp.last_heartbeat,
  NOW() - tp.last_heartbeat as time_since_heartbeat
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
ORDER BY tp.last_heartbeat DESC;
```

## Count Users by Role

```sql
SELECT 
  role,
  COUNT(*) as total
FROM users
WHERE deleted_at IS NULL
GROUP BY role;
```

## Find User by Username

```sql
SELECT * FROM users WHERE username = 'rendy.m';
```

## Find User by Email

```sql
SELECT * FROM users WHERE email = 'rendy@helpdesk.local';
```

## Get Admin User

```sql
SELECT * FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1;
```

## All Technicians

```sql
SELECT 
  id,
  name,
  username,
  email,
  status
FROM users
WHERE role = 'technician' AND deleted_at IS NULL
ORDER BY name;
```

## Export User List (CSV format)

```sql
COPY (
  SELECT 
    name,
    username,
    email,
    role,
    status,
    created_at
  FROM users
  WHERE deleted_at IS NULL
  ORDER BY role, name
) TO STDOUT WITH CSV HEADER;
```

## Check if Seed Data Exists

```sql
SELECT 
  'Users' as entity,
  COUNT(*) as count
FROM users
UNION ALL
SELECT 
  'Technician Presence',
  COUNT(*)
FROM technician_presence
UNION ALL
SELECT 
  'Devices',
  COUNT(*)
FROM devices
UNION ALL
SELECT 
  'Alerts',
  COUNT(*)
FROM alerts;
```

## Reset a Technician Status

```sql
UPDATE technician_presence
SET status = 'online', 
    last_heartbeat = NOW(),
    current_ticket_id = NULL
WHERE technician_id = (SELECT id FROM users WHERE username = 'alif.f');
```

## Soft Delete User (Archive without removal)

```sql
UPDATE users
SET deleted_at = NOW()
WHERE username = 'user.local';
```

## Restore Soft Deleted User

```sql
UPDATE users
SET deleted_at = NULL
WHERE username = 'user.local' AND deleted_at IS NOT NULL;
```

## Get Active Users Count

```sql
SELECT COUNT(*) as active_users FROM users WHERE deleted_at IS NULL;
```

## Monitor WebSocket Presence

```sql
-- Real-time view for WebSocket connections
SELECT 
  u.id as user_id,
  u.username,
  u.name,
  u.role,
  tp.status as current_status,
  tp.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - tp.last_heartbeat)) as seconds_since_heartbeat
FROM technician_presence tp
INNER JOIN users u ON tp.technician_id = u.id
ORDER BY tp.last_heartbeat DESC;
```

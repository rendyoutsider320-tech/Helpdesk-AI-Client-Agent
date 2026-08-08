# Authentication Fix - Quick Start & Testing

## Quick Start After Fix

### 1. Rebuild Frontend with New Files
```bash
cd helpdesk-ai/frontend

# Clean and reinstall dependencies
npm ci

# Build
npm run build

# Or for development with watch
npm run dev
```

### 2. Start Docker Compose Stack
```bash
cd helpdesk-ai
docker-compose up -d
```

### 3. Access the Application
- Frontend: http://localhost:3000 (or http://localhost:3001 if port 3000 occupied)
- API: http://localhost:8088 (via docker-compose)
- Grafana: http://localhost:3010
- Prometheus: http://localhost:9090

## Manual Testing Steps

### Test 1: Login Flow
1. Open http://localhost:3000 in browser
2. Open DevTools (F12) → Application tab
3. Go to Cookies and LocalStorage - should be empty
4. **Default credentials** (check your backend seeded data):
   - Username: `admin` or `test_admin`
   - Password: (check database or backend setup)
5. Enter credentials and click Login
6. **Expected**:
   - ✅ Redirected to /dashboard/admin (if admin role)
   - ✅ Cookie `access_token` appears in DevTools → Cookies
   - ✅ LocalStorage has `access_token`, `refresh_token`, `user`
   - ✅ No console errors
   - ✅ Dashboard data loads (stats, tickets, etc.)

### Test 2: Page Refresh (Session Persistence)
1. After successful login and dashboard loads
2. Press F5 (or Ctrl+R) to reload page
3. **Expected**:
   - ✅ Dashboard remains visible
   - ✅ User info persists
   - ✅ Data reloads from API
   - ✅ No redirect to login page
   - ✅ Check console - may see Auth loading but completes quickly

### Test 3: Logout
1. On dashboard, click user menu (top right)
2. Click "Logout" button
3. **Expected**:
   - ✅ Redirected to login page
   - ✅ Cookie `access_token` is deleted/cleared
   - ✅ LocalStorage is cleared (all auth items removed)
   - ✅ Try accessing /dashboard/admin directly → redirects to login

### Test 4: Protected Route Access (Middleware)
1. After logout, clear all auth data (optional - middleware should handle)
2. Manually access http://localhost:3000/dashboard/admin
3. **Expected**:
   - ✅ Middleware intercepts → redirects to http://localhost:3000
   - ✅ No flash of dashboard before redirect
   - ✅ Land on login page

### Test 5: Invalid Credentials
1. On login page, enter wrong username/password
2. Click Login
3. **Expected**:
   - ✅ Error message appears: "Invalid credentials"
   - ✅ Stay on login page
   - ✅ No tokens created in localStorage/cookies

### Test 6: Role-Based Access Control
1. Login as admin user
2. Access http://localhost:3000/dashboard/admin
3. **Expected**: ✅ Access allowed, dashboard visible
4. Try accessing with technician credentials
5. Access http://localhost:3000/dashboard/admin (while logged in as technician)
6. **Expected**: ✅ Redirect to /dashboard/technician or /dashboard/user

### Test 7: API Authorization Header
1. Login successfully
2. Open DevTools → Network tab
3. Make any action that triggers an API call (e.g., search tickets, load data)
4. Click on the API request in Network tab
5. Go to "Headers" section
6. **Expected**:
   - ✅ Request Headers include: `Authorization: Bearer {token}`
   - ✅ Response is 200 (success), not 401

### Test 8: Token Refresh (if token expires)
**Note**: This requires backend token expiry configuration
1. Login successfully
2. Wait for token to expire (or configure short expiry in backend)
3. Make an API call (click something that fetches data)
4. **Expected**:
   - ✅ API returns 401 (unauthorized)
   - ✅ Frontend interceptor catches it
   - ✅ Automatically calls refresh-token endpoint
   - ✅ Gets new token
   - ✅ Original request retried with new token
   - ✅ Data loads successfully
   - ✅ No page redirect
   - ✅ Check DevTools → Application → Cookies: new token value

### Test 9: Failed Token Refresh
**Note**: This tests what happens when refresh token is also expired
1. Somehow invalidate the refresh token (backend admin delete or set expire)
2. Perform action on dashboard that requires token
3. **Expected**:
   - ✅ API returns 401
   - ✅ Frontend tries refresh-token endpoint
   - ✅ Refresh fails (401 or error)
   - ✅ Auto-logout triggered
   - ✅ Redirected to login page
   - ✅ Clear message about session expiration

## Debugging Tips

### Check if middleware is working
```bash
# In browser console
1. Delete all cookies for localhost
2. Try to access /dashboard/admin
3. Should redirect before page renders
4. Check DevTools → Application → Cookies: should still be empty
```

### Check auth store state
```javascript
// Open browser console and run:
import { useAuthStore } from '@/store'
useAuthStore.getState()

// Output should show:
// {
//   user: {id, username, email, role},
//   accessToken: "eyJ...",
//   isAuthenticated: true,
//   ...
// }
```

### Monitor API calls
1. DevTools → Network tab
2. Filter by `Fetch/XHR`
3. Look for `/api/auth/login` calls
4. Check response payload has `access_token`, `refresh_token`, `user`

### Common Console Errors to Check For

| Error | Likely Cause | Fix |
|-------|------------|-----|
| `Cannot read property 'push' of undefined` | Router not imported | Check login page imports `useRouter` from `next/navigation` |
| `401 Unauthorized` on all API calls | Token not sent in header | Check API interceptor adds Bearer token |
| `Auth store is undefined` | Zustand store import issue | Verify `useAuthStore` imported correctly |
| `CORS error: credentials` | Backend CORS not configured | Add `credentials: 'include'` to backend CORS |
| `Cookie not saving` | HTTPS required for secure flag | Use `samesite=lax` instead in development |

## Expected File Structure After Fix

```
frontend/
├── src/
│   ├── middleware.ts          [NEW] Route protection
│   ├── app/
│   │   ├── page.tsx           [UPDATED] Login with auth fix
│   │   └── dashboard/
│   │       ├── admin/page.tsx   [UPDATED] With auth guard
│   │       ├── technician/page.tsx [UPDATED] With auth guard
│   │       └── user/page.tsx     [UPDATED] With auth guard
│   ├── components/
│   │   ├── AuthProvider.tsx   [UPDATED] With hydration state
│   │   └── Header.tsx         [UPDATED] Better logout
│   ├── lib/
│   │   └── api.ts             [UPDATED] Better interceptors
│   └── store/
│       └── index.ts           [UNCHANGED] Already correct
```

## Next Steps if Tests Fail

1. **Check Backend Logs**
   ```bash
   docker-compose logs api
   # Look for auth endpoint errors
   ```

2. **Verify Backend is Running**
   ```bash
   curl http://localhost:8088/health
   # Should return 200 with health status
   ```

3. **Check API Endpoint**
   ```bash
   curl -X POST http://localhost:8088/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"password"}'
   # Should return { access_token, refresh_token, user }
   ```

4. **Check Frontend Console**
   - Open DevTools → Console tab
   - Look for errors when login/page loads
   - Search for "401" or "auth" errors

5. **Reset Everything and Start Fresh**
   ```bash
   # Clear browser storage
   1. DevTools → Application → Clear site data
   2. Or: Settings → Privacy → Clear browsing data
   
   # Rebuild frontend
   cd frontend
   rm -rf .next node_modules
   npm ci
   npm run dev
   
   # Restart backend
   docker-compose restart api
   ```

## Production Deployment Checklist

- [ ] HTTPS enabled for all domains
- [ ] Backend CORS configured to allow frontend domain
- [ ] Backend `/api/v1/auth/refresh-token` endpoint working
- [ ] Token expiry set appropriately (e.g., 1 hour access, 7 days refresh)
- [ ] Database/Redis configured to store refresh tokens
- [ ] Error handling for expired tokens configured
- [ ] Logging enabled for auth failures
- [ ] Rate limiting on login endpoint
- [ ] Session management (max active sessions, etc.) configured if needed

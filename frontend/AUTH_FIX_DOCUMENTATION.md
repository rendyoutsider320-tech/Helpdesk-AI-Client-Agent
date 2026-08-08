# Frontend Authentication Flow Fix

## Problem Summary
Users were experiencing a login redirect loop where:
1. Login was successful and dashboard briefly appeared
2. Page then redirected back to login page
3. Session was not persisting across page reloads

**Root Cause**: Race condition between component rendering and token loading from localStorage

## Solution Implemented

### 1. **Middleware Protection** (`src/middleware.ts`)
- New Next.js middleware to protect dashboard routes
- Checks for `access_token` cookie before allowing access to protected routes
- Redirects unauthenticated users back to login page
- Prevents unauthorized access at the edge

### 2. **Improved Login Flow** (`src/app/page.tsx`)
- Changed from `window.location.href` to `router.push()` for proper client-side navigation
- Saves token to both localStorage AND cookies (for middleware detection)
- Updates Zustand store immediately after login
- Provides faster, more responsive redirect

### 3. **Enhanced Auth Store Hydration** (`src/components/AuthProvider.tsx`)
- Added `isHydrated` state to track when auth is loaded from localStorage
- Ensures auth state is restored before rendering protected components
- Prevents hydration mismatch between server and client

### 4. **Protected Route Guards** (Dashboard Pages)
- Added auth checks in `/dashboard/admin`, `/dashboard/technician`, `/dashboard/user`
- Routes verify both `accessToken` and `user` before rendering
- Automatically redirect to login if tokens missing or role invalid
- Only fetch data after authentication verified

### 5. **Improved Logout** (`src/components/Header.tsx`)
- Clears both localStorage AND cookies
- Updates Zustand store
- Ensures complete session cleanup

### 6. **Better Token Refresh** (`src/lib/api.ts`)
- Enhanced API interceptors for 401 responses
- Updates both localStorage and cookies on token refresh
- Syncs Zustand store when token refreshed
- Complete logout on refresh failure with redirect to login

### 7. **Cookie Support** 
- Tokens now stored in cookies (in addition to localStorage)
- Middleware can detect authentication without JS execution
- More secure with SameSite=Lax policy

## Token Flow Diagram

```
Login Page
    ↓
(submit credentials via /api/auth/login)
    ↓
Backend validates → returns access_token, refresh_token, user
    ↓
Frontend saves to:
  - localStorage (persistence)
  - cookie (middleware detection)
  - Zustand store (React state)
    ↓
router.push() → navigate to dashboard
    ↓
Middleware checks cookie ✓ Allow
    ↓
Dashboard renders
    ↓
Auth guard checks Zustand store ✓ Valid
    ↓
Fetch dashboard data with token in Authorization header
```

## Testing Checklist

- [ ] **Login**
  - [ ] Submit credentials on login page
  - [ ] Redirected to correct dashboard (admin/technician/user based on role)
  - [ ] Check browser DevTools → Application → Cookies: `access_token` present
  - [ ] Check browser DevTools → Application → localStorage: `access_token`, `refresh_token`, `user` present

- [ ] **Session Persistence**
  - [ ] Login successfully
  - [ ] Refresh the page (F5 or Ctrl+R)
  - [ ] Dashboard still visible (not redirected to login)
  - [ ] Check browser console for errors

- [ ] **Logout**
  - [ ] Click logout button in header
  - [ ] Redirected to login page
  - [ ] Check DevTools: cookies and localStorage cleared
  - [ ] Try manually accessing `/dashboard/admin` → should redirect to login

- [ ] **Token Expiration**
  - [ ] Login and make API calls (to populate token)
  - [ ] Wait for token to expire (or manually expire in backend)
  - [ ] Make another API call
  - [ ] Should automatically refresh token and retry request
  - [ ] If refresh fails, should redirect to login

- [ ] **Role-Based Access**
  - [ ] Login as admin → access `/dashboard/admin` ✓
  - [ ] Login as admin → access `/dashboard/technician` → should redirect
  - [ ] Login as technician → access `/dashboard/admin` → should redirect
  - [ ] Login as user → access any dashboard → verify permissions

- [ ] **Protected Routes Middleware**
  - [ ] Delete auth cookie in DevTools
  - [ ] Try to access `/dashboard/admin` → should redirect to login (caught by middleware)
  - [ ] Manually clear localStorage
  - [ ] Try to access `/dashboard/user` → should redirect to login

## Key Files Changed

1. **src/middleware.ts** - NEW: Route protection at the edge
2. **src/app/page.tsx** - Enhanced login with proper token handling
3. **src/components/AuthProvider.tsx** - Added hydration state
4. **src/components/Header.tsx** - Improved logout cleanup
5. **src/lib/api.ts** - Enhanced token refresh and error handling
6. **src/app/dashboard/admin/page.tsx** - Added auth guard
7. **src/app/dashboard/technician/page.tsx** - Added auth guard
8. **src/app/dashboard/user/page.tsx** - Added auth guard

## Environment Variables (No Changes Required)

- `NEXT_PUBLIC_API_URL` - Optional, defaults to `/api` (proxied by Next.js to http://localhost:8088)
- Frontend continues using relative URLs which work with docker-compose and local development

## Deployment Notes

- **Docker Compose**: No changes needed - API rewrites in next.config.js handle the 8088:8090 mapping
- **Production**: Ensure:
  - HTTPS enabled (cookies use `secure` flag)
  - SameSite cookie policy matches your domain setup
  - CORS headers configured on backend to allow cookie credentials
  - Token endpoints accessible at correct paths

## Common Issues & Solutions

### Issue: Still seeing login redirect loop
**Solution**:
1. Check browser DevTools → Network → see if API calls returning 401
2. Check if refresh token is valid and working
3. Verify backend `/api/v1/auth/refresh-token` endpoint exists
4. Check CORS headers allow credentials

### Issue: Cookie not appearing in DevTools
**Solution**:
1. Verify HTTPS in production (cookies with `secure` flag only sent over HTTPS)
2. Check cookie domain and path settings
3. Ensure SameSite policy matches your setup

### Issue: Middleware blocking access incorrectly
**Solution**:
1. Check middleware.ts config and matchers
2. Verify cookie name is exactly `access_token`
3. Check Next.js server logs for middleware errors

### Issue: 401 errors after token refresh
**Solution**:
1. Verify backend refresh token endpoint working
2. Check token claims (exp, iat, etc.) are valid
3. Ensure database/cache still has refresh token record

## Backend Requirements

Ensure backend has these endpoints and behaviors:

1. **POST /api/v1/auth/login**
   - Returns: `{ access_token, refresh_token, user: { id, username, email, role } }`

2. **POST /api/v1/auth/refresh-token**
   - Accepts: `{ refresh_token }`
   - Returns: `{ access_token }`

3. **All protected endpoints**
   - Expect: `Authorization: Bearer {token}` header
   - Return: 401 if token missing/invalid

4. **CORS Configuration**
   - Allow credentials: `credentials: include`
   - Whitelist origin that matches frontend URL

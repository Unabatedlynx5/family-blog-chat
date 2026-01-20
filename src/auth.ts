// Remove the 'import type' and use 'import' instead
// or better yet, just use cloudflare:workers types implicitly or via global scope if configured, 
// but here we are using 'jose'.
import { jwtVerify, JWTPayload } from 'jose';
import { Env } from './types';

export async function verifyToken(request: Request, env: Env): Promise<JWTPayload | null> {
  let token = '';

  // 1. Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check query parameter
  if (!token) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      token = queryToken;
    }
  }

  if (!token) {
    return null;
  }

  if (!env.JWT_SECRET) {
    console.error('JWT_SECRET is not defined in environment variables');
    return null;
  }

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

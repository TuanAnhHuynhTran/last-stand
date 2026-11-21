import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { EnvConfig } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
  type: 'refresh';
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type'>,
  config: EnvConfig,
  expiresInOverride?: SignOptions['expiresIn']
): string {
  const options: SignOptions = {
    expiresIn: (expiresInOverride ?? config.JWT_ACCESS_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, type: 'access' }, config.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
  config: EnvConfig,
  expiresInOverride?: SignOptions['expiresIn']
): string {
  const options: SignOptions = {
    expiresIn: (expiresInOverride ?? config.JWT_REFRESH_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, type: 'refresh' }, config.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string, config: EnvConfig): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access' || !decoded.sub) {
      throw new UnauthorizedError('Access token khong hop le', 'INVALID_TOKEN');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token da het han', 'TOKEN_EXPIRED');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Access token khong hop le', 'INVALID_TOKEN');
  }
}

export function verifyRefreshToken(token: string, config: EnvConfig): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    if (decoded.type !== 'refresh' || !decoded.sub || !decoded.jti || !decoded.familyId) {
      throw new UnauthorizedError('Refresh token khong hop le', 'INVALID_REFRESH_TOKEN');
    }
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token da het han', 'REFRESH_TOKEN_EXPIRED');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Refresh token khong hop le', 'INVALID_REFRESH_TOKEN');
  }
}

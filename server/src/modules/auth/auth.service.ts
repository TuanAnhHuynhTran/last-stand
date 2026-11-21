import crypto from 'node:crypto';
import type {
  AuthMeResponseDTO,
  AuthResponseDTO,
  AuthTokensDTO,
  LoginInput,
  RegisterInput,
} from '@cityverse/shared';
import type { Transaction } from 'sequelize';
import type { EnvConfig } from '../../config/env.js';
import { ensureAdminAccount } from '../../database/ensureAdminAccount.js';
import type { DatabaseModels } from '../../database/models/index.js';
import type { User } from '../../database/models/User.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../utils/errors.js';
import {
  hashToken,
  parseDurationToMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { toCharacterDTO, toCityDTO, toUserDTO } from '../../utils/mappers.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  constructor(
    private readonly models: DatabaseModels,
    private readonly config: EnvConfig
  ) {}

  private async buildUserProfile(user: User, transaction?: Transaction): Promise<AuthMeResponseDTO> {
    const [character, city] = await Promise.all([
      this.models.Character.findOne({ where: { userId: user.id }, transaction }),
      this.models.City.findOne({ where: { ownerId: user.id }, transaction }),
    ]);

    let cityDTO = null;
    if (city) {
      const economy = await this.models.CityEconomy.findOne({
        where: { cityId: city.id },
        transaction,
      });
      if (economy) {
        cityDTO = toCityDTO(city, economy, 'owner');
      }
    }

    return {
      user: toUserDTO(user),
      character: character ? toCharacterDTO(character) : null,
      city: cityDTO,
    };
  }

  private async issueTokenPair(
    user: User,
    familyId: string,
    meta: SessionMeta,
    transaction: Transaction
  ): Promise<{ tokens: AuthTokensDTO; tokenRecordId: string }> {
    const tokenId = crypto.randomUUID();
    const accessToken = signAccessToken(
      { sub: user.id, email: user.email, username: user.username },
      this.config
    );
    const refreshToken = signRefreshToken(
      { sub: user.id, jti: tokenId, familyId },
      this.config
    );
    const expiresAt = new Date(Date.now() + parseDurationToMs(this.config.JWT_REFRESH_EXPIRES_IN));

    await this.models.RefreshToken.create(
      {
        id: tokenId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      },
      { transaction }
    );

    return {
      tokenRecordId: tokenId,
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresIn: this.config.JWT_ACCESS_EXPIRES_IN,
      },
    };
  }

  async register(input: RegisterInput, meta: SessionMeta): Promise<AuthResponseDTO> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim();

    const [existingEmail, existingUsername] = await Promise.all([
      this.models.User.findOne({ where: { email: normalizedEmail } }),
      this.models.User.findOne({ where: { username: normalizedUsername } }),
    ]);

    if (existingEmail) {
      throw new ConflictError('Email nay da duoc dang ky', 'EMAIL_ALREADY_EXISTS');
    }
    if (existingUsername) {
      throw new ConflictError('Ten tai khoan nay da duoc su dung', 'USERNAME_ALREADY_EXISTS');
    }

    const passwordHash = await hashPassword(input.password, this.config.BCRYPT_SALT_ROUNDS);

    return this.models.sequelize.transaction(async (transaction) => {
      const user = await this.models.User.create(
        {
          email: normalizedEmail,
          username: normalizedUsername,
          passwordHash,
          status: 'active',
        },
        { transaction }
      );

      const familyId = crypto.randomUUID();
      const { tokens } = await this.issueTokenPair(user, familyId, meta, transaction);

      return {
        user: toUserDTO(user),
        character: null,
        city: null,
        tokens,
      };
    });
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<AuthResponseDTO> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.models.User.findOne({ where: { email: normalizedEmail } });

    if (!user) {
      throw new UnauthorizedError('Email hoac mat khau khong dung', 'INVALID_CREDENTIALS');
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Email hoac mat khau khong dung', 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'active') {
      throw new ForbiddenError('Tai khoan da bi tam khoa', 'ACCOUNT_SUSPENDED');
    }

    return this.models.sequelize.transaction(async (transaction) => {
      const familyId = crypto.randomUUID();
      const { tokens } = await this.issueTokenPair(user, familyId, meta, transaction);
      const profile = await this.buildUserProfile(user, transaction);

      return {
        ...profile,
        tokens,
      };
    });
  }

  async refresh(rawRefreshToken: string, meta: SessionMeta): Promise<AuthResponseDTO> {
    const payload = verifyRefreshToken(rawRefreshToken, this.config);
    const tokenHash = hashToken(rawRefreshToken);

    const existingToken = await this.models.RefreshToken.findOne({
      where: { tokenHash },
    });

    if (!existingToken) {
      throw new UnauthorizedError('Refresh token khong ton tai', 'INVALID_REFRESH_TOKEN');
    }

    // Reuse detection: if an already-revoked token is replayed, revoke the entire token family.
    if (existingToken.revokedAt !== null) {
      await this.models.RefreshToken.update(
        { revokedAt: new Date() },
        { where: { familyId: existingToken.familyId, revokedAt: null } }
      );
      throw new UnauthorizedError(
        'Refresh token da bi thu hoi. Vui long dang nhap lai.',
        'REFRESH_TOKEN_REUSED'
      );
    }

    if (existingToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Refresh token da het han', 'REFRESH_TOKEN_EXPIRED');
    }

    const user = await this.models.User.findByPk(payload.sub);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Tai khoan khong hop le', 'UNAUTHORIZED');
    }

    return this.models.sequelize.transaction(async (transaction) => {
      const { tokens, tokenRecordId } = await this.issueTokenPair(
        user,
        existingToken.familyId,
        meta,
        transaction
      );

      await existingToken.update(
        {
          revokedAt: new Date(),
          replacedByTokenId: tokenRecordId,
        },
        { transaction }
      );

      const profile = await this.buildUserProfile(user, transaction);
      return {
        ...profile,
        tokens,
      };
    });
  }

  async logout(userId: string, rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await this.models.RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId, tokenHash, revokedAt: null } }
      );
      return;
    }

    await this.models.RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId, revokedAt: null } }
    );
  }

  async getMe(userId: string): Promise<AuthMeResponseDTO> {
    const user = await this.models.User.findByPk(userId);
    if (!user) {
      throw new UnauthorizedError('Tai khoan khong ton tai', 'USER_NOT_FOUND');
    }
    return this.buildUserProfile(user);
  }

  async devAdminLogin(meta: SessionMeta): Promise<AuthResponseDTO> {
    if (this.config.NODE_ENV === 'production' || !this.config.DEV_AUTO_ADMIN) {
      throw new ForbiddenError('Che do vao nhanh admin khong kha dung', 'DEV_ADMIN_DISABLED');
    }

    const adminUser = await ensureAdminAccount(this.models, this.config);

    return this.models.sequelize.transaction(async (transaction) => {
      const familyId = crypto.randomUUID();
      const { tokens } = await this.issueTokenPair(adminUser, familyId, meta, transaction);
      const profile = await this.buildUserProfile(adminUser, transaction);

      return {
        ...profile,
        tokens,
      };
    });
  }
}

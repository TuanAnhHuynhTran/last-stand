import { z } from 'zod';

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const registerSchema = z.object({
  email: z.string().trim().email('Email khong hop le').max(255),
  username: z
    .string()
    .trim()
    .min(3, 'Ten tai khoan toi thieu 3 ky tu')
    .max(32, 'Ten tai khoan toi da 32 ky tu')
    .regex(/^[a-zA-Z0-9_]+$/, 'Ten tai khoan chi gom chu, so va dau gach duoi'),
  password: z
    .string()
    .min(8, 'Mat khau toi thieu 8 ky tu')
    .max(128, 'Mat khau toi da 128 ky tu')
    .regex(/[A-Z]/, 'Mat khau can it nhat 1 chu in hoa')
    .regex(/[a-z]/, 'Mat khau can it nhat 1 chu thuong')
    .regex(/[0-9]/, 'Mat khau can it nhat 1 chu so'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Email khong hop le'),
  password: z.string().min(1, 'Vui long nhap mat khau'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token khong hop le'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token khong hop le').optional(),
});

export const characterAppearanceSchema = z.object({
  bodyType: z.enum(['athletic', 'classic', 'compact']),
  skinTone: z.string().regex(hexColorRegex, 'Ma mau da khong hop le'),
  hairStyle: z.enum(['short', 'slick', 'wavy', 'bob', 'buzz']),
  hairColor: z.string().regex(hexColorRegex, 'Ma mau toc khong hop le'),
  outfitStyle: z.enum(['architect', 'mayor', 'explorer', 'urban', 'engineer']),
  outfitPrimaryColor: z.string().regex(hexColorRegex, 'Ma mau trang phuc chinh khong hop le'),
  outfitSecondaryColor: z.string().regex(hexColorRegex, 'Ma mau trang phuc phu khong hop le'),
  accessory: z.enum(['none', 'glasses', 'hard_hat', 'visor', 'scarf']),
  modelKey: z.string().min(2).max(64),
});

export const createCharacterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Ten nhan vat toi thieu 2 ky tu')
    .max(32, 'Ten nhan vat toi da 32 ky tu'),
  presetId: z.string().min(2, 'Vui long chon preset ngoai hinh').max(50),
  appearance: characterAppearanceSchema.optional(),
});

export const createCitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Ten thanh pho toi thieu 3 ky tu')
    .max(50, 'Ten thanh pho toi da 50 ky tu'),
  terrainType: z
    .enum(['plains', 'plain', 'coastal', 'highlands', 'mountain', 'valley', 'river'])
    .transform((val) => {
      if (val === 'plain') return 'plains' as const;
      if (val === 'mountain') return 'highlands' as const;
      if (val === 'river') return 'valley' as const;
      return val;
    }),
  isPublic: z.boolean().optional().default(true),
});

export const cityIdParamSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
});

export const chunkCoordParamsSchema = z.object({
  cityId: z.string().uuid('Ma thanh pho khong hop le'),
  chunkX: z.coerce.number().int().min(0).max(64),
  chunkZ: z.coerce.number().int().min(0).max(64),
});

export const chunkRangeQuerySchema = z
  .object({
    minX: z.coerce.number().int().min(0).max(64).optional(),
    maxX: z.coerce.number().int().min(0).max(64).optional(),
    minZ: z.coerce.number().int().min(0).max(64).optional(),
    maxZ: z.coerce.number().int().min(0).max(64).optional(),
    cx: z.coerce.number().int().min(0).max(64).optional(),
    cz: z.coerce.number().int().min(0).max(64).optional(),
    radius: z.coerce.number().int().min(0).max(3).optional(),
  })
  .refine(
    (q) => {
      const hasBounds =
        q.minX !== undefined &&
        q.maxX !== undefined &&
        q.minZ !== undefined &&
        q.maxZ !== undefined;
      const hasCenter = q.cx !== undefined && q.cz !== undefined;
      return hasBounds || hasCenter;
    },
    { message: 'Can cung cap (minX, maxX, minZ, maxZ) hoac (cx, cz, radius)' }
  )
  .refine(
    (q) => {
      if (q.minX !== undefined && q.maxX !== undefined && q.minX > q.maxX) return false;
      if (q.minZ !== undefined && q.maxZ !== undefined && q.minZ > q.maxZ) return false;
      return true;
    },
    { message: 'Pham vi chunk khong hop le (min phai nho hon hoac bang max)' }
  );

export const biomeEnumSchema = z.enum([
  'deep_water',
  'shallow_water',
  'sand',
  'grass',
  'meadow',
  'forest',
  'hill',
  'mountain',
  'snow',
]);

export const terrainTileDeltaSchema = z
  .object({
    gx: z.number().int().min(0).max(1024),
    gz: z.number().int().min(0).max(1024),
    heightDelta: z.number().min(-10).max(18).optional(),
    setHeight: z.number().min(-4.5).max(26).optional(),
    biome: biomeEnumSchema.optional(),
    clearProps: z.boolean().optional(),
  })
  .refine(
    (t) =>
      t.heightDelta !== undefined ||
      t.setHeight !== undefined ||
      t.biome !== undefined ||
      t.clearProps !== undefined,
    { message: 'Moi tile delta phai co it nhat mot thuoc tinh thay doi' }
  );

export const saveTerrainDeltaSchema = z.object({
  tiles: z.array(terrainTileDeltaSchema).min(1).max(512),
});

export const saveChunkDeltaBodySchema = z.object({
  tiles: z
    .array(
      z
        .object({
          lx: z.number().int().min(0).max(31),
          lz: z.number().int().min(0).max(31),
          heightDelta: z.number().min(-10).max(18).optional(),
          setHeight: z.number().min(-4.5).max(26).optional(),
          biome: biomeEnumSchema.optional(),
          clearProps: z.boolean().optional(),
        })
        .refine(
          (t) =>
            t.heightDelta !== undefined ||
            t.setHeight !== undefined ||
            t.biome !== undefined ||
            t.clearProps !== undefined,
          { message: 'Moi tile delta phai co it nhat mot thuoc tinh thay doi' }
        )
    )
    .min(1)
    .max(512),
});

export const seedTerrainSchema = z.object({
  resetDeltas: z.boolean().optional().default(false),
  chunks: z
    .array(
      z.object({
        cx: z.number().int().min(0).max(64),
        cz: z.number().int().min(0).max(64),
      })
    )
    .max(64)
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type CreateCityInput = z.infer<typeof createCitySchema>;
export type ChunkRangeQueryInput = z.infer<typeof chunkRangeQuerySchema>;
export type SaveTerrainDeltaInput = z.infer<typeof saveTerrainDeltaSchema>;
export type SaveChunkDeltaBodyInput = z.infer<typeof saveChunkDeltaBodySchema>;
export type SeedTerrainInput = z.infer<typeof seedTerrainSchema>;

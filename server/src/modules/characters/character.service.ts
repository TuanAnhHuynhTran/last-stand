import {
  CHARACTER_PRESETS,
  type CharacterAppearance,
  type CharacterDTO,
  type CharacterPreset,
  type CreateCharacterInput,
} from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { toCharacterDTO } from '../../utils/mappers.js';

export class CharacterService {
  constructor(private readonly models: DatabaseModels) {}

  getPresets(): readonly CharacterPreset[] {
    return CHARACTER_PRESETS;
  }

  async getMyCharacter(userId: string): Promise<CharacterDTO> {
    const character = await this.models.Character.findOne({ where: { userId } });
    if (!character) {
      throw new NotFoundError('Ban chua tao nhan vat', 'CHARACTER_NOT_FOUND');
    }
    return toCharacterDTO(character);
  }

  async createCharacter(userId: string, input: CreateCharacterInput): Promise<CharacterDTO> {
    const preset = CHARACTER_PRESETS.find((item) => item.id === input.presetId);
    if (!preset) {
      throw new BadRequestError('Preset ngoai hinh khong ton tai', 'INVALID_PRESET');
    }

    const existing = await this.models.Character.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictError(
        'Moi tai khoan chi duoc so huu toi da 1 nhan vat o ban MVP',
        'CHARACTER_ALREADY_EXISTS'
      );
    }

    const resolvedAppearance: CharacterAppearance = input.appearance
      ? {
          ...preset.appearance,
          ...input.appearance,
          // Keep modelKey authoritative from preset so client cannot inject arbitrary asset keys
          modelKey: preset.appearance.modelKey,
        }
      : { ...preset.appearance };

    const created = await this.models.sequelize.transaction(async (transaction) => {
      const checkInsideTx = await this.models.Character.findOne({
        where: { userId },
        transaction,
      });
      if (checkInsideTx) {
        throw new ConflictError(
          'Moi tai khoan chi duoc so huu toi da 1 nhan vat o ban MVP',
          'CHARACTER_ALREADY_EXISTS'
        );
      }

      return this.models.Character.create(
        {
          userId,
          name: input.name.trim(),
          presetId: preset.id,
          appearance: resolvedAppearance,
        },
        { transaction }
      );
    });

    return toCharacterDTO(created);
  }
}

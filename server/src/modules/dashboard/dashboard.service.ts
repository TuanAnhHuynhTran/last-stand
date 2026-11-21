import type { DashboardDTO } from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { toCharacterDTO, toCityDTO, toUserDTO } from '../../utils/mappers.js';

export class DashboardService {
  constructor(private readonly models: DatabaseModels) {}

  async getDashboard(userId: string): Promise<DashboardDTO> {
    const user = await this.models.User.findByPk(userId);
    if (!user) {
      throw new UnauthorizedError('Tai khoan khong ton tai', 'USER_NOT_FOUND');
    }

    const [character, city] = await Promise.all([
      this.models.Character.findOne({ where: { userId } }),
      this.models.City.findOne({ where: { ownerId: userId } }),
    ]);

    let cityDTO = null;
    if (city) {
      const economy = await this.models.CityEconomy.findOne({ where: { cityId: city.id } });
      if (economy) {
        cityDTO = toCityDTO(city, economy, 'owner');
      }
    }

    const hasCharacter = Boolean(character);
    const hasCity = Boolean(cityDTO);

    return {
      user: toUserDTO(user),
      character: character ? toCharacterDTO(character) : null,
      city: cityDTO,
      onboarding: {
        hasCharacter,
        hasCity,
        isReadyToPlay: hasCharacter && hasCity,
      },
    };
  }
}

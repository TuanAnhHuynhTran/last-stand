import type {
  ApiSuccessResponse,
  CharacterDTO,
  CharacterPreset,
  CreateCharacterInput,
} from '@cityverse/shared';
import { httpClient } from './httpClient';

export const characterApi = {
  async getPresets(): Promise<CharacterPreset[]> {
    const { data } =
      await httpClient.get<ApiSuccessResponse<CharacterPreset[]>>('/characters/presets');
    return data.data;
  },

  async getMyCharacter(): Promise<CharacterDTO> {
    const { data } = await httpClient.get<ApiSuccessResponse<CharacterDTO>>('/characters/me');
    return data.data;
  },

  async createCharacter(payload: CreateCharacterInput): Promise<CharacterDTO> {
    const { data } = await httpClient.post<ApiSuccessResponse<CharacterDTO>>(
      '/characters',
      payload
    );
    return data.data;
  },
};

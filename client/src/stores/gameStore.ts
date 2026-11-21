import { create } from 'zustand';
import type { CharacterDTO, CityDTO, GameMode } from '@cityverse/shared';

interface GameState {
  character: CharacterDTO | null;
  city: CityDTO | null;
  activeCityId: string | null;
  gameMode: GameMode;
  setCharacter: (character: CharacterDTO | null) => void;
  setCity: (city: CityDTO | null) => void;
  setActiveCityId: (cityId: string | null) => void;
  setGameMode: (mode: GameMode) => void;
  resetGameState: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  character: null,
  city: null,
  activeCityId: null,
  gameMode: 'build',
  setCharacter: (character) => set({ character }),
  setCity: (city) => set({ city, activeCityId: city?.id ?? null }),
  setActiveCityId: (activeCityId) => set({ activeCityId }),
  setGameMode: (gameMode) => set({ gameMode }),
  resetGameState: () =>
    set({
      character: null,
      city: null,
      activeCityId: null,
      gameMode: 'build',
    }),
}));

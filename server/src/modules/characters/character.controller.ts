import type { NextFunction, Request, Response } from 'express';
import type { CreateCharacterInput } from '@cityverse/shared';
import type { AuthenticatedRequest } from '../../middlewares/auth.middleware.js';
import { UnauthorizedError } from '../../utils/errors.js';
import type { CharacterService } from './character.service.js';

export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  getPresets = (_req: Request, res: Response): void => {
    const presets = this.characterService.getPresets();
    res.status(200).json({
      success: true,
      data: presets,
    });
  };

  getMyCharacter = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const character = await this.characterService.getMyCharacter(req.user.id);
      res.status(200).json({
        success: true,
        data: character,
      });
    } catch (error) {
      next(error);
    }
  };

  createCharacter = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const character = await this.characterService.createCharacter(
        req.user.id,
        req.body as CreateCharacterInput
      );
      res.status(201).json({
        success: true,
        data: character,
        message: 'Tao nhan vat thanh cong',
      });
    } catch (error) {
      next(error);
    }
  };
}

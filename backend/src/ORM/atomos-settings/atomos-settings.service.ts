import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AtomosSettingsEntity } from './atomos-settings.entity';

const SETTINGS_ROW_ID = 1;

@Injectable()
export class AtomosSettingsService {

    constructor(
        @InjectRepository(AtomosSettingsEntity)
        private settingsRepository: Repository<AtomosSettingsEntity>
    ) { }

    public async getSettings(): Promise<AtomosSettingsEntity> {
        let settings = await this.settingsRepository.findOne({ where: { id: SETTINGS_ROW_ID } });

        if (settings == null) {
            settings = await this.settingsRepository.save({ id: SETTINGS_ROW_ID });
        }

        return settings;
    }

    public async updateSettings(partial: Partial<AtomosSettingsEntity>): Promise<AtomosSettingsEntity> {
        await this.getSettings(); // ensures the row exists first
        await this.settingsRepository.update({ id: SETTINGS_ROW_ID }, partial);
        return await this.getSettings();
    }
}

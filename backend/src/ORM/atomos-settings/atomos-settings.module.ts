import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AtomosSettingsEntity } from './atomos-settings.entity';
import { AtomosSettingsService } from './atomos-settings.service';

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([AtomosSettingsEntity])],
    providers: [AtomosSettingsService],
    exports: [TypeOrmModule, AtomosSettingsService],
})
export class AtomosSettingsModule { }

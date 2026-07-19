import { of } from 'rxjs';

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AddressSettingsModule } from '../../ORM/address-settings/address-settings.module';
import { BlocksModule } from '../../ORM/blocks/blocks.module';
import { ClientStatisticsModule } from '../../ORM/client-statistics/client-statistics.module';
import { ClientModule } from '../../ORM/client/client.module';
import { BitcoinRpcService } from '../../services/bitcoin-rpc.service';
import { ActiveClientRegistryService } from '../../services/active-client-registry.service';
import { ClientController } from './client.controller';

describe('ClientController', () => {
  let controller: ClientController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          synchronize: true,
          autoLoadEntities: true,
          cache: true,
          logging: false
        }),
        AddressSettingsModule,
        ClientModule,
        ClientStatisticsModule,
        BlocksModule
      ],
      controllers: [ClientController],
      providers: [
        {
          provide: BitcoinRpcService,
          useValue: {
            newBlock$: of({ blocks: 900000, difficulty: 1, networkhashps: 1 })
          }
        },
        ActiveClientRegistryService
      ]

    }).compile();

    controller = module.get<ClientController>(ClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

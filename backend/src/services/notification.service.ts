import { Injectable, OnModuleInit } from '@nestjs/common';
import { Block } from 'bitcoinjs-lib';

import { DiscordService } from './discord.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';


@Injectable()
export class NotificationService implements OnModuleInit {

    constructor(
        private readonly telegramService: TelegramService,
        private readonly discordService: DiscordService,
        private readonly webhookService: WebhookService
    ) { }

    async onModuleInit(): Promise<void> {
        await this.discordService.notifyRestarted();
        await this.webhookService.notifyRestarted();
    }

    public async notifySubscribersBlockFound(address: string, worker: string, height: number, block: Block, message: string) {
        await this.discordService.notifySubscribersBlockFound(height, block, message);
        await this.telegramService.notifySubscribersBlockFound(address, height, block, message);
        await this.webhookService.notifySubscribersBlockFound(address, worker, height, block, message);
    }

    // New: called from StratumV1Client.ts whenever a client sets a new personal-best
    // share difficulty (but did NOT find a full block, which has its own alert above).
    public async notifyNewBestDifficulty(address: string, worker: string, difficulty: number) {
        await this.webhookService.notifyNewBestDifficulty(address, worker, difficulty);
    }
}

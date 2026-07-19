import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { AddressSettingsService } from '../../ORM/address-settings/address-settings.service';
import { BlocksService } from '../../ORM/blocks/blocks.service';
import { ClientStatisticsService } from '../../ORM/client-statistics/client-statistics.service';
import { ClientService } from '../../ORM/client/client.service';
import { ActiveClientRegistryService } from '../../services/active-client-registry.service';
import { BitcoinRpcService } from '../../services/bitcoin-rpc.service';


@Controller('client')
export class ClientController {

    constructor(
        private readonly clientService: ClientService,
        private readonly clientStatisticsService: ClientStatisticsService,
        private readonly addressSettingsService: AddressSettingsService,
        private readonly blocksService: BlocksService,
        private readonly bitcoinRpcService: BitcoinRpcService,
        private readonly activeClientRegistry: ActiveClientRegistryService
    ) { }

    private getCurrentBlockReward(blockHeight: number): number {
        const BLOCKS_PER_HALVING = 210000;
        const INITIAL_REWARD = 50;
        const halvings = Math.floor(blockHeight / BLOCKS_PER_HALVING);
        return INITIAL_REWARD / Math.pow(2, halvings);
    }

    @Get(':address')
    async getClientInfo(@Param('address') address: string) {

        const workers = await this.clientService.getByAddress(address);

        const addressSettings = await this.addressSettingsService.getSettings(address, false);

        const blocksFound = await this.blocksService.getFoundBlocksByAddress(address);

        const miningInfo = await firstValueFrom(this.bitcoinRpcService.newBlock$);
        const currentBlockReward = this.getCurrentBlockReward(miningInfo.blocks);

        const acceptedSharesLast24h = await this.clientStatisticsService.getTotalAcceptedSharesLast24h(address);

        return {
            bestDifficulty: addressSettings?.bestDifficulty,
            workersCount: workers.length,
            workers: await Promise.all(
                workers.map(async (worker) => {
                    return {
                        sessionId: worker.sessionId,
                        name: worker.clientName,
                        bestDifficulty: worker.bestDifficulty.toFixed(2),
                        hashRate: worker.hashRate,
                        startTime: worker.startTime,
                        lastSeen: worker.updatedAt
                    };
                })
            ),
            blocksFound,
            blocksFoundCount: blocksFound.length,
            currentBlockReward,
            // Approximation: real reward paid per block can vary slightly (fees included),
            // this multiplies the current-era subsidy by blocks found. Good enough for a
            // "total earned" estimate; not a substitute for on-chain verification.
            totalEarnedEstimate: blocksFound.length * currentBlockReward,
            acceptedSharesLast24h
        }
    }

    @Post(':address/:sessionId/reset-difficulty')
    async resetWorkerBestDifficulty(@Param('address') address: string, @Param('sessionId') sessionId: string) {

        // Confirm this sessionId actually belongs to this address before
        // allowing a reset - avoids resetting an arbitrary session by guessing IDs.
        const workers = await this.clientService.getByAddress(address);
        const belongsToAddress = workers.some(w => w.sessionId === sessionId);

        if (!belongsToAddress) {
            return new NotFoundException('No worker session found for this address with that session ID.');
        }

        await this.clientService.updateBestDifficulty(sessionId, 0);
        const wasLiveReset = this.activeClientRegistry.resetBestDifficulty(sessionId);

        return { success: true, wasConnected: wasLiveReset };
    }

    @Get(':address/chart')
    async getClientInfoChart(@Param('address') address: string) {
        const chartData = await this.clientStatisticsService.getChartDataForAddress(address);
        return chartData;
    }

    @Get(':address/:workerName')
    async getWorkerGroupInfo(@Param('address') address: string, @Param('workerName') workerName: string) {

        const workers = await this.clientService.getByName(address, workerName);

        const bestDifficulty = workers.reduce((pre, cur, idx, arr) => {
            if (cur.bestDifficulty > pre) {
                return cur.bestDifficulty;
            }
            return pre;
        }, 0);

        const chartData = await this.clientStatisticsService.getChartDataForGroup(address, workerName);
        return {

            name: workerName,
            bestDifficulty: Math.floor(bestDifficulty),
            chartData: chartData,

        }
    }

    @Get(':address/:workerName/:sessionId')
    async getWorkerInfo(@Param('address') address: string, @Param('workerName') workerName: string, @Param('sessionId') sessionId: string) {

        const worker = await this.clientService.getBySessionId(address, workerName, sessionId);
        if (worker == null) {
            return new NotFoundException();
        }
        const chartData = await this.clientStatisticsService.getChartDataForSession(worker.address, worker.clientName, worker.sessionId);

        return {
            sessionId: worker.sessionId,
            name: worker.clientName,
            bestDifficulty: Math.floor(worker.bestDifficulty),
            chartData: chartData,
            startTime: worker.startTime
        }
    }
}

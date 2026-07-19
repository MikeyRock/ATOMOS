import { Injectable } from '@nestjs/common';

import { StratumV1Client } from '../models/StratumV1Client';

/**
 * Tracks currently-connected StratumV1Client instances by sessionId.
 *
 * Why this exists: `bestDifficulty` is gated by an in-memory comparison
 * inside StratumV1Client (`if (submissionDifficulty > this.entity.bestDifficulty)`)
 * before it ever touches the database. If a "reset best difficulty" action
 * only updated the database, an actively-connected worker's in-memory value
 * would stay stale at the old (higher) number - meaning the dashboard would
 * briefly show 0, but the very next real share wouldn't be recorded as a
 * new best until it exceeded the OLD pre-reset value. This registry lets a
 * reset action reach into the live connection and clear the in-memory gate
 * too, so a reset actually behaves like a reset for connected workers, not
 * just a cosmetic database change.
 */
@Injectable()
export class ActiveClientRegistryService {

    private clients = new Map<string, StratumV1Client>();

    public register(sessionId: string, client: StratumV1Client) {
        this.clients.set(sessionId, client);
    }

    public unregister(sessionId: string) {
        this.clients.delete(sessionId);
    }

    // Returns true if a live, connected client was found and reset.
    // false just means the worker isn't currently connected - the caller
    // should still reset the database value regardless.
    public resetBestDifficulty(sessionId: string): boolean {
        const client = this.clients.get(sessionId);
        if (client == null) {
            return false;
        }
        client.resetBestDifficulty();
        return true;
    }
}

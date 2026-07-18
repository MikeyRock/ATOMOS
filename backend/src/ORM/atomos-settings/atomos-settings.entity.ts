import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Single-row settings table for instance-wide ATOMOS configuration.
 * Always uses id = 1 - there's only ever one row. This lets webhook
 * config, the saved BTC address, and alert toggles be changed from the
 * UI at runtime instead of requiring a docker-compose.yml edit + restart.
 */
@Entity()
export class AtomosSettingsEntity {

    @PrimaryColumn({ default: 1 })
    id: number;

    @Column({ nullable: true })
    discordWebhookUrl: string;

    @Column({ default: 'discord' })
    webhookFormat: string;

    @Column({ nullable: true, length: 62, type: 'varchar' })
    btcAddress: string;

    @Column({ default: true })
    alertBlockFound: boolean;

    @Column({ default: true })
    alertBestDifficulty: boolean;

    @Column({ default: true })
    alertRestart: boolean;

}

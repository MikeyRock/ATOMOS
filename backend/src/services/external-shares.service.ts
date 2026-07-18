import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ExternalPoolShare } from '../models/ExternalPoolShare';

@Injectable()
export class ExternalSharesService {
  private readonly shareApiUrl: string | null;
  private readonly shareApiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    // Deliberately no default here - if EXTERNAL_SHARE_SUBMISSION_ENABLED is
    // ever turned on without also setting SHARE_SUBMISSION_URL, this should
    // fail loudly (see the check in submitShare) rather than silently
    // sending share data to any particular external server.
    this.shareApiUrl = this.configService.get('SHARE_SUBMISSION_URL') || null;
    this.shareApiKey = this.configService.get('SHARE_SUBMISSION_API_KEY');
  }

  public submitShare(share: ExternalPoolShare): void {
    if (this.shareApiUrl == null) {
      console.error('EXTERNAL_SHARE_SUBMISSION_ENABLED is true but SHARE_SUBMISSION_URL is not set - skipping submission.');
      return;
    }

    this.httpService.post(`${this.shareApiUrl}/api/share`, share, {
      headers: {
        'x-api-key': this.shareApiKey
      }
    }).subscribe({
      next: () =>{
        console.log('External share accepted');
      },
      error: (error) => console.error('Failed to submit share to API:', error.message)
    });
  }
}

import type { LiveChannel } from './types';

export interface TvRegion { code: string; name: string; flag: string; count: number }
export interface TvDirectoryResponse {
  regions: TvRegion[];
  totalChannels: number;
  updatedAt: string;
  source: string;
}
export interface TvRegionResponse {
  region: TvRegion;
  channels: LiveChannel[];
  updatedAt: string;
}

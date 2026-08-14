export interface ScanOptions { compactSince?: Date; through?: Date }
export interface ScanPeriod { modeUsingReads: number; ambiguousReads: number; rate: number }
export interface ScanReport { sessions: number; totalReads: number; modeUsingReads: number; ambiguousReads: number; affectedSessions: number; selfCorrected: number; routes: Record<string, number>; before: ScanPeriod; after: ScanPeriod }
export function parseIsoDate(raw: string, label: string): Date;
export function isModeUsingRead(input: Record<string, unknown>): boolean;
export function isBaselineAmbiguousRead(input: Record<string, unknown>): boolean;
export function scanSessionDirectory(directory: string, options?: ScanOptions): Promise<ScanReport>;

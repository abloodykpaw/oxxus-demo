/** OXXUS release id: Comercial.OXXUS.Edjouner.Build — synced from VERSION by bump script. */
export const OXXUS_VERSION = "0.0.1.27";

export type OxxusVersionParts = {
  commercial: 0 | 1;
  oxxus: 0 | 1;
  edjouner: 0 | 1;
  build: number;
};

export function parseOxxusVersion(raw: string): OxxusVersionParts | null {
  const match = String(raw)
    .trim()
    .match(/^([01])\.([01])\.([01])\.(\d+)$/);
  if (!match) return null;
  return {
    commercial: Number(match[1]) as 0 | 1,
    oxxus: Number(match[2]) as 0 | 1,
    edjouner: Number(match[3]) as 0 | 1,
    build: Number(match[4]),
  };
}

export function formatOxxusVersion(parts: OxxusVersionParts): string {
  return `${parts.commercial}.${parts.oxxus}.${parts.edjouner}.${parts.build}`;
}

export function oxxusVersionLabel(version = OXXUS_VERSION): string {
  return `v${version}`;
}

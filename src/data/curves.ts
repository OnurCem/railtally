/**
 * Bend of curved routes, in map units: how far the middle of the route is pushed sideways from the
 * straight line between its cities. The sign picks the side (positive = to the left when travelling
 * from the route's `from` city to its `to` city, with north up). Both routes of a double pair share
 * the key and stay parallel. Keys are `${from}-${to}`.
 */
export const routeBend: Record<string, number> = {
  "palermo-smyrna": -64,
  "athina-brindisi": 14,
  "athina-smyrna": 10,
  "brindisi-palermo": 10,
  "palermo-roma": -14,
  "constantinople-sevastopol": 20,
  "erzurum-sevastopol": -22,
  "sevastopol-sochi": 12,
  "petrograd-stockholm": -34,
  "kobenhavn-stockholm": 14,
  "essen-kobenhavn": 16,
  "amsterdam-london": -14,
  "dieppe-london": 10,
  "edinburgh-london": 14,
  "cadiz-lisboa": -8,
  "lisboa-madrid": 14,
  "cadiz-madrid": -12,
  "barcelona-marseille": -22,
  "marseille-roma": -20,
  "brest-pamplona": -26,
  "danzig-riga": -16,
  "petrograd-riga": -14,
  "angora-smyrna": 14,
  "angora-erzurum": -10,
  "marseille-pamplona": 12,
  "budapest-kyiv": -18,
  "kharkov-moskva": 12,
};

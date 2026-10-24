/** Brand-independent identifiers. Display names never determine hydraulic behaviour. */
export type ManufacturerId = 'hunter' | 'rain-bird' | 'toro' | 'k-rain';
export type VerificationStatus = 'Verified' | 'Needs Review' | 'Deprecated';
export type EquipmentCategory = 'rotary' | 'spray' | 'fixed' | 'specialty' | 'bubbler' | 'rotor' | 'body';
export const MANUFACTURERS: ReadonlyArray<{id: ManufacturerId; name: string}> = [
  {id:'hunter',name:'Hunter'}, {id:'rain-bird',name:'Rain Bird'},
  {id:'toro',name:'Toro'}, {id:'k-rain',name:'K-Rain'},
];
export type CatalogProvenance = {
  category?: EquipmentCategory;
  manufacturerId: ManufacturerId;
  modelId: string;
  catalogVersion: string;
  verificationStatus: VerificationStatus;
  /** Separates verified discharge data from an unsupported coverage footprint. */
  hydraulicVerificationStatus?: 'Verified' | 'Needs Review';
  /** No assumed radius reduction or discharge adjustment for a new product. */
  radiusAdjustment?: { minimumRatio: number; minimumRadiusM?:number; flowPolicy: 'unchanged' | 'matched-precipitation' | 'unknown' };
};

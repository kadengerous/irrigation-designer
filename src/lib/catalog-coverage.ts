import {stripAtPressure, type CatalogItem} from './equipment-catalog';
import {activeLocale, formatNumber, tr, type Locale} from './i18n';
import {formatLenU, fromMeters, lenLabel, type LengthUnit} from './units';

/** Presentation only: internal flow angles are not coverage shapes. */
export function isLocalWatering(item:CatalogItem) {
  return item.coverageKind==='point' && item.type==='bubbler';
}

export function hasStreamCoverage(item:CatalogItem) {
  return item.coverageKind==='streams'||item.family==='stream';
}

const lengthText=(value:number,unit:LengthUnit,digits?:number)=>digits==null?formatLenU(value,unit):`${formatNumber(fromMeters(value,unit),digits)} ${lenLabel(unit)}`;

export function coveragePatternLabel(item:CatalogItem,locale:Locale=activeLocale(),arc?:number):string {
  const t=(key:string)=>tr(locale,key);
  if(item.type==='body')return t('noData');
  if(isLocalWatering(item))return t('localizedWatering');
  if(item.coverageKind==='point'||item.geometryVerificationStatus==='Needs Review')return t('coverageUnverified');
  if(hasStreamCoverage(item))return t('coverageStreams');
  if(item.strip||item.coverageKind==='strip')return t('equipment.strip');
  if(item.coverageKind==='square') {
    const fraction=item.squarePatternFraction, symbol=fraction===.25?'¼':fraction===.5?'½':fraction===.75?'¾':null;
    return fraction===1?t('equipment.square'):symbol?`${symbol} · ${t('equipment.square')}`:t('coverageUnverified');
  }
  if(item.placementSupported===false)return t('coverageUnverified');
  const ranges:[number,number][]=arc!=null?[[arc,arc]]:item.allowedArcRanges?.length?item.allowedArcRanges:[[item.arcMin,item.arcMax]];
  if(ranges.some(([min,max])=>!Number.isFinite(min)||!Number.isFinite(max)||min<0||max<=0||max<min||max>360))return t('coverageUnverified');
  return ranges.map(([min,max])=>min===max?`${formatNumber(min,0)}°`:`${formatNumber(min,0)}–${formatNumber(max,0)}°`).join(' / ');
}

export function coverageSizeLabel(item:CatalogItem,locale:Locale=activeLocale(),atPressure=false):string {
  const key=item.coverageKind==='point'&&!isLocalWatering(item)?'sqPatternSize':item.coverageKind==='square'?'sqPatternSize':item.strip||item.coverageKind==='strip'?(atPressure?'stripAtPressure':'stripSize'):hasStreamCoverage(item)?'coverageThrow':atPressure?'radiusAtPressure':'radius';
  return tr(locale,key);
}

/** The SQ table throw is a side offset, never its diagonal or full-square width. */
export function squarePatternSize(item:CatalogItem,throwM:number,unit:LengthUnit,locale:Locale=activeLocale(),digits?:number):string {
  const fraction=item.squarePatternFraction;
  if(!Number.isFinite(throwM)||throwM<=0||![.25,.5,.75,1].includes(fraction??0)||item.geometryVerificationStatus==='Needs Review')return tr(locale,'noData');
  return `${lengthText(throwM*(fraction===.25?1:2),unit,digits)} × ${lengthText(throwM*(fraction===.25||fraction===.5?1:2),unit,digits)}`;
}

export function coverageSize(item:CatalogItem,radiusM:number,unit:LengthUnit,pressureBar?:number,locale:Locale=activeLocale(),digits?:number):string {
  const t=(key:string)=>tr(locale,key);
  if(isLocalWatering(item))return t('coverageRadiusUndefined');
  if(item.type==='body'||item.coverageKind==='point'||item.geometryVerificationStatus==='Needs Review')return t('noData');
  if(item.coverageKind==='square')return squarePatternSize(item,radiusM,unit,locale,digits);
  if(item.strip||item.coverageKind==='strip') {
    const strip=pressureBar==null?item.strip:stripAtPressure(item,pressureBar);
    return strip&&Number.isFinite(strip.w)&&strip.w>0&&Number.isFinite(strip.l)&&strip.l>0?`${lengthText(strip.w,unit,digits)} × ${lengthText(strip.l,unit,digits)}`:t('noData');
  }
  if(item.placementSupported===false&&!hasStreamCoverage(item))return t('noData');
  return Number.isFinite(radiusM)&&radiusM>0?lengthText(radiusM,unit,digits):t('noData');
}

export function coverageSizeRange(item:CatalogItem,unit:LengthUnit,locale:Locale=activeLocale()):string {
  if(item.coverageKind==='point'||item.type==='body'||item.strip||item.coverageKind==='strip'||item.geometryVerificationStatus==='Needs Review')return coverageSize(item,item.rNom,unit,item.recommendedPressureBar,locale);
  if(!Number.isFinite(item.rMin)||!Number.isFinite(item.rMax)||item.rMin<=0||item.rMax<item.rMin)return tr(locale,'noData');
  const min=coverageSize(item,item.rMin,unit,undefined,locale),max=coverageSize(item,item.rMax,unit,undefined,locale);
  return min===max?min:`${min}–${max}`;
}

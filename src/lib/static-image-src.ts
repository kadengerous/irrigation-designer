import delivery from '../../data/static-image-delivery.json';

const sources=new Map(delivery.assets.map(asset=>[asset.source,asset.target]));
/** Use an actually deployed file directly; static hosting may bypass middleware
 * for a missing legacy PNG URL before its compatibility redirect can run. */
export function staticImageSrc(src:string):string {
  const path=src.split(/[?#]/,1)[0]!;
  return (sources.get(path)??path)+src.slice(path.length);
}

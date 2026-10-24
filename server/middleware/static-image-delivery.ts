import delivery from '../../data/static-image-delivery.json';
import landscapeDelivery from '../../data/landscape-delivery.json';

const targets=new Map(delivery.assets.map(asset=>[asset.source,asset.target]));
for(const asset of landscapeDelivery.assets)targets.set(asset.source.replace(/^public/,''),asset.target.replace(/^public/,''));
/** Preserve existing image URLs (including open older tabs) while transferring
 * full-resolution delivery artwork with preserved transparency. */
export default function staticImageDelivery(
  event:{url:URL;req:Request},next:()=>Promise<unknown>,
){
  const target=targets.get(event.url.pathname);
  if(!target||!['GET','HEAD'].includes(event.req.method))return next();
  return new Response(null,{status:307,headers:{
    location:target+event.url.search,
    'cache-control':'public, max-age=86400',
  }});
}

import {hasGoogleMapsKey,loadGoogleMapsScript} from './googleMapsLoader';
import {classifyMetroArea} from '../utils/cities';

export async function findBusinessAddresses(query) {
  if(!hasGoogleMapsKey()) throw new Error('Address search is unavailable. Please try again later.');
  loadGoogleMapsScript();
  const deadline=Date.now()+12000;
  while(!globalThis.google?.maps?.Geocoder && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  if(!globalThis.google?.maps?.Geocoder) throw new Error('Address search could not load. Check your connection and retry.');
  const response=await new google.maps.Geocoder().geocode({address:String(query || '').trim(),componentRestrictions:{country:'AU'}});
  return (response.results || []).filter(row=>row.address_components?.some(item=>item.types.includes('country') && item.short_name==='AU')).slice(0,5).map(row=>{
    const part=(type,short=false)=>{const value=row.address_components.find(item=>item.types.includes(type));return value?.[short?'short_name':'long_name'] || '';};
    const result={fullAddress:row.formatted_address,street:[part('street_number'),part('route')].filter(Boolean).join(' '),
      suburb:part('locality') || part('postal_town'),state:part('administrative_area_level_1',true),postcode:part('postal_code'),
      latitude:row.geometry.location.lat(),longitude:row.geometry.location.lng()};
    return {...result,city:classifyMetroArea(result)};
  });
}

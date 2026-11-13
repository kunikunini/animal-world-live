// ANIMAL WORLD LIVE に置いたこの売り場は、見るだけ。
// 元の売り場（北海道アニマルワールドの試作）にあった、ショップの商品・在庫の読み込みと、カート・お会計は入れていない。
// main.js は linked=false のとき、カートとお会計を出さない。
export async function connectShop(){
  return {linked:false, product:() => null, left:() => Infinity, count:() => 0, add:() => ({error:'ここでは買えません。'}), totals:() => null, confirm:async () => ({ok:false})};
}

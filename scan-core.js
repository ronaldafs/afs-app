/* scan-core.js — routemodel, parsers en matching, overgenomen uit het Scan Route Dashboard (Renewi). */
const ROUTE_COLORS={'1118':{name:'Lounge 1',color:'#1a7a3a',bg:'#e0f0e0',light:'#c8e0c8',class:'route-1118',rhClass:'rh-1118',rcClass:'rc-1118'},'2228':{name:'Lounge 2',color:'#8a6a10',bg:'#f8f0d8',light:'#f0e0b8',class:'route-2228',rhClass:'rh-2228',rcClass:'rc-2228'},'3338':{name:'Lounge 3',color:'#3a6088',bg:'#d8e8f5',light:'#c0d8e8',class:'route-3338',rhClass:'rh-3338',rcClass:'rc-3338'},'4448':{name:'Plaza',color:'#5a2d88',bg:'#e8ddf5',light:'#d8c8e8',class:'route-4448',rhClass:'rh-4448',rcClass:'rc-4448'},'5558':{name:'Nacht',color:'#983028',bg:'#f5e0dd',light:'#e8c8c0',class:'route-5558',rhClass:'rh-5558',rcClass:'rc-5558'},'6668':{name:'KLM',color:'#1a6888',bg:'#d8eef5',light:'#b8dde8',class:'route-6668',rhClass:'rh-6668',rcClass:'rc-6668'},'9999':{name:'Steekproef',color:'#6a3d8a',bg:'#f0e8f5',light:'#e0d8f0',class:'route-9999',rhClass:'',rcClass:''}};
const SHIFTS={ochtend:{label:'☀️ Ochtend',start:6*60+45,end:14*60+45},middag:{label:'🌇 Middag',start:14*60+45,end:22*60+45},nacht:{label:'🌙 Nacht',start:22*60+45,end:6*60+45}};
const RONDEN=[{id:1,label:'Ronde 1',start:7*60+15,end:9*60+15,shift:'ochtend',color:'#5b7fa5'},{id:2,label:'Ronde 2',start:10*60+15,end:12*60+0,shift:'ochtend',color:'#27ae60'},{id:3,label:'Ronde 3',start:12*60+0,end:14*60+10,shift:'ochtend',color:'#d4880f'},{id:4,label:'Ronde 4',start:15*60+15,end:17*60+45,shift:'middag',color:'#d4a373'},{id:5,label:'Ronde 5',start:18*60+45,end:20*60+0,shift:'middag',color:'#8b5f8a'},{id:6,label:'Ronde 6',start:20*60+0,end:22*60+10,shift:'middag',color:'#c0392b'},{id:7,label:'Ronde 7',start:0*60+0,end:4*60+0,shift:'nacht',color:'#1a7a8a'},{id:8,label:'Ronde 8',start:4*60+0,end:4*60+30,shift:'nacht',color:'#6b3a9e'},{id:9,label:'Ronde 9',start:5*60+0,end:6*60+15,shift:'nacht',color:'#a68b74'}];
const DIENSTWISSEL_START=14*60+10;
const DIENSTWISSEL_END=15*60+15;
const ROUTE_ORDER=['1118','2228','3338','4448','5558','6668'];
const PAUZE_OCHTEND_START=9*60+10;
const PAUZE_OCHTEND_END=10*60+20;
const PAUZE_MIDDAG_START=17*60+25;
const PAUZE_MIDDAG_END=19*60+5;
function getRouteStyle(pin){return ROUTE_COLORS[pin]||{name:'Route '+pin,color:'#5a7a5a',bg:'#f0f2eb',light:'#d5e0d0',class:'',rhClass:'',rcClass:''};}
function getShift(ts){var m=ts.getHours()*60+ts.getMinutes();if(m>=6*60+45&&m<14*60+45)return'ochtend';if(m>=14*60+45&&m<22*60+45)return'middag';return'nacht';}
function routeType(s){return s==='ochtend'?'dag':s==='middag'?'avond':'nacht';}
function getRonde(ts){var m=ts.getHours()*60+ts.getMinutes();for(var i=0;i<RONDEN.length;i++){if(m>=RONDEN[i].start&&m<RONDEN[i].end)return RONDEN[i];}return null;}
function getRondeDefById(id){return RONDEN.find(function(r){return r.id===id;});}
function gds(d){var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
function getOpDate(ts){var mins=ts.getHours()*60+ts.getMinutes();if(mins<6*60+45){return gds(new Date(ts.getTime()-86400000));}return gds(ts);}
function ft(d){return d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});}
function toMins(s){var h=s.split(':').map(Number);return h[0]*60+h[1];}
function norm(s){return s.toLowerCase().replace(/[^a-z0-9]/g,'');}
function isLiftScan(shop){var n=norm(shop||'');return n.indexOf('lift1314')>=0||n.indexOf('lift-13-14')>=0;}
function matches(a,b){var na=norm(a),nb=norm(b);if(na===nb)return true;if((na==='plazalaplaceresto'&&nb==='plazalaplacerestaurant')||(na==='plazalaplacerestaurant'&&nb==='plazalaplaceresto'))return true;if((na==='l1koffiesalonresto'&&nb==='l1koffiesalonrestaurant')||(na==='l1koffiesalonrestaurant'&&nb==='l1koffiesalonresto'))return true;var lenA=na.length,lenB=nb.length;var codeA=na.slice(0,13)+na.slice(Math.max(0,lenA-3));var codeB=nb.slice(0,13)+nb.slice(Math.max(0,lenB-3));return codeA===codeB;}
function spansBreak(t1,t2,def){if(!def||!def.vensterStart)return false;var vS=toMins(def.vensterStart),vE=toMins(def.vensterEind);var m1=t1.getHours()*60+t1.getMinutes(),m2=t2.getHours()*60+t2.getMinutes();return m1<=vS&&m2>=vE;}
function fmtShort(d){return String(d.getDate())+'/'+String(d.getMonth()+1);}
function addDays(d,n){var x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}
function ri(p){return RM[p]||{name:'Route '+p,color:'#5a7a5a'};}
function getRouteDef(pin,shift){var r=RM[pin];if(!r)return null;if(shift==='ochtend')return r.dag;if(shift==='middag')return r.avond;if(shift==='nacht')return r.nacht;return r.dag;}
function getRondeProgress(pin,shift,scans){
  var def=getRouteDef(pin,shift);if(!def||!def.ronden)return{};
  var prog={};
  def.ronden.forEach(function(r){
    var winkelsInRonde=def.winkels.filter(function(w){return w.r.includes(r.id);});
    var total=winkelsInRonde.length;
    var done=0;
    winkelsInRonde.forEach(function(w){var winkelScans=scans.filter(function(s){return matches(s.shop,w.n)&&!isLiftScan(s.shop);});if(winkelScans.length>0)done++;});
    var pct=total>0?Math.round(done/total*100):0;
    prog[r.id]={done:done,total:total,pct:pct,label:r.label,complete:pct>=96};
  });
  return prog;
}
const RM = {
  '1118': {
    name:'Lounge 1', color:'#1a7a3a',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[{n:'B-pier-Dammers-Tap',r:[1,2]},{n:'B-pier-Grab-Fly',r:[1,2]},{n:'B-pier-Karton-Verzamelpunt',r:[1,2,3]},{n:'B-pier-Kiosk-29',r:[1,2]},{n:'B-pier-Kiosk-koffiepunt',r:[1,2]},{n:'B-pier-Koffiesalon-Car',r:[1,2]},{n:'C-pier-Comunal',r:[1,2,3]},{n:'C-pier-Karton-Verzamelpunt',r:[1,2,3]},{n:'C-pier-Kiosco',r:[1,2]},{n:'C-pier-Starbucks',r:[1,2]},{n:'C-pier-Grab-Fly',r:[1,2]},{n:'L1-Privium-South',r:[1,2,3]},{n:'L1-Deli-Salon',r:[1,2,3]},{n:'L1-Eataly',r:[1,2,3]},{n:'L1-Koekemannetje',r:[1,2]},{n:'L1-Koffiesalon-Resto',r:[1,2,3]},{n:'L1-LOAF',r:[1,2,3]},{n:'L1-Starbucks',r:[1,2,3]},{n:'L1-Burger-King',r:[1,2,3]},{n:'L1-De-Bar',r:[1,2]},{n:'L1-La-Place',r:[1,2,3]},{n:'L1-Leon',r:[1,2]},{n:'L1-The-Wanderer',r:[1,2]},{n:'L1-Two-Tigers',r:[1,2]}]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[{n:'B-pier-Dammers-Tap',r:[4,5]},{n:'B-pier-Grab-Fly',r:[4,5]},{n:'B-pier-Karton-Verzamelpunt',r:[4,5]},{n:'B-pier-Kiosk-29',r:[4,5]},{n:'B-pier-Kiosk-koffiepunt',r:[4,5]},{n:'B-pier-Koffiesalon-Car',r:[4]},{n:'C-pier-Comunal',r:[4,5]},{n:'C-pier-Karton-Verzamelpunt',r:[4,5]},{n:'C-pier-Kiosco',r:[4]},{n:'C-pier-Starbucks',r:[4]},{n:'C-pier-Grab-Fly',r:[4,5]},{n:'L1-Privium-South',r:[4,5]},{n:'L1-Deli-Salon',r:[4,5,6]},{n:'L1-Eataly',r:[4,5]},{n:'L1-Koekemannetje',r:[4,5]},{n:'L1-Koffiesalon-Resto',r:[4,5,6]},{n:'L1-LOAF',r:[4,5]},{n:'L1-Starbucks',r:[4,5,6]},{n:'L1-Burger-King',r:[4,5,6]},{n:'L1-De-Bar',r:[4,5]},{n:'L1-La-Place',r:[4,5]},{n:'L1-Leon',r:[4,5]},{n:'L1-The-Wanderer',r:[4,5]},{n:'L1-Two-Tigers',r:[4,5]}]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[]
    }
  },
  '2228': {
    name:'Lounge 2', color:'#8a6a10',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[{n:'D-pier-Cafe-Flor',r:[1]},{n:'D-pier-Harvest-Market',r:[1,2]},{n:'D-pier-Heineken-Bar',r:[1]},{n:'D-pier-Murphy\'s-Pub',r:[1]},{n:'D-pier-Starbucks',r:[1]},{n:'D-pier-Grab-Fly',r:[1,2]},{n:'L1-Aspire-26',r:[1,2,3]},{n:'L1-Park-Cafe',r:[1,2]},{n:'L1-Privium-28',r:[1,2]},{n:'L2-Bubbles',r:[1]},{n:'L2-Gucci',r:[1]},{n:'L2-Louis-Vuitton',r:[1]},{n:'L2-Amsterdam-Bread-Company',r:[1,2,3]},{n:'L2-Aspire-41',r:[1,2,3]},{n:'L2-Frames',r:[1]},{n:'L2-Starbucks',r:[1,2,3]},{n:'L2-Lavazza',r:[1]},{n:'L2-MCDonalds',r:[1,2,3]},{n:'L2-Streetfood-the-oven-the-grill',r:[1,2]},{n:'L2-Sushi-',r:[1,2]}]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[{n:'D-pier-Cafe-Flor',r:[4]},{n:'D-pier-Harvest-Market',r:[4,5]},{n:'D-pier-Heineken-Bar',r:[4,5]},{n:'D-pier-Murphy\'s-Pub',r:[4,5]},{n:'D-pier-Stach',r:[4]},{n:'D-pier-Starbucks',r:[4,5]},{n:'D-pier-Grab-Fly',r:[4,5]},{n:'L1-Aspire-26',r:[4,5]},{n:'L1-Park-Cafe',r:[4,5]},{n:'L1-Privium-28',r:[4,5]},{n:'L2-Amsterdam-Bread-Company',r:[4,5,6]},{n:'L2-Bubbles',r:[4,5]},{n:'L2-Aspire-41',r:[4,5,6]},{n:'L2-Frames',r:[4]},{n:'L2-Starbucks',r:[4,5]},{n:'L2-Lavazza',r:[4,5]},{n:'L2-MCDonalds',r:[4,5,6]},{n:'L2-Streetfood-the-oven-the-grill',r:[4,5]},{n:'L2-Sushi-',r:[4,5]}]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[]
    }
  },
  '3338': {
    name:'Lounge 3', color:'#3a6088',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[{n:'E-pier-Cafe-Olea',r:[1,2]},{n:'E-pier-Silverscreen',r:[1,2]},{n:'F-pier-East-Bar',r:[1]},{n:'F-pier-Moods',r:[1,2]},{n:'F-pier-The-Butcher',r:[1]},{n:'G-pier-Karton-Verzamelpunt',r:[1,2]},{n:'G-pier-Kiosk',r:[1]},{n:'G-pier-Pana',r:[1,2]},{n:'HB-Dutch-Kitchen',r:[1,2,3]},{n:'HB-Kebaya',r:[1,2]},{n:'L2-Privium-West',r:[1,2,3]},{n:'E-pier-Grab-Fly',r:[1,2]},{n:'F-pier-Grab-Fly',r:[1,2]},{n:'G-pier-Grab-Fly',r:[1,2]},{n:'L3-Bread',r:[1,2,3]},{n:'L3-Joe-and-Juice',r:[1]},{n:'L3-MCDonalds',r:[1]},{n:'L3-Starbucks',r:[1,2]},{n:'L3-VIT',r:[1]},{n:'L4-Birra-Moretti',r:[1,2]},{n:'L4-Karton-verzamelpunt',r:[1,2]},{n:'L4-Stach',r:[1]},{n:'L4-Urban-Food-Market',r:[1,2]},{n:'L3-Amex-Lounge',r:[1,2]}]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[{n:'E-pier-Cafe-Olea',r:[4]},{n:'E-pier-Silverscreen',r:[4,5]},{n:'F-pier-East-Bar',r:[4,5]},{n:'F-pier-Moods',r:[4]},{n:'F-pier-The-Butcher',r:[4]},{n:'G-pier-Karton-Verzamelpunt',r:[4,5]},{n:'G-pier-Kiosk',r:[4]},{n:'G-pier-Pana',r:[4,5]},{n:'HB-Dutch-Kitchen',r:[4,5]},{n:'HB-Kebaya',r:[4,5]},{n:'L2-Privium-West',r:[4,5]},{n:'HB-Stach-Corner',r:[4]},{n:'E-pier-Grab-Fly',r:[4,5]},{n:'F-pier-Grab-Fly',r:[4]},{n:'G-pier-Grab-Fly',r:[4,5]},{n:'L3-Bread',r:[4,5]},{n:'L3-Carluccios',r:[4]},{n:'L3-Joe-and-Juice',r:[4]},{n:'L3-MCDonalds',r:[4]},{n:'L3-Starbucks',r:[4,5]},{n:'L3-VIT',r:[4,5]},{n:'L4-Birra-Moretti',r:[4,5]},{n:'L4-Karton-verzamelpunt',r:[4,5]},{n:'L4-Stach',r:[4]},{n:'L4-Urban-Food-Market',r:[4,5]},{n:'L3-Amex-Lounge',r:[4,5]}]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[]
    }
  },
  '4448': {
    name:'Plaza', color:'#5a2d88',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[{n:'Plaza-Hello-Goodbye-Bar',r:[1,2]},{n:'Plaza-Starbucks-A1',r:[1]},{n:'Plaza-Urban-Beans-D1',r:[1]},{n:'Plaza-AH-to-Go-A2',r:[1,2]},{n:'Plaza-Koffiesalon-A2',r:[1]},{n:'Plaza-La-Place-Express',r:[1]},{n:'Plaza-BPS',r:[1]},{n:'Plaza-Panorama-Restaurant',r:[1]},{n:'Plaza-Privium',r:[1]},{n:'Plaza-Hema',r:[1,2]},{n:'Plaza-La-Place-Resto',r:[1,2,3]},{n:'Plaza-Albert-Heijn',r:[1,2]},{n:'Plaza-Burger-King',r:[1]},{n:'Plaza-FEBO',r:[1,2]},{n:'Plaza-Leon',r:[1,2]},{n:'Plaza - Zero-zero',r:[1,2]},{n:'Plaza-Stach',r:[1]},{n:'Plaza-Starbucks',r:[1,2,3,1]},{n:'Plaza-Douwe-Egberts-D3',r:[1,2]},{n:'Plaza-Grand-Cafe-A3',r:[1,2,3]},{n:'Plaza-Koekemannetje',r:[1,2,3]},{n:'Plaza-Up-to-do-Good/Koffiesalon',r:[1]},{n:'Plaza-Urban-Beans-A3',r:[1]},{n:'Plaza-AH-to-Go-A4',r:[1]},{n:'Plaza-Urban-Beans-D4',r:[1]}]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[{n:'Plaza-Cafe-Rembrandt',r:[4]},{n:'Plaza-Hello-Goodbye-Bar',r:[4]},{n:'Plaza-Poke-Perfect-A1',r:[4]},{n:'Plaza-Starbucks-A1',r:[4]},{n:'Plaza-Urban-Beans-D1',r:[4]},{n:'Plaza-AH-to-Go-A2',r:[4,5]},{n:'Plaza-Koffiesalon-A2',r:[4]},{n:'Plaza-La-Place-Express',r:[4,5]},{n:'Plaza-BPS',r:[4,5]},{n:'Plaza-Panorama-Restaurant',r:[4,5]},{n:'Plaza-Privium',r:[4,5]},{n:'Plaza-Hema',r:[4]},{n:'Plaza-La-Place-Resto',r:[4,5]},{n:'Plaza-Wing-Stop',r:[4]},{n:'Plaza-Albert-Heijn',r:[4,5]},{n:'Plaza-Burger-King',r:[4,5]},{n:'Plaza-Crossroads',r:[4]},{n:'Plaza-FEBO',r:[4,5]},{n:'Plaza-Leon',r:[4,5]},{n:'Plaza - Zero-zero',r:[4,5]},{n:'Plaza-Stach',r:[4]},{n:'Plaza-Starbucks',r:[4,5,6]},{n:'Plaza-Douwe-Egberts-D3',r:[4]},{n:'Plaza-Grand-Cafe-A3',r:[4,5]},{n:'Plaza-Koekemannetje',r:[4,5]},{n:'Plaza-Up-to-do-Good/Koffiesalon',r:[4,5]},{n:'Plaza-Urban-Beans-A3',r:[4]},{n:'Plaza-AH-to-Go-A4',r:[4]},{n:'Plaza-Urban-Beans-D4',r:[4,5]}]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[]
    }
  },
  '5558': {
    name:'Nacht', color:'#983028',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[{n:'B-pier-Grab-Fly',r:[7]},{n:'B-pier-Karton-Verzamelpunt',r:[7]},{n:'C-pier-Comunal',r:[7]},{n:'C-pier-Karton-Verzamelpunt',r:[7]},{n:'C-pier-Grab-Fly',r:[7]},{n:'L1-Deli-Salon',r:[7]},{n:'L1-Eataly',r:[7]},{n:'D-pier-Grab-Fly',r:[7]},{n:'L1-LOAF',r:[7]},{n:'L1-Starbucks',r:[7]},{n:'L1-Burger-King',r:[7]},{n:'L1-De-Bar',r:[7]},{n:'L1-La-Place',r:[7]},{n:'L1-Park-Cafe',r:[7]},{n:'L2-Amsterdam-Bread-Company',r:[7]},{n:'L2-MCDonalds',r:[7]},{n:'L3-Bread',r:[7]},{n:'L3-Carluccios',r:[7]},{n:'Plaza-Albert-Heijn',r:[7]},{n:'Plaza-Grand-Cafe-A3',r:[7]},{n:'Plaza-La-Place-Express',r:[7]},{n:'Plaza-La-Place-Resto',r:[7]},{n:'Plaza-Starbucks',r:[7]}]
    }
  },
  '6668': {
    name:'KLM', color:'#1a6888',
    dag: {
      label:'☀ Ochtend 06:45-14:45',
      pauzeStart:'09:30', pauzeEind:'10:00', vensterStart:'09:15', vensterEind:'10:15',
      pTekst:'// Pauze 09:30-10:00  |  Venster: 09:15-10:15',
      ronden:[{id:1,tijd:'07:15-09:15'},{id:2,tijd:'10:15-12:00'},{id:3,tijd:'12:00-14:10'}],
      winkels:[{n:'L1-KLM-25',r:[1,2,3]},{n:'L3-KLM-52',r:[1,2,3]},{n:'L3-KLM-52-Polder',r:[1,2,3]},{n:'Plaza-VIP-center',r:[1]}]
    },
    avond: {
      label:'◐ Middag 14:45-22:45',
      pauzeStart:'17:45', pauzeEind:'18:45', vensterStart:'17:30', vensterEind:'19:00',
      pTekst:'// Pauze 17:45-18:45  |  Venster: 17:30-19:00',
      ronden:[{id:4,tijd:'15:15-17:45'},{id:5,tijd:'18:45-20:15'},{id:6,tijd:'20:15-22:15'}],
      winkels:[{n:'L1-KLM-25',r:[4,5]},{n:'L3-KLM-52',r:[4,5,6]},{n:'L3-KLM-52-Polder',r:[4]},{n:'Plaza-VIP-center',r:[4]}]
    },
    nacht: {
      label:'☾ Nacht 22:45-06:45',
      pauzeStart:'02:30', pauzeEind:'03:00', vensterStart:'02:15', vensterEind:'03:15',
      pTekst:'// Pauze 02:30-03:00  |  Venster: 02:15-03:15',
      ronden:[{id:7,tijd:'22:45-04:00'},{id:8,tijd:'04:00-04:30'},{id:9,tijd:'05:00-06:15'}],
      winkels:[]
    }
  },
  '9999': { name:'Controle (steekproef)', color:'#dc2626', dag:{label:'Controle', pTekst:'', ronden:[], winkels:[]}, avond:{label:'Controle', pTekst:'', ronden:[], winkels:[]}, nacht:{label:'Controle', pTekst:'', ronden:[], winkels:[]} }
};
function mergeShiftsForChecklist(pin){
  var defO=RM[pin]?RM[pin].dag:null;var defM=RM[pin]?RM[pin].avond:null;if(!defO&&!defM)return null;
  var wMap={};
  if(defO&&defO.winkels){defO.winkels.forEach(function(w){var k=w.n;if(!wMap[k])wMap[k]={name:w.n,rondes:[]};w.r.forEach(function(rid){if(wMap[k].rondes.indexOf(rid)<0)wMap[k].rondes.push(rid);});});}
  if(defM&&defM.winkels){defM.winkels.forEach(function(w){var k=w.n;if(!wMap[k])wMap[k]={name:w.n,rondes:[]};w.r.forEach(function(rid){if(wMap[k].rondes.indexOf(rid)<0)wMap[k].rondes.push(rid);});});}
  var mWinkels=[];Object.keys(wMap).forEach(function(k){var w=wMap[k];w.rondes.sort(function(a,b){return a-b;});mWinkels.push({n:w.name,r:w.rondes});});mWinkels.sort(function(a,b){return a.n.localeCompare(b.n);});
  var mRondes=[];var seen={};function addR(rr){if(!rr)return;rr.forEach(function(r){if(!seen[r.id]){seen[r.id]=true;mRondes.push(r);}});}
  addR(defO?defO.ronden:null);addR(defM?defM.ronden:null);mRondes.sort(function(a,b){return a.id-b.id;});
  var pauze=[];if(defO&&defO.pTekst)pauze.push('Ochtend: '+defO.pTekst);if(defM&&defM.pTekst)pauze.push('Middag: '+defM.pTekst);
  return{ronden:mRondes,winkels:mWinkels,pTekst:pauze.join(' | ')};
}
function parse(txt){try{txt=txt.replace(/\r\n/g,'\n').replace(/\r/g,'\n');var lines=txt.trim().split('\n');if(lines.length<2)return[];var header=lines[0];var delim=header.split(';').length>header.split(',').length?';':',';function pLine(l){var res=[],cur='',inQ=false;for(var i=0;i<l.length;i++){var c=l[i];if(c==='"'){inQ=!inQ;}else if(c===delim&&!inQ){res.push(cur.trim());cur='';}else cur+=c;}res.push(cur.trim());return res;}var hdr=pLine(header.toLowerCase());var iTs=hdr.findIndex(function(h){return h.indexOf('tijdstip')>=0||h.indexOf('time')>=0||h.indexOf('datum')>=0;});var iShop=hdr.findIndex(function(h){return h.indexOf('winkel')>=0||h.indexOf('naam')>=0;});var iPin=hdr.findIndex(function(h){return h.indexOf('pincode')>=0||h.indexOf('pin')>=0;});var iNote=hdr.findIndex(function(h){return h.indexOf('opmerking')>=0||h.indexOf('note')>=0;});if(iTs<0)iTs=0;if(iShop<0)iShop=1;if(iPin<0)iPin=2;if(iNote<0)iNote=3;var rows=[],buf='',opens=0;for(var i=1;i<lines.length;i++){var l=lines[i];for(var j=0;j<l.length;j++)if(l[j]==='"')opens++;buf=buf?buf+' '+l:l;if(opens%2===0){if(buf.trim())rows.push(buf);buf='';opens=0;}}if(buf.trim())rows.push(buf);var VALID={'1118':1,'2228':1,'3338':1,'4448':1,'5558':1,'6668':1,'668':1,'9999':1,'999':1};var result=[];for(var i=0;i<rows.length;i++){var p=pLine(rows[i]);if(p.length<3)continue;var rawTs=p[iTs].replace(/"/g,'').trim();var ts=new Date(rawTs);if(isNaN(ts.getTime())){var m=rawTs.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);if(m)ts=new Date(m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2)+'T'+(m[4]||'00')+':'+(m[5]||'00')+':'+(m[6]||'00'));}if(!ts||isNaN(ts.getTime()))continue;var shop=p[iShop].replace(/"/g,'').trim();var pin=p[iPin].replace(/"/g,'').trim();if(pin==='999')pin='9999';if(pin==='668')pin='6668';var note=(p[iNote]||'').replace(/"/g,'').trim();if(!shop||!VALID[pin])continue;result.push({ts:ts,shop:shop,pin:pin,note:note});}return result;}catch(e){console.error('Parse error:',e);return[];}}
function buildShopRouteMap(){var map={};Object.keys(RM).forEach(function(pin){['dag','avond','nacht'].forEach(function(sh){var def=RM[pin][sh];if(!def||!def.winkels)return;def.winkels.forEach(function(w){var key=norm(w.n);if(!map[key])map[key]=[];map[key].push({pin:pin,shift:sh,name:w.n});});});});return map;}
var SHOP_ROUTE_MAP=null;
function reassignPinsByShopName(scans){if(!SHOP_ROUTE_MAP)SHOP_ROUTE_MAP=buildShopRouteMap();var reassigned=0;scans.forEach(function(scan){if(scan.pin==='9999')return;var shift=getShift(scan.ts);var shiftType=routeType(shift);var origDef=RM[scan.pin]&&RM[scan.pin][shiftType];var origHasShop=origDef&&origDef.winkels&&origDef.winkels.some(function(w){return matches(scan.shop,w.n);});if(origHasShop)return;var candidates=new Set();Object.keys(RM).forEach(function(pin){if(pin===scan.pin)return;var d=RM[pin][shiftType];if(d&&d.winkels&&d.winkels.some(function(w){return matches(scan.shop,w.n);})){candidates.add(pin);}});if(candidates.size===1){var newPin=Array.from(candidates)[0];scan.originalPin=scan.pin;scan.pin=newPin;reassigned++;}});if(reassigned>0)console.log('Pin-correctie:',reassigned,'scans');return reassigned;}
var ECO_ROWS=null, ECO_CONVERTED=null;
var ECO_ALIAS={
  'klm lounge 52':'L3-KLM-52','klm lounge 52 polder':'L3-Polder','klm lounge 25':'L1-KLM-Lounge-25',
  'street food market':'L2-Streetfood','east bar & bites':'F-pier-East-Bar',
  'vip lounge':'Plaza-VIP-center','carluccio\'s lounge 3':'L3-Carluccios',
  'heineken bar':'D-pier-Heineken-Bar','panorama restaurant':'Plaza-Panorama-Terras',
  'murphy\'s':'D-pier-Murphy\'s-Pub','grab & fly d pier 2.0':'D-pier-Grab-Fly',
  'city spoel':'L3-City-Spoel','polder':'L3-Polder','ef-filter':'EF-Filter'
};
var ECO_LOCPREF={'Terminal 1':['L1'],'Terminal 2':['L2'],'Terminal 3':['L3','L4','HB'],
  'Terminal 2/EF gebied':['L2','HB'],'Plaza':['Plaza'],'D-pier':['D-pier'],'E-pier':['E-pier'],
  'F-pier':['F-pier'],'G-pier':['G-pier'],'B-pier':['B-pier'],'C-pier':['C-pier'],'BC-corridor':['B-pier','C-pier']};
function ecoCore(x){
  var s=(x||'').toLowerCase();
  ['plaza','lounge 1','lounge 2','lounge 3','lounge 4','lounge','d pier 2.0','d pier','c-pier','c pier','e pier','f pier','g pier','b pier','the pavillion','arrivals','aankomst','vertrek','2.0','&','-'].forEach(function(j){ s=s.split(j).join(' '); });
  s=s.replace(/\d+/g,' ').replace(/[^a-z ]/g,' ');
  var out={}; s.split(/\s+/).forEach(function(t){ if(t.length>1) out[t]=1; }); return out;
}
function ecoPrefixOf(k){ var m=(k||'').match(/^(L\d|HB|Plaza|[A-G]-pier)/); return m?m[1]:''; }
function ecoShopVocab(){
  var v=[]; Object.keys(RM).forEach(function(p){ if(p==='9999')return; ['dag','avond','nacht'].forEach(function(sh){ (RM[p][sh]&&RM[p][sh].winkels||[]).forEach(function(w){ v.push({n:w.n,pin:p}); }); }); });
  return v;
}
var ECO_FORCE={
  'klm lounge 52':{shop:'L3-KLM-52',pin:'6668'},
  'grab & fly d pier 2.0':{shop:'D-pier-Grab-Fly',pin:'2228'},
  'grab & fly d pier':{shop:'D-pier-Grab-Fly',pin:'2228'}
  // 'vip lounge' wordt tijd-afhankelijk afgehandeld (KLM overdag, Nacht 's nachts)
};
var ECO_MAPPING={
'b-pier||dammers tap':{n:'B-pier-Dammers-Tap',p:'1118'},
'b-pier||grab & fly b pier':{n:'B-pier-Grab-Fly',p:'1118'},
'b-pier||karton verzamelpunt b pier':{n:'B-pier-Karton-Verzamelpunt',p:'1118'},
'b-pier||kiosk b29':{n:'B-pier-Kiosk-29',p:'1118'},
'b-pier||kiosk bus stop b - pier':{n:'B-pier-Kiosk-koffiepunt',p:'1118'},
'b-pier||koffiesalon b15':{n:'B-pier-Koffiesalon-Car',p:'1118'},
'bc-corridor||starbucks bc-pier':{n:'C-pier-Starbucks',p:'1118'},
'c-pier||cafe comunal':{n:'C-pier-Comunal',p:'1118'},
'c-pier||karton verzamelpunt c pier':{n:'C-pier-Karton-Verzamelpunt',p:'1118'},
'c-pier||kiosco comunal':{n:'C-pier-Kiosco',p:'1118'},
'd-pier||café flor':{n:'D-pier-Cafe-Flor',p:'2228'},
'd-pier||grab & fly d pier 2.0':{n:'D-pier-Grab-Fly',p:'2228'},
'd-pier||harvest market':{n:'D-pier-Harvest-Market',p:'2228'},
'd-pier||murphy\'s':{n:'D-pier-Murphy\'s-Pub',p:'2228'},
'd-pier||stach d pier':{n:'D-pier-Stach',p:'2228'},
'd-pier||starbucks d pier':{n:'D-pier-Starbucks',p:'2228'},
'e-pier||cafe olea':{n:'E-pier-Cafe-Olea',p:'3338'},
'e-pier||grab & fly e pier':{n:'E-pier-Grab-Fly',p:'3338'},
'e-pier||silverscreen':{n:'E-pier-Silverscreen',p:'3338'},
'f-pier||grab & fly f pier':{n:'F-pier-Grab-Fly',p:'3338'},
'f-pier||moods':{n:'F-pier-Moods',p:'3338'},
'f-pier||the butcher':{n:'F-pier-The-Butcher',p:'3338'},
'g-pier||grab & fly g pier 2.0':{n:'G-pier-Grab-Fly',p:'3338'},
'g-pier||kiosk g05':{n:'G-pier-Kiosk',p:'3338'},
'g-pier||pana':{n:'G-pier-Pana',p:'3338'},
'g-pier||verzamelpunt karton g pier':{n:'G-pier-Karton-Verzamelpunt',p:'3338'},
'plaza||ah to go - aankomst 1':{n:'Plaza-AH-to-Go-A2',p:'4448'},
'plaza||ah to go - aankomst 2':{n:'Plaza-AH-to-Go-A2',p:'4448'},
'plaza||ah to go - aankomst 4':{n:'Plaza-AH-to-Go-A4',p:'4448'},
'plaza||albert heijn':{n:'Plaza-Albert-Heijn',p:'4448'},
'plaza||bloem aankomst 2':{n:'Plaza-Bloem-A2',p:'4448'},
'plaza||bloem aankomst 3':{n:'Plaza-Bloem-A3',p:'4448'},
'plaza||bloem aankomst 4':{n:'Plaza-Bloem-A4',p:'4448'},
'plaza||bps':{n:'Plaza-BPS',p:'4448'},
'plaza||burger king':{n:'Plaza-Burger-King',p:'4448'},
'plaza||cafe rembrandt':{n:'Plaza-Cafe-Rembrandt',p:'4448'},
'plaza||crossroads':{n:'Plaza-Crossroads',p:'4448'},
'plaza||douwe egberts west':{n:'Plaza-Douwe-Egberts-D3',p:'4448'},
'plaza||febo':{n:'Plaza-FEBO',p:'4448'},
'plaza||grand café plaz':{n:'Plaza-Grand-Cafe-A3',p:'4448'},
'plaza||grand cafe plaza':{n:'Plaza-Grand-Cafe-A3',p:'4448'},
'plaza||hello goodbye bar':{n:'Plaza-Hello-Goodbye-Bar',p:'4448'},
'plaza||hema food':{n:'Plaza-Hema',p:'4448'},
'plaza||hema retail - schiphol plaza':{n:'Plaza-Hema',p:'4448'},
'plaza||koekemannetje':{n:'Plaza-Koekemannetje',p:'4448'},
'plaza||koffiesalon plaza aankomst 2':{n:'Plaza-Koffiesalon-A2',p:'4448'},
'plaza||la place express':{n:'Plaza-La-Place-Express',p:'4448'},
'plaza||la place plaza':{n:'Plaza-La-Place-Resto',p:'4448'},
'plaza||la place plaza zitgebied':{n:'Plaza-La-Place-Resto',p:'4448'},
'plaza||leon plaza':{n:'Plaza-Leon',p:'4448'},
'plaza||old amsterdam':{n:'Plaza-Old-Amsterdam',p:'4448'},
'plaza||per tutti':{n:'Plaza-Per-Tutti',p:'4448'},
'plaza||poké perfect':{n:'Plaza-Poke-Perfect-A1',p:'4448'},
'plaza||privium lounge plaza':{n:'Plaza-Privium',p:'4448'},
'plaza||stach plaza':{n:'Plaza-Stach',p:'4448'},
'plaza||stach plaza':{n:'Plaza-Stach',p:'4448'},
'plaza||starbucks arrival 1':{n:'Plaza-Starbucks-A1',p:'4448'},
'plaza||starbucks arrivals 4':{n:'Plaza-Starbucks-A4',p:'4448'},
'plaza||starbucks plaza':{n:'Plaza-Starbucks',p:'4448'},
'plaza||up to do good':{n:'Plaza-Up-to-do-Good/Koffiesalon',p:'4448'},
'plaza||vip lounge':{n:'Plaza-VIP-center',p:'6668'},
'plaza||wing stop':{n:'Plaza-Wing-Stop',p:'4448'},
'terminal 1||burger king lounge 1':{n:'L1-Burger-King',p:'1118'},
'terminal 1||deli salon':{n:'L1-Deli-Salon',p:'1118'},
'terminal 1||eataly':{n:'L1-Eataly',p:'1118'},
'terminal 1||grab & fly c-pier':{n:'C-pier-Grab-Fly',p:'1118'},
'terminal 1||klm lounge 25':{n:'L1-KLM-25',p:'6668'},
'terminal 1||koekemannetje lounge 1':{n:'L1-Koekemannetje',p:'1118'},
'terminal 1||koffiesalon lounge 1':{n:'L1-Koffiesalon-Resto',p:'1118'},
'terminal 1||la place express lounge 1':{n:'L1-La-Place',p:'1118'},
'terminal 1||leon lounge 1':{n:'L1-Leon',p:'1118'},
'terminal 1||loaf':{n:'L1-LOAF',p:'1118'},
'terminal 1||panorama restaurant':{n:'Plaza-Panorama-Restaurant',p:'4448'},
'terminal 1||park cafe':{n:'L1-Park-Cafe',p:'2228'},
'terminal 1||privium lounge 28':{n:'L1-Privium-28',p:'2228'},
'terminal 1||starbucks lounge 1':{n:'L1-Starbucks',p:'1118'},
'terminal 1||the upper floor bar':{n:'L1-De-Bar',p:'1118'},
'terminal 1||the wanderer':{n:'L1-The-Wanderer',p:'1118'},
'terminal 1||two tigers':{n:'L1-Two-Tigers',p:'1118'},
'terminal 1||urban beans vertrek 1':{n:'Plaza-Urban-Beans-D1',p:'4448'},
'terminal 2||amsterdam bread company':{n:'L2-Amsterdam-Bread-Company',p:'2228'},
'terminal 2||aspire lounge 26':{n:'L1-Aspire-26',p:'2228'},
'terminal 2||aspire lounge 41':{n:'L2-Aspire-41',p:'2228'},
'terminal 2||bubbles lounge 2':{n:'L2-Bubbles',p:'2228'},
'terminal 2||frames bar & bites':{n:'L2-Frames',p:'2228'},
'terminal 2||gucci':{n:'L2-Gucci',p:'2228'},
'terminal 2||heineken bar':{n:'D-pier-Heineken-Bar',p:'2228'},
'terminal 2||kiosk sushi & noodles':{n:'L2-Sushi-',p:'2228'},
'terminal 2||lavazza lounge 2':{n:'L2-Lavazza',p:'2228'},
'terminal 2||lift 13/14':{n:'L2-Lift-13-14',p:'2228'},
'terminal 2||louis vuitton':{n:'L2-Louis-Vuitton',p:'2228'},
'terminal 2||mcdonalds lounge 2':{n:'L2-MCDonalds',p:'2228'},
'terminal 2||starbucks the pavillion':{n:'L2-Starbucks',p:'2228'},
'terminal 2||street food market':{n:'L2-Streetfood-the-oven-the-grill',p:'2228'},
'terminal 2/ef gebied||dutch kitchen & dutch bar':{n:'HB-Dutch-Kitchen',p:'3338'},
'terminal 2/ef gebied||kebaya':{n:'HB-Kebaya',p:'3338'},
'terminal 2/ef gebied||privium west':{n:'L2-Privium-West',p:'3338'},
'terminal 2/ef gebied||stach corner':{n:'HB-Stach-Corner',p:'3338'},
'terminal 3||birra moretti':{n:'L4-Birra-Moretti',p:'3338'},
'terminal 3||bread!':{n:'L3-Bread',p:'3338'},
'terminal 3||carluccio\'s lounge 3':{n:'L3-Carluccios',p:'3338'},
'terminal 3||douwe egberts west':{n:'Plaza-Douwe-Egberts-D3',p:'4448'},
'terminal 3||east bar & bites':{n:'F-pier-East-Bar',p:'3338'},
'terminal 3||joe & the juice':{n:'L3-Joe-and-Juice',p:'3338'},
'terminal 3||karton verzamelpunt lounge 4':{n:'L4-Karton-verzamelpunt',p:'3338'},
'terminal 3||klm lounge 52':{n:'L3-KLM-52',p:'6668'},
'terminal 3||mcdonalds lounge west':{n:'L3-MCDonalds',p:'3338'},
'terminal 3||stach lounge 4':{n:'L4-Stach',p:'3338'},
'terminal 3||starbucks lounge 3':{n:'L3-Starbucks',p:'3338'},
'terminal 3||urban beans arr. 3':{n:'Plaza-Urban-Beans-A3',p:'4448'},
'terminal 3||urban beans vertrek 4':{n:'Plaza-Urban-Beans-D4',p:'4448'},
'terminal 3||urban food market':{n:'L4-Urban-Food-Market',p:'3338'},
'terminal 3||vit':{n:'L3-VIT',p:'3338'},
'terminal 3||klm lounge 52 polder':{n:'L3-KLM-52-Polder',p:'6668'},
'plaza||burger king plaza (atm)':{n:'Plaza-Burger-King',p:'4448'},
'plaza||urban beans aankomst 3':{n:'Plaza-Urban-Beans-A3',p:'4448'},
'plaza||starbucks - aankomst 4':{n:'Plaza-Starbucks-A4',p:'4448'},
'plaza||starbucks - aankomst 1':{n:'Plaza-Starbucks-A1',p:'4448'},
'plaza||bloem - aankomst 4':{n:'Plaza-Bloem-A4',p:'4448'},
'terminal 3||douwe egberts west - vertrek 3':{n:'Plaza-Douwe-Egberts-D3',p:'4448'},
'plaza||bloem - aankomst 3':{n:'Plaza-Bloem-A3',p:'4448'},
'plaza||grand café plaza':{n:'Plaza-Grand-Cafe-A3',p:'4448'},
'plaza||bloem - aankomst 2':{n:'Plaza-Bloem-A2',p:'4448'},
'plaza||koffiesalon plaza - aankomst 2':{n:'Plaza-Koffiesalon-A2',p:'4448'},
'terminal 2/ef gebied||privium lounge west':{n:'L2-Privium-West',p:'3338'},
'terminal 1||privium lounge 1':{n:'L1-Privium-South',p:'1118'},
'terminal 1||privium lounge 28':{n:'L1-Privium-28',p:'2228'},
'b-pier||koffiesalon car b15':{n:'B-pier-Koffiesalon-Car',p:'1118'},
'plaza||zero-zero':{n:'Plaza - Zero-zero',p:'4448'},
'terminal 3||amex lounge':{n:'L3-Amex-Lounge',p:'3338'}
};
function ecoMatch(loc,sub,ts){
  if(!sub) return null;
  var key=((loc||'')+'||'+(sub||'')).toLowerCase().trim();
  var subl=(sub||'').toLowerCase().trim();
  if(subl==='lift 13/14'||subl==='lift 13/14 '||subl.indexOf('lift 13')>=0) return {excl:true};
  var hit=ECO_MAPPING[key];
  // fallback: alleen op sub-location matchen als loc niet exact klopt
  if(!hit){ for(var k in ECO_MAPPING){ if(k.split('||')[1]===subl){ hit=ECO_MAPPING[k]; break; } } }
  if(!hit) return null;
  var basePin=hit.p;
  // Dienst op tijd: nacht-scan -> Nacht-route (5558), anders basisroute
  var sh=ts?getShift(ts):'ochtend';
  var pin = (sh==='nacht') ? '5558' : basePin;
  return {shop:hit.n, pin:pin};
}
function ecoColIndex(hdr,names){ for(var i=0;i<hdr.length;i++){ var h=hdr[i].replace(/[\s\-_]/g,''); for(var j=0;j<names.length;j++){ if(h.indexOf(names[j])>=0) return i; } } return -1; }
function ecoRowsFromMatrix(json){
  if(!json.length) return [];
  var hdr=json[0].map(function(h){return (h||'').toString().toLowerCase();});
  var iDate=ecoColIndex(hdr,['visitdate','datum','tijdstip','date']),
      iLoc=ecoColIndex(hdr,['location','locatie']),
      iSub=ecoColIndex(hdr,['sublocation','subloc']),
      iWaste=ecoColIndex(hdr,['waste','afval']),
      iUser=ecoColIndex(hdr,['user','gebruiker']),
      iSrc=ecoColIndex(hdr,['registrationsource','source','bron']),
      iCode=ecoColIndex(hdr,['scannedcode','code']);
  if(iDate<0)iDate=0; if(iLoc<0)iLoc=2; if(iSub<0)iSub=3;
  var rows=[];
  for(var r=1;r<json.length;r++){
    var row=json[r]; if(!row||row[iDate]==null||row[iDate]==='') continue;
    rows.push({ date:row[iDate], loc:(iLoc>=0?row[iLoc]:'')||'', sub:(iSub>=0?row[iSub]:'')||'',
      waste:(iWaste>=0?row[iWaste]:'')||'', user:(iUser>=0?row[iUser]:'')||'', src:(iSrc>=0?row[iSrc]:'')||'', code:(iCode>=0?row[iCode]:'')||'' });
  }
  return rows;
}
function ecoParseCSV(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var lines=text.split('\n').filter(function(l){return l.length>0;});
  if(lines.length<2) return [];
  var delim=(lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
  function pl(l){ var res=[],cur='',q=false; for(var i=0;i<l.length;i++){ var ch=l[i]; if(ch==='"'){q=!q;} else if(ch===delim&&!q){res.push(cur);cur='';} else cur+=ch; } res.push(cur); return res.map(function(x){return x.trim();}); }
  var matrix=lines.map(pl);
  return ecoRowsFromMatrix(matrix);
}
function ecoParseDate(v){
  if(v instanceof Date) return v;
  var s=(v||'').toString().trim().replace(' ','T');
  var d=new Date(s);
  return isNaN(d)?null:d;
}
function ecoConvert(){
  if(!ECO_ROWS) return null;
  var out=[], stats={total:0,matched:0,excl:0,unmatched:0,unmatchedList:{}};
  ECO_ROWS.forEach(function(r){
    stats.total++;
    var ts=ecoParseDate(r.date); if(!ts) return;
    var m=ecoMatch(r.loc,r.sub,ts);
    if(m&&m.excl){ stats.excl++; return; }
    var shop, pin;
    if(m){ shop=m.shop; pin=m.pin; stats.matched++; }
    else { shop=(r.loc?r.loc+'-':'')+(r.sub||'onbekend').replace(/\s+/g,'-'); pin='0000'; stats.unmatched++; stats.unmatchedList[r.loc+' | '+r.sub]=(stats.unmatchedList[r.loc+' | '+r.sub]||0)+1; }
    var note=r.src==='Manual'?'Handmatig':''; if((r.waste||'').toLowerCase()==='yes') note=(note?note+' · ':'')+'Afval opgehaald';
    out.push({ts:ts,shop:shop,pin:pin,note:note});
  });
  ECO_CONVERTED=out;
  return stats;
}
function isEcoSmartText(txt){ var head=(txt||'').slice(0,400).toLowerCase().replace(/[\s\-_]/g,''); return head.indexOf('sublocation')>=0 || (head.indexOf('visitdate')>=0 && head.indexOf('location')>=0) || head.indexOf('registrationsource')>=0; }

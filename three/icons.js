import * as THREE from 'three';

// Separate outward-facing symbols; never mirror the hourglass onto the back.
export function createPickupFaces(ink, accent, faceDepth) {
  const faces = new THREE.Group();
  for (const [effect, iconKind, yaw] of [['hourglass','hourglass',0],['smoke','grenade',Math.PI]]) {
    const face = new THREE.Group();face.userData.pickupEffect=effect;face.rotation.y=yaw;
    const icon=createIcon(iconKind,ink,accent);icon.scale.setScalar(1.05);icon.position.z=faceDepth+.8;
    face.add(icon);faces.add(face);
  }
  return faces;
}


// Shared, modeled pictograms. Every symbol uses the same proportions and
// rounded stroke weight in the menus and on the tiles; nothing is rasterized.
const cache=new Map();
function geometry(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key);}
function polygon(key,points,depth=1.4){return geometry(key,()=>{const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.18,bevelThickness:.2,bevelSegments:1,curveSegments:8});});}
function tube(key,points,radius=1.1){return geometry(key,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),28,radius,7,false));}
export function createIcon(kind,ink,accent=ink){
  const group=new THREE.Group();group.userData.iconKind=kind;
  const add=(geo,mat=ink,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);group.add(mesh);return mesh;};
  if(kind==='back')add(polygon('back',[[5,-8],[-5,0],[5,8],[8,5],[2,0],[8,-5]],2));
  if(kind==='play')add(polygon('play', [[-5,-8],[8,0],[-5,8]],2));
  if(kind==='star'){
    const points=[];for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,r=i%2?4.2:9;points.push([Math.cos(angle)*r,Math.sin(angle)*r]);}
    add(polygon('star',points,2));
  }
  if(kind==='coin'){
    add(geometry('coin-body',()=>{const shape=new THREE.Shape();shape.absarc(0,0,9,0,Math.PI*2,false);return new THREE.ExtrudeGeometry(shape,{depth:2.4,bevelEnabled:true,bevelSize:.65,bevelThickness:.65,bevelSegments:3,curveSegments:24});}));
    add(geometry('coin-rim',()=>new THREE.TorusGeometry(6.5,.5,6,32)),accent,0,0,3.1);
    add(tube('coin-stamp',[[0,-3,3.1],[0,3,3.1]],.85),accent);
  }
  if(kind==='gear'){
    add(geometry('gear-ring',()=>new THREE.TorusGeometry(6,2.6,8,20)),ink,0,0,1.3);
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,tooth=add(geometry('gear-tooth',()=>new THREE.BoxGeometry(4,5,2.8)),ink,Math.sin(angle)*8.2,Math.cos(angle)*8.2,1);
      tooth.rotation.z=-angle;
    }
  }
  if(kind==='book'){
    add(polygon('book-left',[[-12,9],[-3,8],[0,5],[0,-10],[-3,-7],[-12,-6]],2));
    add(polygon('book-right',[[12,9],[3,8],[0,5],[0,-10],[3,-7],[12,-6]],2));
    add(tube('book-spine',[[0,5,2.5],[0,-9,2.5]],.7),accent);
    for(const side of [-1,1])for(const y of [3,-1])add(tube(`book-line-${side}-${y}`,[[side*4,y,2.5],[side*9,y+1,2.5]],.6),accent);
  }
  if(kind==='progress'){
    for(let i=0;i<3;i++)add(polygon(`progress-bar-${i}`,[[i*7-10,-8],[i*7-5,-8],[i*7-5,-3+i*6],[i*7-10,-3+i*6]],2));
  }
  if(kind==='arrow')add(polygon('arrow',[[-7,-5],[-5,-7],[5,3],[5,-2],[8,-2],[8,8],[-2,8],[-2,5],[3,5]]));
  if(kind==='trash'){
    add(polygon('trash-body',[[-6,4],[6,4],[5,-8],[-5,-8]],1.5));
    add(polygon('trash-lid',[[-8,7],[8,7],[8,5],[-8,5]],1.6));
    add(tube('trash-handle',[[-2,8,1],[-2,10,1],[2,10,1],[2,8,1]],.8));
    for(const x of [-2,2])add(tube(`trash-slot-${x}`,[[x,1,2],[x,-5,2]],.55),accent);
  }
  if(kind==='paperPlane'){
    add(polygon('plane-main',[[-10,4],[11,9],[4,-11],[-1,-2]],1.5));
    add(polygon('plane-fold',[[-1,-2],[11,9],[-5,0]],.7),accent,0,0,1.8);
    add(tube('plane-crease',[[-1,-2,2.7],[6,5,2.7]],.45),accent);
  }
  if(kind==='pause'){
    for(const x of [-4,4])add(geometry('pause-bar',()=>new THREE.CapsuleGeometry(2,10,4,8)),ink,x,0,1);
  }
  if(kind==='undo'){
    add(tube('undo',[[-6,4,1],[-1,6,1],[5,3,1],[5,-3,1],[0,-6,1],[-3,-5,1]],1.2));
    add(polygon('undo-head',[[-9,4],[-3,9],[-3,1]]));
  }
  if(kind==='sun'){
    for(let i=0;i<8;i++){const ray=add(geometry('ray',()=>new THREE.CapsuleGeometry(.65,4,3,6)),ink,Math.sin(i*Math.PI/4)*6,Math.cos(i*Math.PI/4)*6,1);ray.rotation.z=-i*Math.PI/4;}
  }
  if(kind==='sound'||kind==='silent'){
    add(polygon('speaker',[[-8,-3],[-4,-3],[1,-7],[1,7],[-4,3],[-8,3]]));
    if(kind==='sound'){
      add(tube('wave1',[[4,4,1],[6,0,1],[4,-4,1]],.8));
      add(tube('wave2',[[7,7,1],[10,0,1],[7,-7,1]],.8));
    }else{
      add(tube('mute1',[[5,3,1],[10,-3,1]],.9));add(tube('mute2',[[5,-3,1],[10,3,1]],.9));
    }
  }
  if(kind==='hourglass'){
    add(polygon('glass-frame',[[-8,9],[8,9],[7,5],[2,0],[7,-5],[8,-9],[-8,-9],[-7,-5],[-2,0],[-7,5]],2));
    for(const y of [-11,11]){const cap=add(geometry('glass-cap',()=>new THREE.CapsuleGeometry(1.6,17,4,8)),ink,0,y,1);cap.rotation.z=Math.PI/2;}
    add(polygon('sand-upper',[[-5,7],[5,7],[0,1]],.8),accent,0,0,2.2);
    add(polygon('sand-lower',[[-5,-7],[5,-7],[0,-1]],.8),accent,0,0,2.2);
  }
  if(kind==='grenade'){
    const body=add(geometry('grenade-body',()=>new THREE.CapsuleGeometry(5,4,4,10)),ink,0,-1,1);body.scale.z=.72;
    add(geometry('grenade-neck',()=>new THREE.BoxGeometry(5,3,3)),ink,0,7,1);
    add(polygon('grenade-lever',[[-2,10],[6,10],[9,3],[7,2],[4,8],[-2,8]],1.2),accent,0,0,1.5);
    add(geometry('grenade-ring',()=>new THREE.TorusGeometry(2,.8,6,12)),accent,-4,10,2);
    for(const y of [-3,1]){const band=add(geometry('grenade-band',()=>new THREE.TorusGeometry(4.8,.55,5,16)),accent,0,y,1);band.rotation.x=Math.PI/2;band.scale.y=.77;}
  }
  return group;
}
